/**
 * The confidence of a fact row aliased `f`, as reads return it. `fact.confidence` is the
 * confidence at recording and never changes; a later one is a row of `fact_confidence`. Rows
 * with the same `adjusted_at` are ordered by rowid, so the later insertion wins. These are the
 * only places the rule is written.
 */
const latestAdjustment = (condition: string): string =>
  `COALESCE((SELECT c.confidence FROM fact_confidence c
    WHERE c.fact_id = f.id${condition}
    ORDER BY c.adjusted_at DESC, c.rowid DESC LIMIT 1), f.confidence)`;

/** The latest confidence recorded, for a read that has no known-at date. */
export const LATEST_CONFIDENCE = latestAdjustment('');

/** The latest confidence recorded at or before the read's `@knownAt`. */
export const CONFIDENCE_AT_KNOWN_AT = latestAdjustment(' AND c.adjusted_at <= @knownAt');
