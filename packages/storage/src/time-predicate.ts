/**
 * The time predicate: the four conditions that every read of facts applies, for a fact row
 * aliased `f`. `:validAt` is the as-of date and `:knownAt` the known-at date. Both periods
 * are half-open. This is the only place the conditions are written.
 */
export const TIME_PREDICATE = `f.created_at <= @knownAt
  AND (f.invalidated_at IS NULL OR f.invalidated_at > @knownAt)
  AND (f.valid_from IS NULL OR f.valid_from <= @validAt)
  AND (f.valid_to IS NULL OR f.valid_to > @validAt)`;
