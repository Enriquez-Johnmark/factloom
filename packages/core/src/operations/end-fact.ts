import type { ChangeSet } from '../change-set.ts';
import type { Fact, FactId, Source, SourceId } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { err, ok, type Result } from '../result.ts';
import type { Timestamp } from '../timestamp.ts';
import { buildSource } from './build-source.ts';
import type { ChangeContext, FactDraft, NewSource } from './operation-inputs.ts';
import { buildRecordChanges, type PreparedDrafts, prepareFactDrafts } from './prepare-fact-drafts.ts';
import { readLiveFact } from './read-live-fact.ts';

export type EndFactInput = ChangeContext & {
  readonly factId: FactId;
  readonly validTo: Timestamp;
  /** Why we believe it ended. Attached to the ended copy and to the successor. */
  readonly source: NewSource;
  readonly successor: FactDraft | null;
};

/**
 * Builds the one change set of `endFact`: the source, the new entities, the ended copy with
 * the original's vector, the invalidation of the original linked to the copy, and then the
 * successor. Without a successor it is a revision, with one a succession. Pure: every
 * identifier, time and vector is given.
 */
export function buildEndFactChangeSet(parts: {
  readonly context: ChangeContext;
  readonly operationId: string;
  readonly occurredAt: Timestamp;
  readonly source: Source;
  readonly originalFactId: FactId;
  /** The original with a new identifier, the new `validTo` and a new `createdAt`. */
  readonly endedCopy: Fact;
  readonly originalSourceIds: readonly SourceId[];
  readonly isSingleValued: boolean;
  /** The prepared successor, holding one fact, or `null`. */
  readonly successor: PreparedDrafts | null;
  /** True when the source is already recorded, as a proposal's is (FL-043): it is then not recorded again. */
  readonly sourceIsRecorded?: boolean;
}): ChangeSet {
  const successorChanges =
    parts.successor === null ? [] : buildRecordChanges(parts.successor, parts.source.id);
  const [firstSourceId, ...otherSourceIds] = [...parts.originalSourceIds, parts.source.id];
  return {
    namespace: parts.context.namespace,
    operationId: parts.operationId,
    operation: parts.successor === null ? 'revision' : 'succession',
    trigger: parts.context.trigger,
    reasonCode: parts.context.reasonCode,
    explainedBySourceId: parts.source.id,
    occurredAt: parts.occurredAt,
    changes: [
      ...(parts.sourceIsRecorded === true ? [] : [{ kind: 'record_source', source: parts.source } as const]),
      ...successorChanges.filter((change) => change.kind === 'create_entity'),
      {
        kind: 'record_fact',
        fact: parts.endedCopy,
        sourceIds: [firstSourceId ?? parts.source.id, ...otherSourceIds],
        // The statement is unchanged, so its vector is copied and not computed again.
        embedding: { copyFromFactId: parts.originalFactId },
        singleValued: parts.isSingleValued,
      },
      { kind: 'invalidate_fact', factId: parts.originalFactId, supersededByFactId: parts.endedCopy.id },
      ...successorChanges.filter((change) => change.kind === 'record_fact'),
    ],
  };
}

/** The change set of an end, built but not committed, and the identifiers it gives. */
export type PlannedEndFact = {
  readonly changeSet: ChangeSet;
  readonly endedFactId: FactId;
  readonly successorFactId: FactId | null;
};

/**
 * Reads the fact and builds the change set that ends it, without committing it. The source
 * is made by `makeSource` at the point where `endFact` records one, so identifiers are drawn
 * in the same order; with `sourceIsRecorded` it is an existing source, not recorded again.
 */
export async function planEndFact(
  deps: OperationDeps,
  input: Omit<EndFactInput, 'source'>,
  source: { readonly make: (createdAt: Timestamp) => Promise<Source>; readonly isRecorded: boolean },
): Promise<Result<PlannedEndFact>> {
  const { namespace, factId, validTo } = input;
  const found = await readLiveFact(deps, { namespace, factId });
  if (!found.ok) return found;
  const original = found.value.fact;
  if (original.validFrom !== null && validTo <= original.validFrom) {
    return err(
      'invalid_input',
      `The fact ${factId} is valid from ${original.validFrom}, so it cannot end at ${validTo}. Give a later end.`,
    );
  }

  const now = deps.now();
  const endedCopy: Fact = {
    ...original,
    id: deps.newId(),
    validTo,
    createdAt: now,
    invalidatedAt: null,
    supersededByFactId: null,
  };
  let successor: PreparedDrafts | null = null;
  if (input.successor !== null) {
    const given = input.successor.fact;
    const prepared = await prepareFactDrafts(deps, {
      namespace,
      drafts: [
        {
          fact: { ...given, validFrom: given.validFrom ?? validTo },
          newEntities: input.successor.newEntities,
        },
      ],
      createdAt: now,
    });
    if (!prepared.ok) return prepared;
    successor = prepared.value;
  }
  const made = await source.make(now);
  const predicate = deps.domain.predicates.find((known) => known.name === original.predicate);
  const changeSet = buildEndFactChangeSet({
    context: input,
    operationId: deps.newId(),
    occurredAt: now,
    source: made,
    originalFactId: factId,
    endedCopy,
    originalSourceIds: found.value.sources.map((known) => known.id),
    isSingleValued: predicate?.cardinality === 'single',
    successor,
    sourceIsRecorded: source.isRecorded,
  });
  return ok({ changeSet, endedFactId: endedCopy.id, successorFactId: successor?.facts[0]?.fact.id ?? null });
}

/**
 * Says a fact stopped being true at a moment, in one commit. A fact row is never edited, so
 * the fact is invalidated and a copy with `validTo` set takes its place. With a successor it
 * is a succession: the successor starts at `validTo` unless it gives its own start.
 */
export async function endFact(
  deps: OperationDeps,
  input: EndFactInput,
): Promise<Result<{ readonly endedFactId: FactId; readonly successorFactId: FactId | null }>> {
  const planned = await planEndFact(deps, input, {
    make: (createdAt) => buildSource(deps, { namespace: input.namespace, source: input.source, createdAt }),
    isRecorded: false,
  });
  if (!planned.ok) return planned;
  const committed = await deps.store.commit(planned.value.changeSet);
  if (!committed.ok) return committed;
  return ok({ endedFactId: planned.value.endedFactId, successorFactId: planned.value.successorFactId });
}
