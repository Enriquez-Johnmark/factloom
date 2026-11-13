# Timestamps are fixed-width UTC text

Status: accepted

Every timestamp is stored as text in the form `YYYY-MM-DDTHH:MM:SS.sssZ`, always UTC, always with milliseconds. A `CHECK` on every timestamp column rejects any other form, and one function in `core` produces them.

SQLite has no timestamp type, and text in mixed forms sorts wrongly: a value with milliseconds sorts before the same second without them, and a space sorts before `T` ([research](../../research/technical/bi-temporal-modelling.md)). One fixed form makes text order equal time order, stays readable in any database browser, and casts directly to `timestamptz` in Postgres.

## Considered options

- **Integer milliseconds.** Equally correct and slightly faster to compare. Rejected for readability: a developer inspecting memory should be able to read the dates.
- **Whatever `datetime('now')` produces.** Rejected: it produces a different form from JavaScript, which is how mixed forms get in.

## Consequences

A missing `valid_from` or `valid_to` is `NULL`, never a sentinel date. Valid-time precision, "some time in March", is not represented; a date-only input means the start of that day in UTC.
