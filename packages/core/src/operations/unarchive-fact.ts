import type { FactId } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { ok, type Result } from '../result.ts';
import type { ChangeContext } from './operation-inputs.ts';

export type UnarchiveFactInput = ChangeContext & { readonly factId: FactId };

/**
 * Ends the archiving of a fact, in one commit. This is the only way a fact is unarchived:
 * recalling an archived fact does not unarchive it.
 */
export async function unarchiveFact(
  deps: Pick<OperationDeps, 'store' | 'now' | 'newId'>,
  input: UnarchiveFactInput,
): Promise<Result<null>> {
  const committed = await deps.store.commit({
    namespace: input.namespace,
    operationId: deps.newId(),
    operation: 'archive',
    trigger: input.trigger,
    reasonCode: input.reasonCode,
    explainedBySourceId: null,
    occurredAt: deps.now(),
    changes: [{ kind: 'unarchive_fact', factId: input.factId }],
  });
  return committed.ok ? ok(null) : committed;
}
