import type { FactId } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { ok, type Result } from '../result.ts';
import type { ChangeContext } from './operation-inputs.ts';

export type ArchiveFactsInput = ChangeContext & { readonly factIds: readonly FactId[] };

/**
 * Marks live facts as archived facts, in one commit, with one audit entry for each. No fact row
 * changes: an archived fact is still a live fact and still counts for the single-value rule.
 * The reason code is `unused` for the archiving job, `requested` otherwise.
 */
export async function archiveFacts(
  deps: Pick<OperationDeps, 'store' | 'now' | 'newId'>,
  input: ArchiveFactsInput,
): Promise<Result<{ readonly archiveIds: readonly string[] }>> {
  const changes = input.factIds.map(
    (factId) => ({ kind: 'archive_fact', archiveId: deps.newId(), factId }) as const,
  );
  const committed = await deps.store.commit({
    namespace: input.namespace,
    operationId: deps.newId(),
    operation: 'archive',
    trigger: input.trigger,
    reasonCode: input.reasonCode,
    explainedBySourceId: null,
    occurredAt: deps.now(),
    changes,
  });
  if (!committed.ok) return committed;
  return ok({ archiveIds: changes.map((change) => change.archiveId) });
}
