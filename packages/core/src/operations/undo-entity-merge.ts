import type { OperationDeps } from '../operation-deps.ts';
import { err, ok, type Result } from '../result.ts';
import type { ChangeContext } from './operation-inputs.ts';

export type UndoEntityMergeInput = ChangeContext & { readonly mergeId: string };

/**
 * Withdraws a merge, in one commit: sets its `undoneAt`, once. Facts recorded against either
 * entity, before or during the merge, are then read under the entity they were recorded
 * against. In a chain, only this merge is withdrawn.
 */
export async function undoEntityMerge(
  deps: Pick<OperationDeps, 'store' | 'now' | 'newId'>,
  input: UndoEntityMergeInput,
): Promise<Result<{ readonly mergeId: string }>> {
  const merges = await deps.store.listEntityMerges({ namespace: input.namespace });
  if (!merges.ok) return merges;
  const merge = merges.value.find((known) => known.id === input.mergeId);
  if (merge === undefined) return err('not_found', `No merge ${input.mergeId} in this namespace.`);
  if (merge.undoneAt !== null) return err('already_exists', `The merge ${input.mergeId} was already undone.`);
  const committed = await deps.store.commit({
    namespace: input.namespace,
    operationId: deps.newId(),
    operation: 'merge',
    trigger: input.trigger,
    reasonCode: input.reasonCode,
    explainedBySourceId: null,
    occurredAt: deps.now(),
    changes: [{ kind: 'undo_entity_merge', mergeId: merge.id, fromEntityId: merge.fromEntityId }],
  });
  if (!committed.ok) return committed;
  return ok({ mergeId: merge.id });
}
