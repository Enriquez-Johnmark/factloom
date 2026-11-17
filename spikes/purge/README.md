# Spike: purge

Throwaway check for the purge design of FL-047, recorded in [ADR 0012](../../docs/architecture/adr/0012-purge-is-the-one-exception.md). It is not the implementation: FL-061 writes the migration and the operation from the decision record, and no code is moved from here.

Run on 2026-11-17 on Linux x64, Node.js v22.23.4, npm 10.9.9, with `better-sqlite3` 13.1.1 (SQLite 3.54.1) and `sqlite-vec` 0.1.9, the versions the workspace pins.

## Question

After a purge of one source, can the purged text still be read anywhere: in any column of any table, in the keyword index, in the vector entries, or in the bytes of the database file and its write-ahead log? And which steps are needed for the answer to be no?

## How to run

```sh
cd spikes/purge && npm ci && node check.mjs
```

It exits 0 when run D, the design, leaves the marker nowhere.

## What it does

It builds a database file in write-ahead log mode from the project's migrations, read unchanged from `packages/storage/migrations/`, and then applies `0004_purge.sql`, the draft of the purge migration. With hand-written SQL, in separate transactions as the store makes them, it records:

- **`s-1`**, a source whose content and locator hold the marker string `ZEBRA7731`, and **`s-1b`**, a second source row with the same text and content hash;
- **`f-1`**, a fact from both, whose statement and value hold the marker;
- **`f-1e`**, `f-1` ended, a revision copy, carrying `s-1` and the end note `s-2`;
- **`fb-1`**, feedback on `f-1e` whose comment, source `s-5`, quotes the marker;
- **`f-2`**, the correction of `f-1e`, from the note `s-3`, which quotes the marker;
- **`u-1`**, an unrelated fact from `s-4`.

It then purges `s-1` by the design's rule. In one transaction it:

- invalidates each live purged fact;
- writes the marker into each purged fact's text, where the draft's trigger removes its keyword entry;
- deletes its vector;
- writes the marker into each purged source's content and clears its locator and hash;
- writes one audit entry per change.

It does this five times, on fresh files, varying what is done about freed pages:

| Run | FTS5 `secure-delete` | `PRAGMA secure_delete` | `VACUUM` and `wal_checkpoint(TRUNCATE)` after the purge |
|---|---|---|---|
| A | off | off | no |
| B | on | on | no |
| C | off | off | yes |
| D, the design | on | off | yes |
| E | on | on | yes |

For each run it prints one line per table, then lines for the keyword index (`MATCH`), the vector entries of the purged facts, and the bytes of the database file and the write-ahead log, read while the connection is open, as a running server holds it, and again after it closes. It also checks:

- the unrelated fact, its source and its vector;
- the row counts;
- the correction `f-2`;
- eight updates and deletes outside the design's condition.

## Result

**Run D passed.** The marker was found nowhere: in no column of the 14 tables, not in the keyword index or the vector entries, and not in the bytes of the database file or the write-ahead log. The unrelated fact, its source and its vector were unchanged. No row was removed: fact 4, source 6, and audit 10 to 17, 7 purge entries added. All 8 updates outside the design's condition were refused.

The other runs show why each step is there:

- **FTS5 `secure-delete` (runs A and C).** Without it, the FTS5 `delete` takes the fact out of search results, since `MATCH` finds nothing, but the term stays in the index's shadow table `fact_fts_data`, readable with SQL. `VACUUM` does not remove it, because it is live data of the index, not a freed page.
- **`VACUUM` and `wal_checkpoint(TRUNCATE)` (runs A and B).** Without them, the old page images are in the write-ahead log while the connection is open. After the connection closes and the log is checkpointed, they are in the database file. `PRAGMA secure_delete` (run B) does not prevent this. The text the earlier invalidations left in freed space was written before the purge, with `secure_delete` off, which is how the store runs.
- **`PRAGMA secure_delete` (run E).** With `VACUUM`, it adds nothing, so it is not part of the design.

`f-2`, the correction, came only from the explaining note `s-3`. Its text is unchanged and it stays live: an **orphaned fact**, as the design decides.

## Recorded output

```
SQLite 3.54.1, sqlite-vec v0.1.9, better-sqlite3 13.1.1, Node.js v22.23.4
Migrations: 0001_initial.sql, 0002_add_fact_confidence.sql, 0003_add_feedback.sql, then the draft 0004_purge.sql
secure_delete when a connection opens: 0

A: the purge transaction, with FTS5 secure-delete turned off
  purge set: sources s-1, s-1b; facts f-1, f-1e; explaining sources s-2, s-3, s-5
  table audit_log: not found
  table entity: not found
  table fact: not found
  table fact_confidence: not found
  table fact_embedding: not found
  table fact_fts: not found
  table fact_fts_config: not found
  table fact_fts_data: found in fact_fts_data.block
  table fact_fts_docsize: not found
  table fact_fts_idx: not found
  table fact_source: not found
  table feedback: not found
  table source: not found
  table sqlite_sequence: not found
  keyword index (MATCH ZEBRA7731): not found
  vector entries of purged facts: not found
  bytes of the database file, connection open (4096 bytes): not found
  bytes of the write-ahead log, connection open (745752 bytes): found
  bytes of the database file after the connection closed (126976 bytes): found
  unrelated fact u-1, its source and its vector: unchanged
  rows: fact 4 -> 4, source 6 -> 6, audit 10 -> 17 (7 purge entries added, none removed)
  f-2, the correction from an explaining source: statement "The deploy key is KEY-B", live true, purged false, so an orphaned fact
  updates outside the design's condition refused: 8 of 8

B: the purge transaction, with PRAGMA secure_delete
  purge set: sources s-1, s-1b; facts f-1, f-1e; explaining sources s-2, s-3, s-5
  table audit_log: not found
  table entity: not found
  table fact: not found
  table fact_confidence: not found
  table fact_embedding: not found
  table fact_fts: not found
  table fact_fts_config: not found
  table fact_fts_data: not found
  table fact_fts_docsize: not found
  table fact_fts_idx: not found
  table fact_source: not found
  table feedback: not found
  table source: not found
  table sqlite_sequence: not found
  keyword index (MATCH ZEBRA7731): not found
  vector entries of purged facts: not found
  bytes of the database file, connection open (4096 bytes): not found
  bytes of the write-ahead log, connection open (737512 bytes): found
  bytes of the database file after the connection closed (126976 bytes): found
  unrelated fact u-1, its source and its vector: unchanged
  rows: fact 4 -> 4, source 6 -> 6, audit 10 -> 17 (7 purge entries added, none removed)
  f-2, the correction from an explaining source: statement "The deploy key is KEY-B", live true, purged false, so an orphaned fact
  updates outside the design's condition refused: 8 of 8

C: the purge transaction, with FTS5 secure-delete turned off, then VACUUM and wal_checkpoint(TRUNCATE)
  purge set: sources s-1, s-1b; facts f-1, f-1e; explaining sources s-2, s-3, s-5
  table audit_log: not found
  table entity: not found
  table fact: not found
  table fact_confidence: not found
  table fact_embedding: not found
  table fact_fts: not found
  table fact_fts_config: not found
  table fact_fts_data: found in fact_fts_data.block
  table fact_fts_docsize: not found
  table fact_fts_idx: not found
  table fact_source: not found
  table feedback: not found
  table source: not found
  table sqlite_sequence: not found
  keyword index (MATCH ZEBRA7731): not found
  vector entries of purged facts: not found
  bytes of the database file, connection open (126976 bytes): found
  bytes of the write-ahead log, connection open (0 bytes): not found
  bytes of the database file after the connection closed (126976 bytes): found
  unrelated fact u-1, its source and its vector: unchanged
  rows: fact 4 -> 4, source 6 -> 6, audit 10 -> 17 (7 purge entries added, none removed)
  f-2, the correction from an explaining source: statement "The deploy key is KEY-B", live true, purged false, so an orphaned fact
  updates outside the design's condition refused: 8 of 8

D: the design: the purge transaction, then VACUUM and wal_checkpoint(TRUNCATE)
  purge set: sources s-1, s-1b; facts f-1, f-1e; explaining sources s-2, s-3, s-5
  table audit_log: not found
  table entity: not found
  table fact: not found
  table fact_confidence: not found
  table fact_embedding: not found
  table fact_fts: not found
  table fact_fts_config: not found
  table fact_fts_data: not found
  table fact_fts_docsize: not found
  table fact_fts_idx: not found
  table fact_source: not found
  table feedback: not found
  table source: not found
  table sqlite_sequence: not found
  keyword index (MATCH ZEBRA7731): not found
  vector entries of purged facts: not found
  bytes of the database file, connection open (126976 bytes): not found
  bytes of the write-ahead log, connection open (0 bytes): not found
  bytes of the database file after the connection closed (126976 bytes): not found
  unrelated fact u-1, its source and its vector: unchanged
  rows: fact 4 -> 4, source 6 -> 6, audit 10 -> 17 (7 purge entries added, none removed)
  f-2, the correction from an explaining source: statement "The deploy key is KEY-B", live true, purged false, so an orphaned fact
  updates outside the design's condition refused: 8 of 8

E: the design and PRAGMA secure_delete as well
  purge set: sources s-1, s-1b; facts f-1, f-1e; explaining sources s-2, s-3, s-5
  table audit_log: not found
  table entity: not found
  table fact: not found
  table fact_confidence: not found
  table fact_embedding: not found
  table fact_fts: not found
  table fact_fts_config: not found
  table fact_fts_data: not found
  table fact_fts_docsize: not found
  table fact_fts_idx: not found
  table fact_source: not found
  table feedback: not found
  table source: not found
  table sqlite_sequence: not found
  keyword index (MATCH ZEBRA7731): not found
  vector entries of purged facts: not found
  bytes of the database file, connection open (126976 bytes): not found
  bytes of the write-ahead log, connection open (0 bytes): not found
  bytes of the database file after the connection closed (126976 bytes): not found
  unrelated fact u-1, its source and its vector: unchanged
  rows: fact 4 -> 4, source 6 -> 6, audit 10 -> 17 (7 purge entries added, none removed)
  f-2, the correction from an explaining source: statement "The deploy key is KEY-B", live true, purged false, so an orphaned fact
  updates outside the design's condition refused: 8 of 8

The spike passed: run D, the design, leaves the marker nowhere.
```
