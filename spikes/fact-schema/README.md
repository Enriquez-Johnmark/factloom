# Spike: fact schema

Throwaway check for the draft first migration. It is not the implementation.

Run on 2026-11-13 on Linux x64, Node.js v22.23.4. Not run on macOS.

## Question

Does the draft schema in `0001_initial.sql` enforce the data rules, and does one time predicate
answer "what is true now", "what was true on a date" and "what did Factloom believe on a date" in
all three search paths?

## How to run

```sh
cd spikes/fact-schema && npm ci && node check.mjs
```

Dependencies are pinned to the same versions as `spikes/sqlite-vec-fts5`: `better-sqlite3` 13.1.1
and `sqlite-vec` 0.1.9.

## What it checks

The script records two facts, then applies a succession (PostgreSQL 14 was upgraded to 16) and a
correction (CI was on Node 22, not Node 20). It then asserts:

- the answers for seven combinations of as-of date and known-at date, including the day of the
  upgrade, where the half-open interval matters;
- that keyword search (FTS5) and vector search (`vec_distance_cosine` on an ordinary table) use the
  same time predicate and return the same facts;
- that fact history and the audit log read back as expected;
- that the database refuses: deleting a fact, editing a fact, invalidating a fact twice, a
  supersession link without an invalidation, a timestamp in any other format, an empty or reversed
  validity period, a fact with no object or two objects, a fact about a missing entity, a duplicate
  entity, and any change to the audit log.

## Recorded output

```
ok  now: only the current facts are returned
ok  as of 2026-02-01: PostgreSQL 14 was true then, and the corrected Node fact applies
ok  as of the day of the upgrade: the interval is half-open, so only PostgreSQL 16
ok  known at 2026-02-01: Factloom then believed PostgreSQL 14 and Node 20
ok  known at 2026-04-01, as of 2026-04-01: the upgrade was not yet known, so still PostgreSQL 14
ok  known at 2026-04-10, as of 2026-04-10: upgrade known, Node correction not yet
ok  before anything was recorded: nothing is returned
ok  keyword lane uses the same time filter
ok  vector lane uses the same time filter
ok  fact history: every row for a subject and predicate, with its supersession link
ok  audit log: one entry per change, grouped by operation
ok  a fact cannot be deleted
ok  a fact cannot be edited
ok  a fact cannot be invalidated twice or un-invalidated
ok  a supersession link requires an invalidation
ok  a timestamp in another format is rejected
ok  valid_from must be before valid_to
ok  a fact has exactly one kind of object
ok  a fact must refer to an existing entity
ok  the same entity cannot be created twice in a namespace
ok  audit entries cannot be changed or deleted
ok  no operation reduced the number of fact rows

22 checks passed on SQLite 3.54.1, sqlite-vec v0.1.9, Node v22.23.4
```

## What this does and does not show

It shows the rules hold on a toy timeline in an in-memory SQLite database. It does not measure
performance, and it does not test the write path that the storage package will implement: the
script performs each change with hand-written SQL.
