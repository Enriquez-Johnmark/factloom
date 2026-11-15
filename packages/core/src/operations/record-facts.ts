import type { ChangeSet } from '../change-set.ts';
import type { FactId, Source, SourceId } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { err, ok, type Result } from '../result.ts';
import type { Timestamp } from '../timestamp.ts';
import { buildSource } from './build-source.ts';
import type { ChangeContext, FactDraft, NewSource } from './operation-inputs.ts';
import { buildRecordChanges, type PreparedDrafts, prepareFactDrafts } from './prepare-fact-drafts.ts';

export type RecordFactsInput = ChangeContext & {
  readonly source: NewSource;
  readonly drafts: readonly FactDraft[];
  /** Live facts this source states again. The source is attached to each; no new row is written. */
  readonly restatedFactIds: readonly FactId[];
};

/**
 * Builds the one change set of `recordFacts`: the source, each new entity, each fact with the
 * source and its vector, then the source attached to each restated fact. Pure: every
 * identifier, time and vector is given.
 */
export function buildRecordFactsChangeSet(parts: {
  readonly context: ChangeContext;
  readonly operationId: string;
  readonly occurredAt: Timestamp;
  readonly source: Source;
  readonly prepared: PreparedDrafts;
  readonly restatedFactIds: readonly FactId[];
}): ChangeSet {
  const sourceId = parts.source.id;
  return {
    namespace: parts.context.namespace,
    operationId: parts.operationId,
    operation: 'remember',
    trigger: parts.context.trigger,
    reasonCode: parts.context.reasonCode,
    explainedBySourceId: sourceId,
    occurredAt: parts.occurredAt,
    changes: [
      { kind: 'record_source', source: parts.source },
      ...buildRecordChanges(parts.prepared, sourceId),
      ...parts.restatedFactIds.map((factId) => ({ kind: 'attach_source', factId, sourceId }) as const),
    ],
  };
}

/**
 * Records what was learned from one source, in one commit: the source, new entities, new
 * facts, and the source attached to each live fact it states again. All or nothing: if any
 * draft breaks the single-value rule, nothing is recorded and the result is `conflict`.
 */
export async function recordFacts(
  deps: OperationDeps,
  input: RecordFactsInput,
): Promise<Result<{ readonly sourceId: SourceId; readonly factIds: readonly FactId[] }>> {
  if (input.drafts.length === 0 && input.restatedFactIds.length === 0) {
    return err(
      'invalid_input',
      'There is nothing to record: give at least one fact, or one fact that the source restates.',
    );
  }
  const now = deps.now();
  const { namespace } = input;
  const prepared = await prepareFactDrafts(deps, { namespace, drafts: input.drafts, createdAt: now });
  if (!prepared.ok) return prepared;
  const source = await buildSource(deps, { namespace, source: input.source, createdAt: now });

  const committed = await deps.store.commit(
    buildRecordFactsChangeSet({
      context: input,
      operationId: deps.newId(),
      occurredAt: now,
      source,
      prepared: prepared.value,
      restatedFactIds: input.restatedFactIds,
    }),
  );
  if (!committed.ok) return committed;
  return ok({ sourceId: source.id, factIds: prepared.value.facts.map(({ fact }) => fact.id) });
}
