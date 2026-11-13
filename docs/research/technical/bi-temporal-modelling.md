# Bi-temporal data modelling

Accessed: 2026-11-13.

## Question

How should Factloom store and query facts along two time axes (when a fact was true in the world, and
when the system believed it), on SQLite first and Postgres later? What do the databases give us
natively, how does Graphiti model the same thing, and which mistakes are expensive to undo?

Vocabulary used below:

| Term | Meaning | Factloom columns |
|---|---|---|
| Valid time (application time) | When the fact was true in the world | `valid_from`, `valid_to` |
| Transaction time (system time) | When the system recorded the row and when it stopped believing it | `created_at`, `invalidated_at` |

## Findings

### Database support

1. **PostgreSQL 18 has temporal constraints but not temporal tables.** `PRIMARY KEY` and `UNIQUE`
   accept `WITHOUT OVERLAPS` on the last column, and `FOREIGN KEY` accepts `PERIOD` on the last column.
   The documentation states that "in effect, such a constraint is enforced with an `EXCLUDE`
   constraint" and that it uses a GiST index instead of a btree.
   The column must be a range or multirange type. The 18 release notes list "Temporal constraints, or
   constraints over ranges, for PRIMARY KEY, UNIQUE, and FOREIGN KEY constraints" as a headline item.
   Source: https://www.postgresql.org/docs/18/sql-createtable.html and
   https://www.postgresql.org/docs/18/release-18.html. **Confirmed.**

2. **PostgreSQL lists the two SQL-standard temporal table features as unsupported.** The
   "Unsupported Features" appendix of the current (18) documentation lists `T180 System-versioned
   tables` and `T181 Application-time period tables`. So Postgres has no built-in transaction-time
   history and no `FOR SYSTEM_TIME AS OF` query syntax; both axes must be modelled as ordinary columns.
   Source: https://www.postgresql.org/docs/current/unsupported-features-sql-standard.html.
   **Confirmed.** On the access date, "current" resolved to version 18 (latest minor listed: 18.7);
   version 19 documentation exists only under development versions, and its draft release notes
   mention a new documentation section about temporal tables
   (https://www.postgresql.org/docs/19/release-19.html). **Confirmed** for what the pages say;
   what version 19 will finally ship is **unverified**.

3. **PostgreSQL range types are a natural fit for intervals.** `tstzrange` values carry inclusive or
   exclusive bounds (`[` / `)`), and "using NULL for either bound causes the range to be unbounded on
   that side". Source: https://www.postgresql.org/docs/18/rangetypes.html. **Confirmed.** A NULL
   `valid_to` in SQLite therefore maps directly onto an unbounded upper bound later.

4. **SQLite has no temporal features and no date/time storage class.** The datatype documentation
   says: "SQLite does not have a storage class set aside for storing dates and/or times", and that the
   built-in functions can store them as TEXT ISO-8601 strings (`"YYYY-MM-DD HH:MM:SS.SSS"`), REAL
   Julian day numbers, or INTEGER Unix time. Source: https://www.sqlite.org/datatype3.html.
   **Confirmed.** There is no range type, no exclusion constraint and no period syntax; overlap rules
   must be enforced in application code or triggers.

### Timestamp representation in SQLite (tested)

Tested with a throwaway script on SQLite 3.53.1 (Python `sqlite3` module) on 2026-11-13. TEXT
timestamps are compared as plain strings, so ordering is correct only if every value has exactly the
same format.

| Comparison (string order in SQLite) | Result | Real-world order |
|---|---|---|
| `'2026-01-01T00:00:00.500Z' < '2026-01-01T00:00:00Z'` | true | wrong: `.` sorts before `Z` |
| `'2026-01-01 23:00:00' < '2026-01-01T00:00:00Z'` | true | wrong: space sorts before `T` |
| `'2026-01-01T01:00:00+02:00' > '2026-01-01T00:30:00Z'` | true | wrong: the first instant is 23:00Z the day before |
| `'...T00:00:00.500Z' > '...T00:00:00.000Z'` (fixed width) | true | correct |

5. **Mixed ISO-8601 formats silently break ordering.** See the table. **Confirmed** by test.
   SQLite's own `datetime('now')` returns `2026-11-13 08:48:30` (space separator, no zone), which does
   not sort correctly against `Date.prototype.toISOString()` output.

6. **JavaScript's `toISOString()` gives a fixed-width UTC format.** Node 22 returned
   `2026-11-13T08:00:00.000Z` (24 characters, always milliseconds, always `Z`) for an input with a
   `+02:00` offset. **Confirmed** by test. A `CHECK` constraint with `length(ts)=24` and a `GLOB`
   pattern rejected the three malformed variants above and accepted NULL. **Confirmed** by test.
   SQLite can produce the same format itself: `strftime('%Y-%m-%dT%H:%M:%fZ', x)`.

7. **INTEGER epoch milliseconds is the alternative.** It cannot be mis-formatted and compares
   numerically; it is harder to read in ad hoc SQL and in audit output. Both TEXT and INTEGER are
   usable in a btree index. `unixepoch()` returns seconds, or fractional seconds with the `subsec`
   modifier. Source: https://www.sqlite.org/lang_datefunc.html. **Confirmed.**

### Query patterns (tested)

Half-open intervals `[from, to)` were used: the lower bound is included, the upper bound excluded.
This is the same convention as the default canonical form of Postgres discrete ranges (`[)`), and it
means adjacent periods share a boundary value without overlapping. NULL means "unbounded / not known".

```sql
-- :vt = valid-time instant asked about, :tt = transaction-time instant ("as known at")
SELECT id, object FROM fact
WHERE subject = :s AND predicate = :p
  AND (valid_from IS NULL OR valid_from <= :vt) AND (valid_to IS NULL OR :vt < valid_to)
  AND created_at <= :tt AND (invalidated_at IS NULL OR :tt < invalidated_at);
```

| Question | Predicate |
|---|---|
| True now, as we believe now | `invalidated_at IS NULL` and the valid-time clause with `:vt = now` |
| True on date X, as we believe now | `invalidated_at IS NULL` and the valid-time clause with `:vt = X` |
| What did we believe at T about "now at T" | both clauses, `:vt = :tt = T` |
| What did we believe at T about date X | both clauses, `:vt = X`, `:tt = T` |

8. **The pattern returns correct answers at boundaries and across corrections.** Test data: on
   2024-02-01 the system records "owner = alice" from 2024-01-01, open-ended. On 2025-07-01 it learns
   that bob took over on 2025-03-01. The open-ended row is invalidated (not edited), a new row "alice,
   2024-01-01 to 2025-03-01" is inserted, and a row "bob, from 2025-03-01" is inserted. Results:
   "owner on 2025-04-01 as known now" returned bob; "owner on 2025-04-01 as known on 2025-05-01"
   returned alice (the belief at the time); the boundary instant 2025-03-01 returned bob only.
   **Confirmed** by test.

9. **A partial index serves the common case.** `CREATE INDEX ... ON fact(subject, predicate) WHERE
   invalidated_at IS NULL` was chosen by the planner for the current-belief query (`EXPLAIN QUERY
   PLAN` reported `SEARCH fact USING INDEX fact_live`). **Confirmed** by test on a tiny table; behaviour
   at scale is **unverified**.

### How Graphiti models edge time

Read from `getzep/graphiti` at commit `ebef986a` (2026-11-11), package version 0.31.2.

10. **Four time fields plus a reference time.** `EntityEdge` has `valid_at` ("datetime of when the
    fact became true"), `invalid_at` ("datetime of when the fact stopped being true"), `expired_at`
    ("datetime of when the node was invalidated"), an inherited `created_at`, and `reference_time`
    ("reference timestamp from the episode that produced this edge"). All but `created_at` are
    nullable. Source: `graphiti_core/edges.py`, class `EntityEdge`. **Confirmed.** The Zep paper
    describes the same four timestamps as two timelines (arXiv:2501.13956, section on temporal
    extraction, https://arxiv.org/abs/2501.13956). **Confirmed.**

11. **Invalidation edits the existing edge in place.** When a new edge contradicts an older one,
    `resolve_edge_contradictions` sets `edge.invalid_at = resolved_edge.valid_at` and
    `edge.expired_at = utc_now()` on the old edge. Candidates whose validity interval does not overlap
    the new edge are skipped. Source: `graphiti_core/utils/maintenance/edge_operations.py`.
    **Confirmed.** No field on `EntityEdge` links the invalidated edge to the edge that replaced it.
    **Confirmed** for the model fields listed in finding 10.

12. **`expired_at` is also set for facts that simply ended.** `_apply_temporal_invalidation` sets
    `expired_at = now` when a newly resolved edge already has an `invalid_at` ("The edge arrived with
    an end date, so it is already historical"). Source: same file. **Confirmed.** In a strict
    bi-temporal reading, "this was true from A to B" is still a current belief, so here the
    transaction-time field doubles as an "is historical" marker. This is a design choice, not an
    error, but it means `expired_at IS NULL` does not mean "everything the system currently believes".

13. **Future-tense statements are anchored to when they were said.** For planned or promised facts
    Graphiti sets `valid_at` to the episode reference time and does not treat soft deadlines as
    `invalid_at`. Source: `graphiti_core/utils/maintenance/temporal_edge_utils.py`,
    `normalize_future_temporal_bounds`. **Confirmed.**

14. **All datetimes are normalised to UTC** through `ensure_utc` before comparison, and extraction
    prompts ask for ISO-8601 with a `Z` suffix. Source: `temporal_edge_utils.py`,
    `graphiti_core/prompts/extract_edges.py`. **Confirmed.**

### Common mistakes

| Mistake | Consequence | Evidence |
|---|---|---|
| One pair of timestamps for both axes | Cannot answer "what did we believe on date T"; a late-arriving correction rewrites history | Finding 8 shows the two axes giving different answers |
| Updating valid-time bounds in place | Past query results are no longer reproducible | Finding 11 (the approach is workable but loses the earlier belief unless separately logged) |
| Using the transaction-time end as an "is historical" flag | "Current beliefs" filter drops true historical facts | Finding 12 |
| Mixed timestamp formats or local time | Silent mis-ordering | Findings 5 and 6 |
| Closed intervals `[from, to]` | Adjacent periods overlap at the boundary instant, or need a "minus one tick" hack | Finding 8 boundary test |
| Sentinel end dates such as `9999-12-31` | Sentinel leaks into output and LLM context; needs special-casing everywhere | Postgres and Graphiti both use NULL / unbounded (findings 3, 10) |
| Treating the statement time as the valid time | "Will move in March" recorded as true from March, or deadline treated as end of validity | Finding 13 |

## What it means for Factloom

Recommended schema rules (depth is justified here; this is the part that is expensive to change):

1. **Four columns, exactly the settled names.** `valid_from`, `valid_to` (nullable both),
   `created_at` (NOT NULL), `invalidated_at` (nullable). Half-open intervals on both axes.
2. **NULL means unbounded or unknown.** `valid_to IS NULL`: no known end. `valid_from IS NULL`: start
   not known. Do not try to distinguish "still true" from "end unknown" yet; no reviewed system does.
   No sentinel dates.
3. **Store timestamps as TEXT, UTC, fixed width: `YYYY-MM-DDTHH:MM:SS.sssZ`.** Produce them only with
   `toISOString()` in one helper in `@factloom/core`; add the `CHECK` constraint from finding 6 to
   every timestamp column; never call `datetime('now')` in SQL. This keeps the database readable and
   maps to `timestamptz` with a plain cast later. INTEGER milliseconds is an acceptable alternative;
   pick one and never mix.
4. **Rows are immutable except for one transition.** The only permitted update to a fact row is
   setting `invalidated_at` from NULL to a timestamp (once). Any other change, including closing
   `valid_to`, is "invalidate the old row, insert a new row". This is what made finding 8 work with a
   single uniform predicate.
5. **Keep `invalidated_at` strictly transaction-time.** A fact with a closed `valid_to` and
   `invalidated_at IS NULL` is a current belief about the past. Do not copy Graphiti's shortcut
   (finding 12); "what is true now" is expressed by the valid-time clause instead.
6. **Supersession is a separate link table**, not only a column:
   `fact_supersession(old_fact_id, new_fact_id, kind, reason, created_at)` with `kind` in
   `('correction', 'succession', 'refinement', 'duplicate')`. One new fact can replace several old
   ones, and a row replaced for bookkeeping (alice open-ended to alice closed) has a different cause
   (the bob fact) from its replacement; a single `superseded_by` column cannot say both.
7. **Record `observed_at` (source/reference time) separately** from both axes: when the source said
   it. It is the anchor for resolving relative dates and the default `valid_from` when nothing better
   is known (finding 13).
8. **Indexes:** `(subject_id, predicate) WHERE invalidated_at IS NULL` plus one on `created_at`.
   Nothing more until measurements say otherwise.
9. **Overlap rule:** enforce "no two live rows for the same subject and functional predicate overlap
   in valid time" in the write path (a query like the overlap check in the test script), not with
   triggers.

Do not build yet:

- Generic temporal-table machinery, history tables per entity, or triggers that version rows.
- Postgres `WITHOUT OVERLAPS` / range columns. Design so they can be added (rules 1 to 3), nothing more.
- Valid-time precision tracking (year-only versus exact instant), time zones other than UTC, or
  "as of" query syntax sugar beyond two optional parameters (`validAt`, `knownAt`) on retrieval.
- Bi-temporal entities. Only facts need both axes at first; entities need `created_at` and merge
  provenance (see entity-resolution.md).

## Open questions

- **Unverified:** the SQL:2011 temporal feature set as described by Kulkarni and Michels, "Temporal
  features in SQL:2011" (SIGMOD Record, 2012). The paper was not fetched in this session; the feature
  names used above come from the PostgreSQL conformance appendix only.
- **Unverified:** whether a Postgres 18 `UNIQUE (... WITHOUT OVERLAPS)` constraint can be made
  partial (apply only to rows where `invalidated_at IS NULL`). If not, a hand-written `EXCLUDE ...
  WHERE` constraint would be needed. Check before phase 4.
- **Unverified:** what PostgreSQL 19 will ship for temporal support (for example `FOR PORTION OF`).
- How should imprecise valid times from text ("in 2023", "last spring") be stored? Proposal to test
  in phase 1: store the start of the period as the instant and keep the original phrase in the
  source record; add a precision column only if evaluation shows it matters.
- Does the partial index remain selective when one subject has thousands of facts? Measure in phase 1.
