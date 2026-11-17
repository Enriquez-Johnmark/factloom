import type { FactWithSources, Namespace } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import type { Result } from '../result.ts';

export type ListOrphanedFactsInput = { readonly namespace: Namespace; readonly limit: number };

/**
 * Lists the live facts left without their source: every source purged, or the latest
 * verification found the source missing. Oldest first.
 */
export async function listOrphanedFacts(
  deps: Pick<OperationDeps, 'store'>,
  input: ListOrphanedFactsInput,
): Promise<Result<readonly FactWithSources[]>> {
  return deps.store.listOrphanedFacts(input);
}
