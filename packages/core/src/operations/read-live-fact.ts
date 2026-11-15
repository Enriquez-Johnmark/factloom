import type { FactId, FactWithSources, Namespace } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { err, ok, type Result } from '../result.ts';

/**
 * Reads a fact that an operation is about to change. Returns `not_found` when it is not in
 * the namespace, and `already_invalidated` when it is no longer live, naming the fact that
 * superseded it if there is one.
 */
export async function readLiveFact(
  deps: Pick<OperationDeps, 'store'>,
  query: { readonly namespace: Namespace; readonly factId: FactId },
): Promise<Result<FactWithSources>> {
  const found = await deps.store.getFact(query);
  if (!found.ok) return found;
  if (found.value === null) return err('not_found', `No fact ${query.factId} in this namespace.`);
  if (found.value.fact.invalidatedAt === null) return ok(found.value);
  const superseded = found.value.fact.supersededByFactId;
  return err(
    'already_invalidated',
    superseded === null
      ? `The fact ${query.factId} was invalidated and nothing superseded it.`
      : `The fact ${query.factId} was invalidated and superseded by ${superseded}. Use that fact.`,
    { relatedFactIds: superseded === null ? [] : [superseded] },
  );
}
