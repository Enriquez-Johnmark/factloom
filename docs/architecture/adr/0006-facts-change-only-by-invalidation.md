# A fact row changes only by being invalidated once

Status: accepted

Facts are bi-temporal: `valid_from` and `valid_to` say when a fact was true, `created_at` and `invalidated_at` say when Factloom believed it. A fact row is never deleted, and the only change ever made to it is setting `invalidated_at`, once, optionally with a link to the fact that superseded it. A database trigger enforces this.

Anything that looks like an edit is therefore an invalidation plus a new row. Ending a fact, the common case when the world changes, inserts a copy with `valid_to` set and invalidates the original.

The reason is that it keeps both time axes correct with one predicate. A question about what Factloom believed on a past date is answered from `created_at` and `invalidated_at` alone, and that only works if nothing else about a row has changed since. It was checked on a timeline with a succession and a correction ([spike](../../../spikes/fact-schema/README.md)).

## Considered options

- **Set `valid_to` in place when a fact ends.** Simpler to write, and half the rows. Rejected: the row would then show an end that Factloom did not know about at earlier dates, so every known-at query would need a second timestamp for when `valid_to` was set and a special case to ignore it. Each further field that could change in place, confidence for one, would need the same.
- **Edit rows and keep history in a separate table.** Rejected: two places to query, and the history table is where bugs hide.
- **Use `invalidated_at` to mean "no longer true" as well.** One of the systems studied does this. Rejected: it merges the two axes, so "we were wrong" and "it changed" become indistinguishable.

## Consequences

- An ended fact costs one extra row with its keyword and vector entries. The vector is copied, not recomputed.
- Confidence changes are revisions too, so frequent small adjustments would add rows. Phase 3 records verification outcomes in their own table and adjusts confidence only when it matters.
- A purge, the one exception, needs its own narrowly defined change ([ADR 0012](0012-purge-is-the-one-exception.md)).
