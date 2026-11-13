// Same idea as spike.mjs, with the built-in node:sqlite driver instead of better-sqlite3.
// Shorter on purpose: it only shows that the built-in driver can load sqlite-vec and run
// the same four kinds of query. Requires Node.js 22.13 or later.
//
// Run: npm ci && node spike-node-sqlite.mjs

import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";

const db = new DatabaseSync(":memory:", { allowExtension: true });
sqliteVec.load(db);
db.enableLoadExtension(false); // nothing else needs to be loaded

const vec = (numbers) => new Uint8Array(new Float32Array(numbers).buffer);
const show = (title, rows) => {
  console.log(`\n== ${title}`);
  console.table(rows.map((row) => ({ ...row })));
};

console.log({
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  sqlite_version: db.prepare("select sqlite_version() as v").get().v,
  vec_version: db.prepare("select vec_version() as v").get().v,
  fts5_compiled_in: db.prepare("select sqlite_compileoption_used('ENABLE_FTS5') as v").get().v === 1,
});

db.exec(`
  create table facts (
    id integer primary key, subject text not null, object text, text text not null,
    valid_from text not null, valid_to text, created_at text not null, invalidated_at text
  ) strict;
  create virtual table facts_fts using fts5(text, content = 'facts', content_rowid = 'id');
  create trigger facts_ai after insert on facts begin
    insert into facts_fts(rowid, text) values (new.id, new.text);
  end;
  create virtual table facts_vec using vec0(fact_id integer primary key, embedding float[4] distance_metric=cosine);
`);

const rows = [
  [1, "repo", "npm", "The factloom repository uses npm as its package manager", "2026-01-01", "2026-06-01", [0.9, 0.1, 0, 0.1]],
  [2, "repo", "pnpm", "The factloom repository uses pnpm as its package manager", "2026-06-01", null, [0.95, 0.05, 0, 0.1]],
  [3, "repo", "storage", "The factloom repository contains the package packages/storage", "2026-03-01", null, [0.3, 0.5, 0, 0.3]],
  [4, "storage", "bsqlite", "packages/storage opens SQLite databases with the better-sqlite3 driver", "2026-03-01", null, [0.1, 0.9, 0, 0.2]],
  [5, "repo", "vitest", "Tests in the factloom repository run with Vitest", "2026-01-01", null, [0, 0.05, 0.9, 0.3]],
  [6, "bsqlite", "sqlite", "better-sqlite3 bundles its own SQLite build with FTS5 enabled", "2026-01-01", null, [0, 0.95, 0.1, 0]],
];
const insertFact = db.prepare("insert into facts values (?, ?, ?, ?, ?, ?, ?, null)");
const insertVec = db.prepare("insert into facts_vec (fact_id, embedding) values (?, ?)");
db.exec("begin");
for (const [id, subject, object, text, validFrom, validTo, embedding] of rows) {
  insertFact.run(id, subject, object, text, validFrom, validTo, validFrom);
  insertVec.run(BigInt(id), vec(embedding)); // like better-sqlite3, a JS number is bound as REAL
}
db.exec("commit");

show(
  "KNN",
  db.prepare(`
    select fact_id, round(distance, 4) as distance from facts_vec
    where embedding match ? and k = 2 order by distance`).all(vec([1, 0, 0, 0])),
);
show(
  "FTS5 bm25",
  db.prepare(`
    select rowid as id, round(bm25(facts_fts), 4) as bm25 from facts_fts
    where facts_fts match ? order by bm25(facts_fts)`).all("package manager"),
);
show(
  "Recursive CTE, depth <= 2, as of 2026-11-13",
  db.prepare(`
    with recursive walk(node, depth) as (
      select 'repo', 0
      union
      select f.object, walk.depth + 1 from walk join facts f on f.subject = walk.node
      where walk.depth < 2 and f.valid_from <= :as_of and (f.valid_to is null or f.valid_to > :as_of)
    )
    select node, min(depth) as depth from walk where depth > 0 group by node order by depth, node`).all({ as_of: "2026-11-13" }),
);
show(
  "Hybrid (RRF) with time filter, as of 2026-11-13",
  db.prepare(`
    with
    v as (select fact_id as id, row_number() over (order by distance) as rank
          from facts_vec where embedding match :qv and k = 4),
    t as (select rowid as id, row_number() over (order by bm25(facts_fts)) as rank
          from facts_fts where facts_fts match :qt limit 4),
    fused as (select coalesce(v.id, t.id) as id,
                     coalesce(1.0 / (60 + v.rank), 0) + coalesce(1.0 / (60 + t.rank), 0) as score
              from v full join t on t.id = v.id)
    select f.id, round(fused.score, 5) as rrf_score, f.text
    from fused join facts f on f.id = fused.id
    where f.valid_from <= :as_of and (f.valid_to is null or f.valid_to > :as_of)
    order by fused.score desc limit 2`).all({ qv: vec([1, 0, 0, 0]), qt: "package manager", as_of: "2026-11-13" }),
);

db.close();
console.log("\nNODE:SQLITE SPIKE OK");
