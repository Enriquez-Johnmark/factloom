import type { Fact, TimeFilter } from './fact.ts';
import type { Timestamp } from './timestamp.ts';

/** A valid period: half-open, with a missing bound meaning unknown or open. */
export type ValidPeriod = { readonly validFrom: Timestamp | null; readonly validTo: Timestamp | null };

/**
 * Says whether two valid periods share any moment. A missing bound counts as open, and
 * periods that only touch, one ending where the other starts, do not overlap.
 * The single-value rule is this test applied to two live facts with one subject and predicate.
 */
export function periodsOverlap(first: ValidPeriod, second: ValidPeriod): boolean {
  const firstStartsBeforeSecondEnds =
    first.validFrom === null || second.validTo === null || first.validFrom < second.validTo;
  const secondStartsBeforeFirstEnds =
    second.validFrom === null || first.validTo === null || second.validFrom < first.validTo;
  return firstStartsBeforeSecondEnds && secondStartsBeforeFirstEnds;
}

/**
 * The time predicate: whether Kronomind believed the fact at the known-at date, and the fact
 * was true in the world at the as-of date. Every read that filters by time applies exactly this.
 */
export function matchesTimeFilter(fact: Fact, time: TimeFilter): boolean {
  const believed =
    fact.createdAt <= time.knownAt && (fact.invalidatedAt === null || fact.invalidatedAt > time.knownAt);
  const valid =
    (fact.validFrom === null || fact.validFrom <= time.validAt) &&
    (fact.validTo === null || fact.validTo > time.validAt);
  return believed && valid;
}
