import type { ChangeSet } from '../change-set.ts';
import type { FactId, Source } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { err, ok, type Result } from '../result.ts';
import type { Timestamp } from '../timestamp.ts';
import { buildSource } from './build-source.ts';
import type { ChangeContext, FactDraft, NewSource } from './operation-inputs.ts';
import { buildRecordChanges, type PreparedDrafts, prepareFactDrafts } from './prepare-fact-drafts.ts';

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
      { kind: 'record_source', source: parts.source },
      ...(parts.replacement === null ? [] : buildRecordChanges(parts.replacement, parts.source.id)),
      { kind: 'invalidate_fact', factId: parts.factId, supersededByFactId: replacementFactId },
    ],
  };
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
  const { namespace, factId } = input;
  const found = await deps.store.getFact({ namespace, factId });
  if (!found.ok) return found;
  if (found.value === null) return err('not_found', `No fact ${factId} in this namespace.`);
  const wrong = found.value.fact;
  if (wrong.invalidatedAt !== null) {
    const superseded = wrong.supersededByFactId;
    return err(
      'already_invalidated',
      superseded === null
        ? `The fact ${factId} was invalidated and nothing superseded it.`
        : `The fact ${factId} was invalidated and superseded by ${superseded}. Use that fact.`,
      { relatedFactIds: superseded === null ? [] : [superseded] },
    );
  }

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
  const source = await buildSource(deps, { namespace, source: input.source, createdAt: now });

  const committed = await deps.store.commit(
    buildInvalidateFactChangeSet({
      context: input,
      operationId: deps.newId(),
      occurredAt: now,
      source,
      factId,
      replacement,
    }),
  );
  if (!committed.ok) return committed;
  return ok({ invalidatedFactId: factId, replacementFactId: replacement?.facts[0]?.fact.id ?? null });
}
