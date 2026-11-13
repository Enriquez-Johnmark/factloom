// Factloom spike: one SQLite file doing vector search, keyword search and graph traversal
// over bi-temporal facts. Driver: better-sqlite3. Vector extension: sqlite-vec.
//
// Run: npm ci && node spike.mjs
//
// The embeddings are hand-written 4-dimensional toy vectors, so the script needs no model
// and no network. Axes: [package manager, database, testing, code symbol].

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

const db = new Database(":memory:");
sqliteVec.load(db);

const section = (title) => console.log(`\n== ${title}`);
const show = (rows) => console.table(rows);
const vec = (numbers) => Buffer.from(new Float32Array(numbers).buffer);
// better-sqlite3 binds every JS number as REAL. vec0 primary keys and INTEGER/BOOLEAN metadata
// columns reject REAL, so integers bound into facts_vec are passed as BigInt.
const ms = (iso) => BigInt(Date.parse(iso));
const OPEN_END = BigInt(Number.MAX_SAFE_INTEGER); // stands in for "no end": vec0 has no IS NULL

// ---------------------------------------------------------------------------------------------
section("1. Environment");
db.pragma("journal_mode = WAL"); // reports "memory" for an in-memory database
db.pragma("foreign_keys = ON");
console.log({
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  sqlite_version: db.prepare("select sqlite_version() as v").pluck().get(),
  vec_version: db.prepare("select vec_version() as v").pluck().get(),
  fts5_compiled_in: db.prepare("select sqlite_compileoption_used('ENABLE_FTS5') as v").pluck().get() === 1,
  foreign_keys: db.pragma("foreign_keys", { simple: true }),
});

// ---------------------------------------------------------------------------------------------
section("2. Schema: entities, bi-temporal facts, FTS5 external-content index, vec0 table");
db.exec(`
  create table entities (
    id   text primary key,
    name text not null,
    kind text not null
  ) strict;

  -- Valid time: when the fact was true in the world. Transaction time: when Factloom
  -- recorded it and when it retracted it. All four are UTC ISO-8601 text, which sorts
  -- correctly as text. A fact is never deleted; it is invalidated.
  create table facts (
    id             integer primary key,
    subject_id     text not null references entities(id),
    predicate      text not null,
    object_id      text references entities(id),
    text           text not null,
    valid_from     text not null,
    valid_to       text,
    created_at     text not null,
    invalidated_at text,
    superseded_by  integer references facts(id),
    source         text not null,
    confidence     real not null check (confidence between 0 and 1)
  ) strict;
  create index facts_subject on facts(subject_id);
  create index facts_object  on facts(object_id);

  -- External-content FTS5 table: the index stores no copy of the text. Triggers keep it
  -- in sync, following https://www.sqlite.org/fts5.html#external_content_tables
  create virtual table facts_fts using fts5(
    text,
    content = 'facts',
    content_rowid = 'id',
    tokenize = "unicode61 remove_diacritics 2"
  );
  create trigger facts_ai after insert on facts begin
    insert into facts_fts(rowid, text) values (new.id, new.text);
  end;
  create trigger facts_ad after delete on facts begin
    insert into facts_fts(facts_fts, rowid, text) values ('delete', old.id, old.text);
  end;
  create trigger facts_au after update of text on facts begin
    insert into facts_fts(facts_fts, rowid, text) values ('delete', old.id, old.text);
    insert into facts_fts(rowid, text) values (new.id, new.text);
  end;

  -- vec0 table. The three metadata columns copy the time fields as integers so a KNN query
  -- can filter by time while it searches (metadata columns support = != < <= > >= only).
  create virtual table facts_vec using vec0(
    fact_id       integer primary key,
    embedding     float[4] distance_metric=cosine,
    valid_from_ms integer,
    valid_to_ms   integer,
    is_live       boolean
  );
`);

const insertEntity = db.prepare("insert into entities (id, name, kind) values (?, ?, ?)");
const insertFact = db.prepare(`
  insert into facts (id, subject_id, predicate, object_id, text, valid_from, valid_to,
                     created_at, invalidated_at, superseded_by, source, confidence)
  values (@id, @subject, @predicate, @object, @text, @validFrom, @validTo,
          @createdAt, @invalidatedAt, @supersededBy, @source, @confidence)`);
const insertVec = db.prepare(`
  insert into facts_vec (fact_id, embedding, valid_from_ms, valid_to_ms, is_live)
  values (?, ?, ?, ?, ?)`);

const entities = [
  ["repo", "factloom repository", "repository"],
  ["npm", "npm", "tool"],
  ["pnpm", "pnpm", "tool"],
  ["storage", "packages/storage", "package"],
  ["bsqlite", "better-sqlite3", "library"],
  ["sqlite", "SQLite", "database"],
  ["jest", "Jest", "tool"],
  ["vitest", "Vitest", "tool"],
  ["userrepo", "user_repository.ts", "file"],
];

const T = (date) => `${date}T00:00:00.000Z`;
const facts = [
  // Fact 1 stopped being true on 2026-06-01 (valid time closed). It is still believed.
  { id: 1, subject: "repo", predicate: "uses", object: "npm", text: "The factloom repository uses npm as its package manager", validFrom: T("2026-01-01"), validTo: T("2026-06-01"), createdAt: T("2026-01-05"), invalidatedAt: null, supersededBy: null, embedding: [0.9, 0.1, 0.0, 0.1] },
  { id: 2, subject: "repo", predicate: "uses", object: "pnpm", text: "The factloom repository uses pnpm as its package manager", validFrom: T("2026-06-01"), validTo: null, createdAt: T("2026-06-02"), invalidatedAt: null, supersededBy: null, embedding: [0.95, 0.05, 0.0, 0.1] },
  { id: 3, subject: "repo", predicate: "contains", object: "storage", text: "The factloom repository contains the package packages/storage", validFrom: T("2026-03-01"), validTo: null, createdAt: T("2026-03-01"), invalidatedAt: null, supersededBy: null, embedding: [0.3, 0.5, 0.0, 0.3] },
  { id: 4, subject: "storage", predicate: "uses", object: "bsqlite", text: "packages/storage opens SQLite databases with the better-sqlite3 driver", validFrom: T("2026-03-01"), validTo: null, createdAt: T("2026-03-02"), invalidatedAt: null, supersededBy: null, embedding: [0.1, 0.9, 0.0, 0.2] },
  { id: 5, subject: "bsqlite", predicate: "bundles", object: "sqlite", text: "better-sqlite3 bundles its own SQLite build with FTS5 enabled", validFrom: T("2026-01-01"), validTo: null, createdAt: T("2026-03-02"), invalidatedAt: null, supersededBy: null, embedding: [0.0, 0.95, 0.1, 0.0] },
  // Fact 6 was wrong. It was retracted on 2026-02-10 and replaced by fact 7 (transaction time closed).
  { id: 6, subject: "repo", predicate: "tests_with", object: "jest", text: "Tests in the factloom repository run with Jest", validFrom: T("2026-01-01"), validTo: null, createdAt: T("2026-02-01"), invalidatedAt: T("2026-02-10"), supersededBy: 7, embedding: [0.0, 0.0, 0.9, 0.1] },
  { id: 7, subject: "repo", predicate: "tests_with", object: "vitest", text: "Tests in the factloom repository run with Vitest through runAllTests in test_runner.ts", validFrom: T("2026-01-01"), validTo: null, createdAt: T("2026-02-10"), invalidatedAt: null, supersededBy: null, embedding: [0.0, 0.05, 0.9, 0.3] },
  { id: 8, subject: "userrepo", predicate: "defines", object: null, text: "The function getUserById in user_repository.ts reads the users table", validFrom: T("2026-04-01"), validTo: null, createdAt: T("2026-04-01"), invalidatedAt: null, supersededBy: null, embedding: [0.0, 0.3, 0.0, 0.9] },
];

db.transaction(() => {
  for (const entity of entities) insertEntity.run(...entity);
  // Insert in an order that satisfies the superseded_by foreign key (7 before 6).
  for (const fact of [...facts].sort((a, b) => (a.supersededBy ? 1 : 0) - (b.supersededBy ? 1 : 0))) {
    insertFact.run({ ...fact, source: "spike", confidence: 0.9 });
    insertVec.run(
      BigInt(fact.id),
      vec(fact.embedding),
      ms(fact.validFrom),
      fact.validTo ? ms(fact.validTo) : OPEN_END,
      fact.invalidatedAt ? 0n : 1n,
    );
  }
})();
console.log({
  entities: db.prepare("select count(*) from entities").pluck().get(),
  facts: db.prepare("select count(*) from facts").pluck().get(),
  fts_rows: db.prepare("select count(*) from facts_fts").pluck().get(),
  vec_rows: db.prepare("select count(*) from facts_vec").pluck().get(),
});

// The temporal predicate used everywhere below.
//   :as_of     valid time: "what was true in the world at this instant"
//   :known_at  transaction time: "according to what Factloom believed at this instant"
const TEMPORAL = `
      f.valid_from <= :as_of and (f.valid_to is null or f.valid_to > :as_of)
  and f.created_at <= :known_at and (f.invalidated_at is null or f.invalidated_at > :known_at)`;
const NOW = "2026-11-13T00:00:00.000Z";

// ---------------------------------------------------------------------------------------------
section("3. KNN (cosine) for the query vector [1, 0, 0, 0] = 'package manager', no time filter");
show(
  db.prepare(`
    select v.fact_id, round(v.distance, 4) as distance, f.text
    from facts_vec v join facts f on f.id = v.fact_id
    where v.embedding match :query and v.k = 3
    order by v.distance`).all({ query: vec([1, 0, 0, 0]) }),
);

section("4. KNN with the time filter applied inside the vector search (vec0 metadata columns)");
const knnAsOf = db.prepare(`
  select v.fact_id, round(v.distance, 4) as distance, f.text
  from facts_vec v join facts f on f.id = v.fact_id
  where v.embedding match :query and v.k = 2
    and v.is_live = true
    and v.valid_from_ms <= :as_of_ms and v.valid_to_ms > :as_of_ms
  order by v.distance`);
console.log("as of 2026-11-13 (expect fact 2, pnpm, first):");
show(knnAsOf.all({ query: vec([1, 0, 0, 0]), as_of_ms: ms(NOW) }));
console.log("as of 2026-03-15 (expect fact 1, npm, first):");
show(knnAsOf.all({ query: vec([1, 0, 0, 0]), as_of_ms: ms(T("2026-03-15")) }));

// ---------------------------------------------------------------------------------------------
section("5. FTS5 with bm25() ranking (lower is better), query: package manager");
show(
  db.prepare(`
    select f.id, round(bm25(facts_fts), 4) as bm25, snippet(facts_fts, 0, '[', ']', '…', 8) as snippet
    from facts_fts join facts f on f.id = facts_fts.rowid
    where facts_fts match :q
    order by bm25(facts_fts)`).all({ q: "package manager" }),
);

section("6. Tokenizers and code identifiers: unicode61 vs trigram");
db.exec(`
  create virtual table tok_unicode61 using fts5(text, tokenize = "unicode61");
  create virtual table tok_identifier using fts5(text, tokenize = "unicode61 tokenchars '_'");
  create virtual table tok_trigram using fts5(text, tokenize = "trigram");
`);
for (const table of ["tok_unicode61", "tok_identifier", "tok_trigram"]) {
  db.prepare(`insert into ${table}(rowid, text) select id, text from facts`).run();
}
const matchIds = (table, q) => {
  try {
    return db.prepare(`select rowid from ${table} where ${table} match ? order by rowid`).pluck().all(q).join(",") || "-";
  } catch (error) {
    return `error: ${error.message}`;
  }
};
show(
  ["getUserById", "UserBy", "user_repository", "repository", "runalltests", "test_runner"].map((q) => ({
    query: q,
    "unicode61 (default)": matchIds("tok_unicode61", `"${q}"`),
    "unicode61 tokenchars '_'": matchIds("tok_identifier", `"${q}"`),
    trigram: matchIds("tok_trigram", `"${q}"`),
  })),
);

// ---------------------------------------------------------------------------------------------
section("7. Recursive CTE: entities reachable from 'repo' within 3 hops, with the time filter");
const traverse = db.prepare(`
  with recursive walk(entity_id, depth, path) as (
    select :start, 0, '/' || :start || '/'
    union all
    select f.object_id, walk.depth + 1, walk.path || f.object_id || '/'
    from walk
    join facts f on f.subject_id = walk.entity_id
    where f.object_id is not null
      and walk.depth < :max_depth
      and instr(walk.path, '/' || f.object_id || '/') = 0   -- do not revisit: stops cycles
      and ${TEMPORAL}
  )
  select e.name, min(walk.depth) as depth, min(walk.path) as path
  from walk join entities e on e.id = walk.entity_id
  where walk.depth > 0
  group by e.id
  order by depth, e.name`);
console.log("as of 2026-11-13, known at 2026-11-13 (expect pnpm and Vitest; no npm, no Jest):");
show(traverse.all({ start: "repo", max_depth: 3, as_of: NOW, known_at: NOW }));
console.log("as of 2026-03-15, known at 2026-11-13 (expect npm instead of pnpm):");
show(traverse.all({ start: "repo", max_depth: 3, as_of: T("2026-03-15"), known_at: NOW }));
console.log("as of 2026-02-05, known at 2026-02-05 (expect Jest: the mistake had not been corrected yet):");
show(traverse.all({ start: "repo", max_depth: 3, as_of: T("2026-02-05"), known_at: T("2026-02-05") }));
console.log("max_depth = 1 (expect direct neighbours only):");
show(traverse.all({ start: "repo", max_depth: 1, as_of: NOW, known_at: NOW }));

// ---------------------------------------------------------------------------------------------
section("8. Hybrid search in one SQL statement: KNN + FTS5 fused with reciprocal rank fusion");
// Each arm over-fetches (k = 8), the time filter is applied on the facts table, then ranks
// are fused: score = sum over arms of 1 / (60 + rank). FULL JOIN needs SQLite 3.39 or later.
const hybrid = db.prepare(`
  with
  vec_hits as (
    select v.fact_id as id, row_number() over (order by v.distance) as rank
    from facts_vec v
    where v.embedding match :query_vec and v.k = :fetch
  ),
  fts_hits as (
    select facts_fts.rowid as id, row_number() over (order by bm25(facts_fts)) as rank
    from facts_fts
    where facts_fts match :query_text
    limit :fetch
  ),
  fused as (
    select coalesce(vec_hits.id, fts_hits.id) as id,
           vec_hits.rank as vec_rank,
           fts_hits.rank as fts_rank,
           coalesce(1.0 / (:rrf_k + vec_hits.rank), 0) + coalesce(1.0 / (:rrf_k + fts_hits.rank), 0) as score
    from vec_hits full join fts_hits on fts_hits.id = vec_hits.id
  )
  select f.id, round(fused.score, 5) as rrf_score, fused.vec_rank, fused.fts_rank, f.text
  from fused join facts f on f.id = fused.id
  where ${TEMPORAL}
  order by fused.score desc
  limit :limit`);
const hybridArgs = { query_vec: vec([1, 0, 0, 0]), query_text: "package OR manager OR pnpm", fetch: 8, rrf_k: 60, limit: 3 };
console.log("as of 2026-11-13 (expect fact 2, pnpm, first; fact 1 filtered out):");
show(hybrid.all({ ...hybridArgs, as_of: NOW, known_at: NOW }));
console.log("as of 2026-03-15 (expect fact 1, npm, first; fact 2 filtered out):");
show(hybrid.all({ ...hybridArgs, as_of: T("2026-03-15"), known_at: NOW }));

// ---------------------------------------------------------------------------------------------
section("9. Invalidate, never delete: correcting a fact keeps every index consistent");
db.transaction(() => {
  db.prepare("update facts set invalidated_at = ? where id = ?").run(NOW, 8);
  db.prepare("update facts_vec set is_live = false where fact_id = ?").run(8n);
})();
console.log({
  fact_8_still_stored: db.prepare("select count(*) from facts where id = 8").pluck().get() === 1,
  knn_live_only_returns_fact_8: db
    .prepare("select fact_id from facts_vec where embedding match ? and k = 8 and is_live = true")
    .pluck()
    .all(vec([0, 0.3, 0, 0.9]))
    .includes(8),
  fts_integrity_check: (() => {
    db.prepare("insert into facts_fts(facts_fts, rank) values ('integrity-check', 1)").run();
    return "ok";
  })(),
});

section("10. Limits observed in this build of sqlite-vec");
const attempt = (label, fn) => {
  try {
    fn();
    return { check: label, result: "accepted" };
  } catch (error) {
    return { check: label, result: `rejected: ${error.message}` };
  }
};
show([
  attempt("vec0 column float[8192]", () => db.exec("create virtual table t_8192 using vec0(e float[8192])")),
  attempt("vec0 column float[8193]", () => db.exec("create virtual table t_8193 using vec0(e float[8193])")),
  attempt("KNN with k = 4096", () => db.prepare("select fact_id from facts_vec where embedding match ? and k = 4096").all(vec([1, 0, 0, 0]))),
  attempt("KNN with k = 4097", () => db.prepare("select fact_id from facts_vec where embedding match ? and k = 4097").all(vec([1, 0, 0, 0]))),
  attempt("NULL in a vec0 metadata column", () => db.prepare("insert into facts_vec (fact_id, embedding, valid_from_ms, valid_to_ms, is_live) values (?, ?, ?, ?, ?)").run(99n, vec([1, 0, 0, 0]), 0n, null, 1n)),
  attempt("vec0 primary key bound as JS number", () => db.prepare("insert into facts_vec (fact_id, embedding, valid_from_ms, valid_to_ms, is_live) values (?, ?, ?, ?, ?)").run(98, vec([1, 0, 0, 0]), 0n, 1n, 1n)),
]);

db.close();
console.log("\nSPIKE OK");
