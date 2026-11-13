# Spike: SQLite with sqlite-vec, FTS5 and recursive CTEs over bi-temporal facts

A standalone experiment. It is not part of the pnpm workspace and nothing imports it. It exists to
prove, with real output, that one SQLite file can serve the three retrieval methods Factloom needs
(vector search, keyword search, graph traversal) with a time filter, and to give a one-command check
for macOS on Apple Silicon. The research that uses it is in
`docs/research/technical/sqlite.md`.

## What is pinned

| Package | Version | Role |
| --- | --- | --- |
| better-sqlite3 | 13.1.1 | SQLite driver; bundles SQLite 3.54.1 with FTS5 |
| sqlite-vec | 0.1.9 | Vector extension (`vec0` virtual table), loaded at run time |

`package-lock.json` is committed, so `npm ci` installs exactly these versions. npm is used here on
purpose: a pnpm install inside the repository would attach to the workspace.

Requires Node.js 22.13 or later. No compiler is needed: both packages ship prebuilt binaries.

## How to run

```sh
cd spikes/sqlite-vec-fts5
npm ci
node spike.mjs                 # better-sqlite3 + sqlite-vec
node spike-node-sqlite.mjs     # the same idea with the built-in node:sqlite driver
```

Both scripts use an in-memory database and hand-written 4-dimensional vectors, so they need no
model, no network and leave no files behind. Each ends with a line containing `SPIKE OK` and exits
with code 0. Any exception means the check failed.

## What `spike.mjs` does

1. Opens a database, loads sqlite-vec, prints `sqlite_version()` and `vec_version()`.
2. Creates `entities`, a bi-temporal `facts` table (`valid_from`, `valid_to`, `created_at`,
   `invalidated_at`), an external-content FTS5 index kept in sync by triggers, and a `vec0` table
   with three metadata columns that mirror the time fields.
3. Runs a KNN query.
4. Runs the KNN query with the time filter applied inside the vector search.
5. Runs an FTS5 query ranked by `bm25()`.
6. Compares the `unicode61` and `trigram` tokenizers on code identifiers.
7. Walks the fact graph with a recursive CTE, with a depth limit, a cycle guard and the time filter.
8. Runs one hybrid SQL statement: KNN and FTS5 fused by reciprocal rank fusion, then time-filtered.
9. Invalidates a fact without deleting it and checks the indexes.
10. Records the limits this build enforces.

## Recorded output: `node spike.mjs`

Linux x64, Node.js v22.23.4, 2026-11-13, after a clean `npm ci`.

```text

== 1. Environment
{
  node: 'v22.23.4',
  platform: 'linux-x64',
  sqlite_version: '3.54.1',
  vec_version: 'v0.1.9',
  fts5_compiled_in: true,
  foreign_keys: 1
}

== 2. Schema: entities, bi-temporal facts, FTS5 external-content index, vec0 table
{ entities: 9, facts: 8, fts_rows: 8, vec_rows: 8 }

== 3. KNN (cosine) for the query vector [1, 0, 0, 0] = 'package manager', no time filter
┌─────────┬─────────┬──────────┬─────────────────────────────────────────────────────────────────┐
│ (index) │ fact_id │ distance │ text                                                            │
├─────────┼─────────┼──────────┼─────────────────────────────────────────────────────────────────┤
│ 0       │ 2       │ 0.0069   │ 'The factloom repository uses pnpm as its package manager'      │
│ 1       │ 1       │ 0.0121   │ 'The factloom repository uses npm as its package manager'       │
│ 2       │ 3       │ 0.5425   │ 'The factloom repository contains the package packages/storage' │
└─────────┴─────────┴──────────┴─────────────────────────────────────────────────────────────────┘

== 4. KNN with the time filter applied inside the vector search (vec0 metadata columns)
as of 2026-11-13 (expect fact 2, pnpm, first):
┌─────────┬─────────┬──────────┬─────────────────────────────────────────────────────────────────┐
│ (index) │ fact_id │ distance │ text                                                            │
├─────────┼─────────┼──────────┼─────────────────────────────────────────────────────────────────┤
│ 0       │ 2       │ 0.0069   │ 'The factloom repository uses pnpm as its package manager'      │
│ 1       │ 3       │ 0.5425   │ 'The factloom repository contains the package packages/storage' │
└─────────┴─────────┴──────────┴─────────────────────────────────────────────────────────────────┘
as of 2026-03-15 (expect fact 1, npm, first):
┌─────────┬─────────┬──────────┬─────────────────────────────────────────────────────────────────┐
│ (index) │ fact_id │ distance │ text                                                            │
├─────────┼─────────┼──────────┼─────────────────────────────────────────────────────────────────┤
│ 0       │ 1       │ 0.0121   │ 'The factloom repository uses npm as its package manager'       │
│ 1       │ 3       │ 0.5425   │ 'The factloom repository contains the package packages/storage' │
└─────────┴─────────┴──────────┴─────────────────────────────────────────────────────────────────┘

== 5. FTS5 with bm25() ranking (lower is better), query: package manager
┌─────────┬────┬─────────┬─────────────────────────────────────────────────────────────┐
│ (index) │ id │ bm25    │ snippet                                                     │
├─────────┼────┼─────────┼─────────────────────────────────────────────────────────────┤
│ 0       │ 1  │ -1.4604 │ '…factloom repository uses npm as its [package] [manager]'  │
│ 1       │ 2  │ -1.4604 │ '…factloom repository uses pnpm as its [package] [manager]' │
└─────────┴────┴─────────┴─────────────────────────────────────────────────────────────┘

== 6. Tokenizers and code identifiers: unicode61 vs trigram
┌─────────┬───────────────────┬─────────────────────┬──────────────────────────┬───────────────┐
│ (index) │ query             │ unicode61 (default) │ unicode61 tokenchars '_' │ trigram       │
├─────────┼───────────────────┼─────────────────────┼──────────────────────────┼───────────────┤
│ 0       │ 'getUserById'     │ '8'                 │ '8'                      │ '8'           │
│ 1       │ 'UserBy'          │ '-'                 │ '-'                      │ '8'           │
│ 2       │ 'user_repository' │ '8'                 │ '8'                      │ '8'           │
│ 3       │ 'repository'      │ '1,2,3,6,7,8'       │ '1,2,3,6,7'              │ '1,2,3,6,7,8' │
│ 4       │ 'runalltests'     │ '7'                 │ '7'                      │ '7'           │
│ 5       │ 'test_runner'     │ '7'                 │ '7'                      │ '7'           │
└─────────┴───────────────────┴─────────────────────┴──────────────────────────┴───────────────┘

== 7. Recursive CTE: entities reachable from 'repo' within 3 hops, with the time filter
as of 2026-11-13, known at 2026-11-13 (expect pnpm and Vitest; no npm, no Jest):
┌─────────┬────────────────────┬───────┬─────────────────────────────────┐
│ (index) │ name               │ depth │ path                            │
├─────────┼────────────────────┼───────┼─────────────────────────────────┤
│ 0       │ 'Vitest'           │ 1     │ '/repo/vitest/'                 │
│ 1       │ 'packages/storage' │ 1     │ '/repo/storage/'                │
│ 2       │ 'pnpm'             │ 1     │ '/repo/pnpm/'                   │
│ 3       │ 'better-sqlite3'   │ 2     │ '/repo/storage/bsqlite/'        │
│ 4       │ 'SQLite'           │ 3     │ '/repo/storage/bsqlite/sqlite/' │
└─────────┴────────────────────┴───────┴─────────────────────────────────┘
as of 2026-03-15, known at 2026-11-13 (expect npm instead of pnpm):
┌─────────┬────────────────────┬───────┬─────────────────────────────────┐
│ (index) │ name               │ depth │ path                            │
├─────────┼────────────────────┼───────┼─────────────────────────────────┤
│ 0       │ 'Vitest'           │ 1     │ '/repo/vitest/'                 │
│ 1       │ 'npm'              │ 1     │ '/repo/npm/'                    │
│ 2       │ 'packages/storage' │ 1     │ '/repo/storage/'                │
│ 3       │ 'better-sqlite3'   │ 2     │ '/repo/storage/bsqlite/'        │
│ 4       │ 'SQLite'           │ 3     │ '/repo/storage/bsqlite/sqlite/' │
└─────────┴────────────────────┴───────┴─────────────────────────────────┘
as of 2026-02-05, known at 2026-02-05 (expect Jest: the mistake had not been corrected yet):
┌─────────┬────────┬───────┬───────────────┐
│ (index) │ name   │ depth │ path          │
├─────────┼────────┼───────┼───────────────┤
│ 0       │ 'Jest' │ 1     │ '/repo/jest/' │
│ 1       │ 'npm'  │ 1     │ '/repo/npm/'  │
└─────────┴────────┴───────┴───────────────┘
max_depth = 1 (expect direct neighbours only):
┌─────────┬────────────────────┬───────┬──────────────────┐
│ (index) │ name               │ depth │ path             │
├─────────┼────────────────────┼───────┼──────────────────┤
│ 0       │ 'Vitest'           │ 1     │ '/repo/vitest/'  │
│ 1       │ 'packages/storage' │ 1     │ '/repo/storage/' │
│ 2       │ 'pnpm'             │ 1     │ '/repo/pnpm/'    │
└─────────┴────────────────────┴───────┴──────────────────┘

== 8. Hybrid search in one SQL statement: KNN + FTS5 fused with reciprocal rank fusion
as of 2026-11-13 (expect fact 2, pnpm, first; fact 1 filtered out):
┌─────────┬────┬───────────┬──────────┬──────────┬──────────────────────────────────────────────────────────────────────────┐
│ (index) │ id │ rrf_score │ vec_rank │ fts_rank │ text                                                                     │
├─────────┼────┼───────────┼──────────┼──────────┼──────────────────────────────────────────────────────────────────────────┤
│ 0       │ 2  │ 0.03279   │ 1        │ 1        │ 'The factloom repository uses pnpm as its package manager'               │
│ 1       │ 3  │ 0.03175   │ 3        │ 3        │ 'The factloom repository contains the package packages/storage'          │
│ 2       │ 4  │ 0.01563   │ 4        │ null     │ 'packages/storage opens SQLite databases with the better-sqlite3 driver' │
└─────────┴────┴───────────┴──────────┴──────────┴──────────────────────────────────────────────────────────────────────────┘
as of 2026-03-15 (expect fact 1, npm, first; fact 2 filtered out):
┌─────────┬────┬───────────┬──────────┬──────────┬──────────────────────────────────────────────────────────────────────────┐
│ (index) │ id │ rrf_score │ vec_rank │ fts_rank │ text                                                                     │
├─────────┼────┼───────────┼──────────┼──────────┼──────────────────────────────────────────────────────────────────────────┤
│ 0       │ 1  │ 0.03226   │ 2        │ 2        │ 'The factloom repository uses npm as its package manager'                │
│ 1       │ 3  │ 0.03175   │ 3        │ 3        │ 'The factloom repository contains the package packages/storage'          │
│ 2       │ 4  │ 0.01563   │ 4        │ null     │ 'packages/storage opens SQLite databases with the better-sqlite3 driver' │
└─────────┴────┴───────────┴──────────┴──────────┴──────────────────────────────────────────────────────────────────────────┘

== 9. Invalidate, never delete: correcting a fact keeps every index consistent
{
  fact_8_still_stored: true,
  knn_live_only_returns_fact_8: false,
  fts_integrity_check: 'ok'
}

== 10. Limits observed in this build of sqlite-vec
┌─────────┬───────────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ (index) │ check                                 │ result                                                                                                │
├─────────┼───────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 0       │ 'vec0 column float[8192]'             │ 'accepted'                                                                                            │
│ 1       │ 'vec0 column float[8193]'             │ 'rejected: vec0 constructor error: Dimension on vector column too large, provided 8193, maximum 8192' │
│ 2       │ 'KNN with k = 4096'                   │ 'accepted'                                                                                            │
│ 3       │ 'KNN with k = 4097'                   │ 'rejected: k value in knn query too large, provided 4097 and the limit is 4096'                       │
│ 4       │ 'NULL in a vec0 metadata column'      │ 'rejected: Expected integer for INTEGER metadata column valid_to_ms, received NULL'                   │
│ 5       │ 'vec0 primary key bound as JS number' │ 'rejected: Only integers are allows for primary key values on facts_vec'                              │
└─────────┴───────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────┘

SPIKE OK
```

## Recorded output: `node spike-node-sqlite.mjs`

Same machine and date. Node 22 prints an `ExperimentalWarning` for `node:sqlite` on stderr; it is
shown at the end.

```text
{
  node: 'v22.23.4',
  platform: 'linux-x64',
  sqlite_version: '3.53.4',
  vec_version: 'v0.1.9',
  fts5_compiled_in: true
}

== KNN
┌─────────┬─────────┬──────────┐
│ (index) │ fact_id │ distance │
├─────────┼─────────┼──────────┤
│ 0       │ 2       │ 0.0069   │
│ 1       │ 1       │ 0.0121   │
└─────────┴─────────┴──────────┘

== FTS5 bm25
┌─────────┬────┬─────────┐
│ (index) │ id │ bm25    │
├─────────┼────┼─────────┤
│ 0       │ 1  │ -0.5878 │
│ 1       │ 2  │ -0.5878 │
└─────────┴────┴─────────┘

== Recursive CTE, depth <= 2, as of 2026-11-13
┌─────────┬───────────┬───────┐
│ (index) │ node      │ depth │
├─────────┼───────────┼───────┤
│ 0       │ 'pnpm'    │ 1     │
│ 1       │ 'storage' │ 1     │
│ 2       │ 'vitest'  │ 1     │
│ 3       │ 'bsqlite' │ 2     │
└─────────┴───────────┴───────┘

== Hybrid (RRF) with time filter, as of 2026-11-13
┌─────────┬────┬───────────┬─────────────────────────────────────────────────────────────────┐
│ (index) │ id │ rrf_score │ text                                                            │
├─────────┼────┼───────────┼─────────────────────────────────────────────────────────────────┤
│ 0       │ 2  │ 0.03252   │ 'The factloom repository uses pnpm as its package manager'      │
│ 1       │ 3  │ 0.01587   │ 'The factloom repository contains the package packages/storage' │
└─────────┴────┴───────────┴─────────────────────────────────────────────────────────────────┘

NODE:SQLITE SPIKE OK
(node:14128) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
```

## What to expect on macOS (Apple Silicon)

Not run on a Mac. Expected from the package contents: `better-sqlite3@13.1.1` contains
`prebuilds/darwin-arm64.node` and `sqlite-vec@0.1.9` installs `sqlite-vec-darwin-arm64@0.1.9`,
which contains `vec0.dylib`.

One command from the repository root:

```sh
cd spikes/sqlite-vec-fts5 && npm ci && node spike.mjs
```

Expected: the same output as above, except that the first block reads
`platform: 'darwin-arm64'` and `node:` shows the local Node.js version. `sqlite_version` should be
`'3.54.1'` and `vec_version` `'v0.1.9'`, and the last line should be `SPIKE OK`.

If it fails:

- `Loadble extension for sqlite-vec not found` (the spelling is the library's): the platform
  package was not installed. Check that `node_modules/sqlite-vec-darwin-arm64/vec0.dylib` exists and
  that npm was not run with `--no-optional` or `--omit=optional`.
- An error from `dlopen` about an unverified developer or a blocked library: macOS refused to load
  one of the two binaries. Whether this can happen for files installed by npm was not verified;
  record the exact message.
- `Unsupported platform`: the Node.js binary is not arm64 or x64 (check `node -p process.arch`).
