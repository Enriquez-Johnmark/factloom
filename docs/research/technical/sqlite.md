# SQLite for Factloom: driver, vector extension, FTS5, graph traversal

Accessed: 2026-11-13.

Versions were read from the npm registry on 2026-11-13. Everything marked "ran it" was executed in
this session (Linux x64, Node.js v22.23.4). The main evidence is the spike committed at
`spikes/sqlite-vec-fts5/`; its README holds the complete recorded output.

## Question

Which SQLite driver and vector extension should Factloom's local storage use, can one SQLite file
serve vector search, keyword search and graph traversal with a bi-temporal filter, and what is
known about running the same thing on macOS with Apple Silicon?

## Findings

### Driver

| | better-sqlite3 | `node:sqlite` (built in) | libsql |
| --- | --- | --- | --- |
| Version | 13.1.1 (published 2026-11-11) | Part of Node.js | `libsql` 0.5.29, `@libsql/client` 0.18.0 |
| Status | Stable 13.x line; 13.0.0 published 2026-07-21 | Node 22: "Stability 1.1, Active development", prints an `ExperimentalWarning`. Node 24: release candidate since v24.15.0. Node 26: release candidate (since v25.7.0) | Stable client for a fork of SQLite |
| Bundled SQLite | 3.54.1 (ran it) | 3.53.4 in Node v22.23.4 (ran it); changes with the Node version | Not checked |
| FTS5 | Compiled in (ran it) | Compiled in: `ENABLE_FTS5` (ran it) | Not checked |
| Load extensions | `db.loadExtension(path)` (ran it) | `new DatabaseSync(path, { allowExtension: true })`, then `db.loadExtension(path)`; available since v22.13.0 (ran it) | Not checked |
| Native binary to install | Yes, prebuilt, inside the npm package | None | Yes |
| API | Synchronous | Synchronous ("All APIs exposed by this class execute synchronously") | Not checked |

Sources: `npm view`; https://github.com/WiseLibs/better-sqlite3/releases;
https://nodejs.org/docs/latest-v22.x/api/sqlite.html, `/latest-v24.x/`, `/latest-v26.x/`;
the spike output. All rows **confirmed** unless they say "Not checked".

Details on better-sqlite3 13 (**confirmed**):

- Since 13.0.0 it is built on N-API. The release note says the prebuilt binaries "should
  theoretically work across Node.js and Electron versions". The deprecated `prebuild-install`
  dependency is gone and the binaries ship inside the package. Source: release notes for v13.0.0.
- The 13.1.1 tarball contains `prebuilds/` with `darwin-arm64.node`, `darwin-x64.node`,
  `linux-x64.node`, `linux-arm64.node`, `linuxmusl-x64.node`, `linuxmusl-arm64.node`,
  `win32-x64.node` and `win32-arm64.node`. Checked by listing the installed package; `file` reports
  `darwin-arm64.node` as "Mach-O 64-bit arm64 bundle". The GitHub release page itself lists only
  source archives, which agrees with the binaries living in the npm package.
- It has no install script (`npm view better-sqlite3@13.1.1 scripts` shows none; `gypfile` is
  `false`). Ran it: pnpm 12.18.0 installed it without any `allowBuilds` entry and it loaded
  sqlite-vec.
- `engines` is `node >= 22`.
- Release caution: v13.1.0 is marked "NOT A VIABLE RELEASE" on the release page (a failing Windows
  arm64 build) and was replaced the same day by 13.1.1, which is two days old today.
- It binds every JavaScript number as REAL. This matters for sqlite-vec (see below). Ran it.
- Observed connection defaults when reopening a file (ran it): `foreign_keys = 1`,
  `synchronous = 1` (NORMAL), `busy_timeout = 5000`, `cache_size = -16000`.

Sync API and an MCP server: both usable drivers block the event loop while a statement runs. For a
stdio MCP server with one client that sends one tool call at a time, this is acceptable
(**likely**; reasoning, not a measurement of the server). Two rules follow: do not hold a
transaction open across an `await` (LLM calls happen outside transactions), and keep single
statements short. Measured cost of the slowest kind of statement is in the next section.

Recommendation: **better-sqlite3 13.1.1**, behind the storage package's own interface. Reasons: its
API is stable while `node:sqlite` is still "Active development" on Node 22; the SQLite version is
pinned by the lockfile instead of changing with the installed Node; it no longer needs a compiler
or an install script. `node:sqlite` is a proven fallback: the second spike script runs the same
queries with it. It would not remove the native dependency, because sqlite-vec is itself a native
binary.

### Vector extension: sqlite-vec

- Version: **0.1.9** is `latest` (published 2026-03-31). `alpha` is 0.1.10-alpha.4 (2026-05-18).
  The repository states: "sqlite-vec is a pre-v1, so expect breaking changes!" and its versioning
  page says a minor release such as 0.2.0 may break. **confirmed.** Sources: npm registry;
  https://github.com/asg017/sqlite-vec (README.md, site/versioning.md, cloned 2026-11-13).
- npm packaging: `sqlite-vec` is a small loader with five optional platform packages, all at
  0.1.9: `sqlite-vec-darwin-arm64`, `sqlite-vec-darwin-x64`, `sqlite-vec-linux-x64`,
  `sqlite-vec-linux-arm64`, `sqlite-vec-windows-x64`. **confirmed** (`npm view sqlite-vec
  optionalDependencies`; `npm view sqlite-vec-darwin-arm64 version` prints 0.1.9). The
  darwin-arm64 tarball was downloaded and inspected: it contains `vec0.dylib`, which `file` reports
  as "Mach-O 64-bit arm64 dynamically linked shared library". There is no package for musl Linux
  (Alpine) or Windows arm64.
- Maintenance: the last commit on `main` is dated 2026-05-17 (about six months ago). npm shows no
  release between 0.1.7-alpha.2 (2025-01-10) and 0.1.7-alpha.10 (2026-02-13); the v0.1.7 release
  note (2026-03-17) says "After a long hiatus, I am now working again". Five releases followed in
  March 2026. The issue tracker shows 166 open issues, among them #226 ("hasn't been updated for
  half a year. Is it no longer being maintained?", 2025-06-08) and #221 ("Status of sqlite-vec:
  Production Readiness", 2025-05-14). **confirmed.** Sources: `git log` of the clone; npm `time`;
  https://github.com/asg017/sqlite-vec/releases; https://github.com/asg017/sqlite-vec/issues.
- Search method: in 0.1.9 a KNN query is a brute-force scan. Approximate indexes exist only in the
  0.1.10 alphas: "new ANN indexes: rescore, ivf (experimental, not enabled), and DiskANN"
  (release note for v0.1.10-alpha.1). The tracking issue for ANN, #25, is still open.
  **confirmed.**

`vec0` virtual table features (source: site/features/vec0.md and site/features/knn.md in the
repository; items marked "ran it" were executed with 0.1.9):

| Feature | Fact |
| --- | --- |
| Vector column types | `float[N]`, `int8[N]`, `bit[N]` (ran it: all three accepted) |
| Distance metric | Per column: `distance_metric=cosine`, `L2` (default) or `L1` (ran it: all three accepted; `hamming` is rejected for a float column) |
| Maximum dimensions | 8192 per vector column (ran it: `float[8193]` is rejected) |
| Maximum `k` | 4096 (ran it: `k = 4097` is rejected) |
| KNN syntax | `where embedding match :query and k = 10`, result column `distance`. `limit 10` instead of `k` works on SQLite 3.41 or later |
| Metadata columns | Up to 16. Types `text`, `integer`, `float`, `boolean`. Usable in the `where` of a KNN query with `= != > >= < <=` only (booleans: `=` and `!=`). They filter during the search, so `k` rows that satisfy the filter come back (ran it) |
| Partition key columns | Up to 4. Shard the index; an `=` constraint restricts the scan to that shard. The documentation advises hundreds of vectors per key value |
| Auxiliary columns | Up to 16, written `+name type`. Stored beside the index, returned by `select`, not usable in a KNN `where` |
| Primary key | `name integer primary key`, or the implicit `rowid` |

Limitations found by running (all **confirmed**, in the spike's section 10):

- A metadata column cannot hold NULL: `Expected integer for INTEGER metadata column valid_to_ms,
  received NULL`. An open-ended `valid_to` therefore needs a sentinel value in the vector table.
- Integer primary keys and INTEGER or BOOLEAN metadata values must arrive as SQLite integers. Both
  drivers bind a JavaScript number as REAL, which is rejected (`Only integers are allows for
  primary key values`; the wording is the library's). Passing `BigInt` values works.
- Metadata filters cannot use `IS NULL`, `LIKE` or functions (documentation).
- Deletes: the v0.1.7 note describes "proper DELETE support, which clears space once roughly 1024
  vectors are deleted", and v0.1.9 fixes a DELETE error for long text metadata. Factloom never
  deletes facts, so the exposure is small; an update of a metadata column was run and worked.

Cost of brute force, measured in this session with 0.1.9 (4 vCPU Xeon 2.1 GHz, in-memory database,
768-dimension float vectors, cosine, `k = 10`, median of 5 queries):

| Vectors | KNN query | KNN with a boolean metadata filter | Process memory |
| --- | --- | --- | --- |
| 10,000 | 13.6 ms | 7.4 ms | 101 MB |
| 50,000 | 63.2 ms | 41.4 ms | 235 MB |
| 100,000 | 129.7 ms | 90.5 ms | 402 MB |

**confirmed** (ran it; throwaway script, not in the repository). Query time grows linearly with the
number of vectors and with the dimension. Inserting 100,000 vectors took under 3 seconds in total.

Alternatives, briefly:

| Option | Status | Safer choice? |
| --- | --- | --- |
| sqlite-vss 0.1.2 | Its README says it "is not in active development" and points to sqlite-vec. Last npm publish 2023. **confirmed** (https://github.com/asg017/sqlite-vss). | No |
| libSQL native vectors | Vector column types (for example `F32_BLOB(n)`), `vector_distance_cos`, a DiskANN index created with `libsql_vector_idx`, queried with `vector_top_k`. **confirmed** from https://docs.turso.tech/features/ai-and-embeddings. It is a fork of SQLite with its own driver, so it replaces both better-sqlite3 and sqlite-vec. Not run. | Not clearly. It moves the dependency from an extension to a database fork |
| vectorlite 0.2.0 | Last npm publish 2024-08-19. **confirmed** (npm). Not examined further. | No |
| No extension: store vectors as BLOBs and compute distances in JavaScript | Always possible. The same linear scan, in slower code. | Fallback only |

No alternative is clearly safer than sqlite-vec for a local, single-file store today. The risk is
its pre-v1 status and uneven release rhythm, not its function: everything Factloom needs from it
ran.

### FTS5

- Available in both drivers' bundled SQLite. **confirmed**, ran it
  (`sqlite_compileoption_used('ENABLE_FTS5')` returns 1).
- External-content tables: `create virtual table facts_fts using fts5(text, content='facts',
  content_rowid='id')` stores the index without a second copy of the text. Keeping it in step with
  the content table is the application's job; the documentation gives the three triggers (after
  insert, after delete, after update) that the spike uses. External-content tables do not support
  `REPLACE` conflict handling. `insert into facts_fts(facts_fts) values ('rebuild')` rebuilds and
  `'integrity-check'` verifies. **confirmed.** Source: https://www.sqlite.org/fts5.html section
  4.4.3; ran the triggers and the integrity check.
- Ranking: `bm25(facts_fts)` returns a value where a better match is numerically lower, so
  `order by bm25(facts_fts)` lists the best match first. `k1` and `b` are fixed at 1.2 and 0.75.
  **confirmed** (same page, section on bm25; ran it).
- Tokenizers (**confirmed**, same page section 4.3; behaviour ran in the spike's section 6):

| Tokenizer | Behaviour | On code identifiers (ran it) |
| --- | --- | --- |
| `unicode61` (default) | Splits on anything that is not a letter or digit; case-insensitive; `remove_diacritics`, `tokenchars`, `separators` options | `user_repository` is indexed as `user` and `repository`, so either word finds it. `getUserById` is one token: found only by the whole word, in any letter case. `UserBy` finds nothing |
| `unicode61 tokenchars '_'` | Underscore becomes part of a token | `user_repository` is one token; searching `repository` no longer finds it |
| `porter` | A wrapper that stems English words (correction, corrected, correcting) | Not run. Stemming is for prose and can distort identifiers |
| `trigram` | Indexes every 3-character sequence; matches substrings of 3 or more characters; can also serve `LIKE '%x%'` | Finds `UserBy` inside `getUserById`. The index is larger |

  For code identifiers no single tokenizer covers both needs. The default `unicode61` handles
  snake_case, paths and whole camelCase names; only `trigram` matches part of a camelCase name.

### Graph traversal

A recursive common table expression walks an edge table. The spike treats each fact with an
`object_id` as an edge from `subject_id` to `object_id` and runs:

```sql
with recursive walk(entity_id, depth, path) as (
  select :start, 0, '/' || :start || '/'
  union all
  select f.object_id, walk.depth + 1, walk.path || f.object_id || '/'
  from walk
  join facts f on f.subject_id = walk.entity_id
  where f.object_id is not null
    and walk.depth < :max_depth
    and instr(walk.path, '/' || f.object_id || '/') = 0   -- do not revisit: stops cycles
    and f.valid_from <= :as_of and (f.valid_to is null or f.valid_to > :as_of)
    and f.created_at <= :known_at and (f.invalidated_at is null or f.invalidated_at > :known_at)
)
select e.name, min(walk.depth) as depth, min(walk.path) as path
from walk join entities e on e.id = walk.entity_id
where walk.depth > 0
group by e.id
order by depth, e.name;
```

**confirmed**, ran it. The depth limit and the time filter both behave as intended: with
`max_depth = 1` only direct neighbours return; "as of" March 2026 the walk reaches `npm` where "as
of" November 2026 it reaches `pnpm`; with both times set to 2026-02-05 it reaches `Jest`, a fact
that was retracted five days later. The path column is the cycle guard; it grows with depth, which
is acceptable for the small depths a memory query uses.

### The spike

Location: `spikes/sqlite-vec-fts5/` (`package.json` with exact versions, `package-lock.json`,
`spike.mjs`, `spike-node-sqlite.mjs`, `README.md` with the full recorded output). It was run from a
clean `npm ci`. Both scripts exit with code 0.

What `node spike.mjs` proved on Linux (**confirmed**):

| Step | Result |
| --- | --- |
| Open with better-sqlite3, load sqlite-vec | `sqlite_version: '3.54.1'`, `vec_version: 'v0.1.9'`, `fts5_compiled_in: true` |
| Create schema | `entities`; `facts` with `valid_from`, `valid_to`, `created_at`, `invalidated_at`, `superseded_by`, `source`, `confidence`; FTS5 external-content index with triggers; `vec0` table with three time metadata columns. 9 entities, 8 facts, 8 FTS rows, 8 vectors |
| KNN | Query vector for "package manager" returns fact 2 (pnpm, distance 0.0069), then fact 1 (npm, 0.0121) |
| KNN with time filter inside the search | As of 2026-11-13: fact 2 first, fact 1 absent. As of 2026-03-15: fact 1 first, fact 2 absent |
| FTS5 with `bm25()` | `package manager` returns facts 1 and 2 with score -1.4604 and highlighted snippets |
| Recursive CTE | Five reachable entities within 3 hops; results change correctly with both time parameters |
| Hybrid, one SQL statement | KNN and FTS5 ranked separately, fused by reciprocal rank fusion (`1 / (60 + rank)`) with a `full join`, then time-filtered. As of 2026-11-13 fact 2 is first (score 0.03279); as of 2026-03-15 fact 1 is first (0.03226) |
| Invalidate, never delete | Setting `invalidated_at` and the vector table's `is_live` flag removes the fact from filtered KNN results; the row stays; the FTS integrity check passes |

`node spike-node-sqlite.mjs` ran the same four kinds of query with `node:sqlite` (SQLite 3.53.4)
and produced the same rankings. **confirmed.**

Two ways to apply the time filter to vector search were both run, and they differ:

- Inside the search, through `vec0` metadata columns. Returns a full `k` rows that satisfy the
  filter. Requires the time fields to be copied into the vector table as integers and kept in step
  when a fact is invalidated.
- After the search, by joining to `facts`. Needs no copies, but must fetch more than `k` candidates
  and can still return fewer than wanted when many near neighbours are filtered out.

### macOS on Apple Silicon

Nothing here was run on a Mac. Label: **likely**, from package contents and documentation.

- better-sqlite3 13.1.1 contains `prebuilds/darwin-arm64.node` (arm64 Mach-O, inspected).
- `sqlite-vec-darwin-arm64@0.1.9` exists on npm and contains an arm64 `vec0.dylib` (inspected). The
  loader picks the package from `process.platform` and `process.arch` and loads `vec0.dylib`.
- The known macOS pitfall: Apple's system SQLite library is built without extension loading. The
  sqlite-vec documentation describes it for Python ("The default SQLite library that is bundled
  with Mac operating systems do not include support for SQLite extensions") and mentions the same
  for Bun. Source: site/using/python.md and site/using/js.md in the sqlite-vec repository.
  **confirmed** as a documented pitfall.
- Relevance to Node: it applies to runtimes that link the system library. better-sqlite3 compiles
  its own SQLite into the addon, and Node.js bundles its own SQLite (`process.versions.sqlite`), so
  neither uses Apple's library. **likely**: this follows from how the two are built and from the
  Linux run, where both report their own SQLite versions (3.54.1 and 3.53.4); it was not observed
  on macOS.

One command for the Mac, from the repository root:

```sh
cd spikes/sqlite-vec-fts5 && npm ci && node spike.mjs
```

Expected: the output recorded in the spike README, with `platform: 'darwin-arm64'`,
`sqlite_version: '3.54.1'`, `vec_version: 'v0.1.9'`, and a last line `SPIKE OK`. Any exception
means the check failed; the README lists the likely causes.

### WAL mode and other PRAGMAs

Sources: https://www.sqlite.org/wal.html and https://www.sqlite.org/pragma.html. All **confirmed**
in those pages; the block below was also run against a file database with better-sqlite3.

| PRAGMA | Why | Notes from the documentation |
| --- | --- | --- |
| `journal_mode = WAL` | Readers do not block the writer and the writer does not block readers | Persistent: stored in the file. One writer at a time. Does not work on a network filesystem. Adds `-wal` and `-shm` files that belong to the database |
| `synchronous = NORMAL` | "The best balance between performance and safety for most applications running in WAL mode" | The database stays consistent; a transaction committed just before a power loss may roll back |
| `foreign_keys = ON` | Enforce the links from facts to sources and to superseding facts | Off by default in SQLite. Per connection. A no-op inside a transaction. better-sqlite3 turns it on by default (observed) |
| `busy_timeout = 5000` | Wait instead of failing when another process holds the write lock, for example a second agent's MCP server on the same file | Milliseconds. better-sqlite3's default is 5000 (observed) |
| `trusted_schema = OFF` | Recommended by SQLite for every connection | On by default for backwards compatibility |
| `optimize` | Keeps the query planner's statistics fresh | "Run `PRAGMA optimize` once, just prior to closing each database connection"; for long-lived connections `PRAGMA optimize=0x10002` on open and `PRAGMA optimize` periodically |
| `user_version` | Free integer in the file header | A place to record the schema migration number |
| `application_id` | Free integer in the file header | Identifies the file type; optional |

```js
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.pragma("trusted_schema = OFF");
// before close: db.pragma("optimize");
```

Ran it: after closing and reopening the file, `journal_mode` was still `wal`. Not set:
`cache_size`, `mmap_size`, `temp_store`. No measurement shows a need for them.

`trusted_schema = OFF` restricts what triggers and views may call, so it was checked against the
spike: a copy of `spike.mjs` with `db.pragma("trusted_schema = OFF")` added after opening produced
output identical to the recorded run, including the FTS5 triggers and all `vec0` queries. Ran it
(scratch copy; the committed spike uses the default).

### What would differ in Postgres with pgvector

Brief, for phase 4. Source for the pgvector facts: https://github.com/pgvector/pgvector (README,
v0.8.7). **confirmed** from the README; nothing was run.

| Topic | SQLite today | Postgres + pgvector later |
| --- | --- | --- |
| Vectors | Separate `vec0` virtual table; brute force | A `vector(n)` column on the facts table itself; exact search or HNSW / IVFFlat indexes (indexable up to 2,000 dimensions for `vector`) |
| Time filter with vectors | Metadata columns inside `vec0`, or post-filter | An ordinary `where` on the same row; with approximate indexes filtering happens after the index scan unless iterative scans are enabled (`hnsw.iterative_scan`) |
| Distance | `distance` column from `match`; metric fixed per column | Operators `<->` (L2), `<=>` (cosine), `<#>` (negative inner product); metric chosen by the index operator class |
| Keyword search | FTS5, `bm25()` | Built-in full-text search (`tsvector`, `tsquery`); ranking functions differ from BM25 (**likely**; not checked today) |
| Graph | Recursive CTE | The same recursive CTE syntax (**likely**; standard SQL) |
| Time columns | ISO-8601 text | `timestamptz`, and range types become available (**likely**; not checked today) |
| Driver | Synchronous | Asynchronous, networked, with a connection pool (**likely**) |
| Index sync | Triggers and application code | Indexes are maintained by the database |

The points where the two differ are vector storage, keyword ranking and synchronous versus
asynchronous calls. A storage interface that returns promises and hides the fusion of the three
result lists keeps those differences inside the storage package.

## What it means for Factloom

- Use better-sqlite3 13.1.1 and sqlite-vec 0.1.9, pinned exactly. Keep both behind the storage
  interface. No part of `core` or `graph-rag` should import either.
- One SQLite file can do all three retrieval methods with a bi-temporal filter. The spike is a
  working reference for the SQL.
- Make the storage interface asynchronous (return promises) even though the first implementation
  is synchronous. Postgres will need it, and it costs nothing now.
- Brute-force vector search is enough for phase 1. At 100,000 facts with 768-dimension embeddings
  a query took about 130 ms on this machine. Embedding dimension is a direct cost: prefer a smaller
  embedding size if the model offers one. Revisit when a single store approaches a few hundred
  thousand facts.
- Treat the vector table as a rebuildable index, not as a source of truth. Keep the embedding (or
  the means to recompute it) outside `vec0`, so a breaking sqlite-vec release or a move to another
  engine means re-indexing, not data loss.
- Decide how the time filter reaches vector search: copies of the time fields as `vec0` metadata
  columns (complete results, more bookkeeping) or post-filtering with over-fetch (simpler, can
  under-return). The spike shows both. The fact-schema design should record the choice.
- Open-ended validity needs a sentinel integer in `vec0`, because metadata columns reject NULL.
  Pass integers to `vec0` as `BigInt`.
- For keyword search over code, start with the default `unicode61` tokenizer. Add a second
  `trigram` index only if substring search inside identifiers turns out to matter.
- Set the five PRAGMAs above on every connection and run `PRAGMA optimize` before closing.
- The spike uses UTC ISO-8601 text for the four time columns because it sorts correctly as text and
  reads well in a database browser. This is an illustration, not a schema decision.

## Open questions

- **unverified:** the macOS arm64 run. The command is in the section above.
- **unverified:** sqlite-vec's future release rhythm and whether 0.1.10 will change the on-disk
  format of `vec0` tables. The release notes read today do not say.
- **unverified:** KNN speed on a file database larger than memory, and on Apple Silicon. The
  measurement above is in-memory on a server CPU.
- **unverified:** concurrent access by two MCP server processes (two agents on one repository)
  to one WAL database with sqlite-vec loaded. WAL allows one writer; `busy_timeout` should cover
  short contention, but it was not exercised.
- **unverified:** whether libSQL's vector features work on a local file through the `libsql` npm
  package, and whether such a file stays readable by stock SQLite. The page read today does not
  say.
- **unverified:** better-sqlite3 on Node 24 and 26. The N-API build should make the Node version
  irrelevant (the release note's own wording is "should theoretically work"); only Node 22.23.4
  was run.
- Not examined: SQLite's FTS5 `prefix` option, contentless-delete tables, and `porter` stemming on
  real fact text.
