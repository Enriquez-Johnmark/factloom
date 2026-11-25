import type { ChangeSet } from '../change-set.ts';
import type { FactId, Source } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { ok, type Result } from '../result.ts';
import type { Timestamp } from '../timestamp.ts';
import { buildSource } from './build-source.ts';
import type { ChangeContext, FactDraft, NewSource } from './operation-inputs.ts';
import { buildRecordChanges, type PreparedDrafts, prepareFactDrafts } from './prepare-fact-drafts.ts';
import { readLiveFact } from './read-live-fact.ts';

export type InvalidateFactInput = ChangeContext & {
  readonly factId: FactId;
  /** Why we believe it was wrong. */
  readonly source: NewSource;
  readonly replacement: FactDraft | null;
};

/**
 * Builds the one change set of `invalidateFact`. Without a replacement it is a retraction:
 * the source and the invalidation. With one it is a correction: the source, the new entities,
 * the replacement, and then the invalidation linked to it, because the link must point at a
 * fact that exists. Pure: every identifier, time and vector is given.
 */
export function buildInvalidateFactChangeSet(parts: {
  readonly context: ChangeContext;
  readonly operationId: string;
  readonly occurredAt: Timestamp;
  readonly source: Source;
  readonly factId: FactId;
  /** The prepared replacement, holding one fact, or `null` for a retraction. */
  readonly replacement: PreparedDrafts | null;
  /** True when the source is already recorded, as a proposal's is (FL-043): it is then not recorded again. */
  readonly sourceIsRecorded?: boolean;
}): ChangeSet {
  const replacementFactId = parts.replacement?.facts[0]?.fact.id ?? null;
  return {
    namespace: parts.context.namespace,
    operationId: parts.operationId,
    operation: parts.replacement === null ? 'retraction' : 'correction',
    trigger: parts.context.trigger,
    reasonCode: parts.context.reasonCode,
    explainedBySourceId: parts.source.id,
    occurredAt: parts.occurredAt,
    changes: [
      ...(parts.sourceIsRecorded === true ? [] : [{ kind: 'record_source', source: parts.source } as const]),
      ...(parts.replacement === null ? [] : buildRecordChanges(parts.replacement, parts.source.id)),
      { kind: 'invalidate_fact', factId: parts.factId, supersededByFactId: replacementFactId },
    ],
  };
}

/** The change set of an invalidation, built but not committed, and the identifiers it gives. */
export type PlannedInvalidation = {
  readonly changeSet: ChangeSet;
  readonly invalidatedFactId: FactId;
  readonly replacementFactId: FactId | null;
};

/**
 * Reads the fact and builds the change set that invalidates it, without committing it. The
 * source is made by `make` at the point where `invalidateFact` records one; with `isRecorded`
 * it is an existing source, not recorded again.
 */
export async function planInvalidateFact(
  deps: OperationDeps,
  input: Omit<InvalidateFactInput, 'source'>,
  source: { readonly make: (createdAt: Timestamp) => Promise<Source>; readonly isRecorded: boolean },
): Promise<Result<PlannedInvalidation>> {
  const { namespace, factId } = input;
  const found = await readLiveFact(deps, { namespace, factId });
  if (!found.ok) return found;
  const wrong = found.value.fact;

  const now = deps.now();
  let replacement: PreparedDrafts | null = null;
  if (input.replacement !== null) {
    const given = input.replacement.fact;
    const hasOwnPeriod = given.validFrom !== null || given.validTo !== null;
    const fact = hasOwnPeriod ? given : { ...given, validFrom: wrong.validFrom, validTo: wrong.validTo };
    const prepared = await prepareFactDrafts(deps, {
      namespace,
      drafts: [{ fact, newEntities: input.replacement.newEntities }],
      createdAt: now,
    });
    if (!prepared.ok) return prepared;
    replacement = prepared.value;
  }
  const made = await source.make(now);
  const changeSet = buildInvalidateFactChangeSet({
    context: input,
    operationId: deps.newId(),
    occurredAt: now,
    source: made,
    factId,
    replacement,
    sourceIsRecorded: source.isRecorded,
  });
  return ok({
    changeSet,
    invalidatedFactId: factId,
    replacementFactId: replacement?.facts[0]?.fact.id ?? null,
  });
}

/**
 * Withdraws a fact as a belief, in one commit. With a replacement it is a correction: the
 * wrong fact is invalidated and linked to the replacement, which takes the wrong fact's valid
 * period unless it gives its own. Without one it is a retraction.
 */
export async function invalidateFact(
  deps: OperationDeps,
  input: InvalidateFactInput,
): Promise<Result<{ readonly invalidatedFactId: FactId; readonly replacementFactId: FactId | null }>> {
  const planned = await planInvalidateFact(deps, input, {
    make: (createdAt) => buildSource(deps, { namespace: input.namespace, source: input.source, createdAt }),
    isRecorded: false,
  });
  if (!planned.ok) return planned;
  const committed = await deps.store.commit(planned.value.changeSet);
  if (!committed.ok) return committed;
  return ok({
    invalidatedFactId: planned.value.invalidatedFactId,
    replacementFactId: planned.value.replacementFactId,
  });
}
