import type { EntityId } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { err, ok, type Result } from '../result.ts';
import type { ChangeContext } from './operation-inputs.ts';

export type MergeEntitiesInput = ChangeContext & {
  readonly fromEntityId: EntityId;
  readonly intoEntityId: EntityId;
};

/**
 * Records that one entity is the same thing as another, in one commit. No entity and no fact
 * is rewritten: from now on every read resolves `fromEntityId` to `intoEntityId`, and facts
 * about either are read together, through whole chains of merges. Entities of different types
 * can be merged. A merge is refused with `conflict` when the two entities hold different live
 * values for a predicate the domain says is single-valued, and with `invalid_input` when it
 * would make a cycle.
 */
export async function mergeEntities(
  deps: Pick<OperationDeps, 'store' | 'domain' | 'now' | 'newId'>,
  input: MergeEntitiesInput,
): Promise<Result<{ readonly mergeId: string }>> {
  if (input.fromEntityId === input.intoEntityId) {
    return err('invalid_input', 'An entity cannot be merged with itself.');
  }
  const now = deps.now();
  const mergeId = deps.newId();
  const committed = await deps.store.commit({
    namespace: input.namespace,
    operationId: deps.newId(),
    operation: 'merge',
    trigger: input.trigger,
    reasonCode: input.reasonCode,
    explainedBySourceId: null,
    occurredAt: now,
    changes: [
      {
        kind: 'merge_entities',
        merge: {
          id: mergeId,
          namespace: input.namespace,
          fromEntityId: input.fromEntityId,
          intoEntityId: input.intoEntityId,
          mergedAt: now,
          undoneAt: null,
        },
        singleValuedPredicates: deps.domain.predicates
          .filter((predicate) => predicate.cardinality === 'single')
          .map((predicate) => predicate.name),
      },
    ],
  });
  if (!committed.ok) return committed;
  return ok({ mergeId });
}
