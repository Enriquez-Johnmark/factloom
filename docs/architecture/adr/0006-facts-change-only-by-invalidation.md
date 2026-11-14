# A fact row changes only by being invalidated once

Status: accepted

Facts are bi-temporal: `valid_from` and `valid_to` say when a fact was true, `created_at` and `invalidated_at` say when Factloom believed it. A fact row is never deleted, and the only change ever made to it is setting `invalidated_at`, once, optionally with a link to the fact that superseded it. A database trigger enforces this.

Anything that looks like an edit is therefore an invalidation plus a new row. Ending a fact, the common case when the world changes, inserts a copy with `valid_to` set and invalidates the original.

The reason is that it keeps both time axes correct with one predicate. A question about what Factloom believed on a past date is answered from `created_at` and `invalidated_at` alone, and that only works if nothing else about a row has changed since. It was checked on a timeline with a succession and a correction ([spike](../../../spikes/fact-schema/README.md)).

## Considered options

- **Set `valid_to` in place when a fact ends.** Simpler to write, and half the rows. Rejected: the row would then show an end that Factloom did not know about at earlier dates, so every known-at query would need a second timestamp for when `valid_to` was set and a special case to ignore it.
- **Edit rows and keep history in a separate table.** Rejected: two places to query, and the history table is where bugs hide.
- **Use `invalidated_at` to mean "no longer true" as well.** One of the systems studied does this. Rejected: it merges the two axes, so "we were wrong" and "it changed" become indistinguishable.

## Consequences

- An ended fact costs one extra row with its keyword and vector entries. The vector is copied, not recomputed.
- A change of confidence is not a revision and does not copy the fact. `fact.confidence` is the confidence at recording. Phase 2 adds an append-only `fact_confidence` table, and reads return the latest value recorded at or before the known-at date. A copy per adjustment would change the fact's identifier and its recorded date every time. Confidence changes on feedback or on a failed verification, never on a timer.
- A fact's identifier changes when it is revised. A caller that holds the old identifier gets `already_invalidated`, with the identifier of the superseding fact.
- Correcting the date of a succession means changing the end of one fact and the start of the next together. `reviseValidTime`, in phase 2, replaces both neighbours in one commit. The spike checks that this leaves no overlap and no gap.
- A fact has at most one supersession link, set when it is invalidated. A fact retracted with no replacement cannot be linked to one later: the later fact is simply recorded. A fact corrected into two facts links to one of them. Fact history for a single-valued predicate still shows them all.
- A purge, the one exception, needs its own narrowly defined change ([ADR 0012](0012-purge-is-the-one-exception.md)).
