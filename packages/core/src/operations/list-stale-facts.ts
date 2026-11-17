import type { FactWithSources, Namespace } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { err, type Result } from '../result.ts';
import type { Timestamp } from '../timestamp.ts';

export type ListStaleFactsInput = {
  readonly namespace: Namespace;
  /** A fact counts as verified at its latest verification, or at its recording if it has none. */
  readonly notVerifiedSince: Timestamp;
  /** If given, also include current facts with confidence below this, whenever verified. */
  readonly confidenceBelow: number | null;
  readonly limit: number;
};

/**
 * Lists the current facts due for verification: those not verified since a date, least
 * recently verified first, and, with `confidenceBelow`, those whose latest confidence is
 * below it. A revised fact's copy has a new identifier and counts as verified at its own
 * recording.
 */
export async function listStaleFacts(
  deps: Pick<OperationDeps, 'store' | 'now'>,
  input: ListStaleFactsInput,
): Promise<Result<readonly FactWithSources[]>> {
  const { confidenceBelow } = input;
  if (confidenceBelow !== null && !(confidenceBelow >= 0 && confidenceBelow <= 1)) {
    return err('invalid_input', 'confidenceBelow must be a number from 0 to 1.');
  }
  return deps.store.listStaleFacts({ ...input, currentAt: deps.now() });
}
