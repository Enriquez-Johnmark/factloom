import type { EntityId, FactWithSources, Namespace } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { err, ok, type Result } from '../result.ts';
import type { Timestamp } from '../timestamp.ts';
import { periodsOverlap } from '../valid-period.ts';

/**
 * How many live facts are read for one subject and predicate, before those that do not
 * overlap are dropped. Known limit: when one subject and predicate has more live facts than
 * this, older ones are not seen. The store's check inside `commit` still refuses a write that
 * breaks the single-value rule, so the cost is a `conflict` error, never a broken rule.
 */
const FETCH_BOUND = 200;

export type FindConflictCandidatesInput = {
  readonly namespace: Namespace;
  readonly subjectEntityId: EntityId;
  readonly predicate: string;
  readonly validFrom: Timestamp | null;
  readonly validTo: Timestamp | null;
  readonly limit: number;
};

/**
 * Lists the live facts with the same subject and predicate whose valid period overlaps the
 * given one, newest first. It does not judge them: a candidate with the same object is a
 * restatement, and one with a different object may be a conflict. Reads only.
 */
export async function findConflictCandidates(
  deps: Pick<OperationDeps, 'store' | 'now'>,
  input: FindConflictCandidatesInput,
): Promise<Result<readonly FactWithSources[]>> {
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    return err(
      'invalid_input',
      `The limit must be a whole number of at least 1, and ${input.limit} was given.`,
    );
  }
  if (input.validFrom !== null && input.validTo !== null && input.validTo <= input.validFrom) {
    return err(
      'invalid_input',
      `The valid period must end after it starts: ${input.validFrom} to ${input.validTo} was given.`,
    );
  }
  const listed = await deps.store.listFacts({
    namespace: input.namespace,
    subjectEntityId: input.subjectEntityId,
    predicate: input.predicate,
    touchingEntityIds: null,
    supersededByFactId: null,
    time: 'live',
    limit: FETCH_BOUND,
  });
  if (!listed.ok) return listed;
  const newestFirst = listed.value
    .filter(({ fact }) => periodsOverlap(fact, input))
    .sort((first, second) => second.fact.createdAt.localeCompare(first.fact.createdAt));
  return ok(newestFirst.slice(0, input.limit));
}
