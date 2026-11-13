// Question: can exact time-filtered KNN use a plain table + vec_distance_cosine(), with no vec0 table?
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
const N = Number(process.argv[2] ?? 10000), D = Number(process.argv[3] ?? 768);
const db = new Database(':memory:'); sqliteVec.load(db);
db.exec(`create table fact(id integer primary key, namespace text not null, valid_from text, valid_to text, created_at text not null, invalidated_at text);
create table fact_embedding(fact_id integer primary key, embedding blob not null);
create virtual table vec_fact using vec0(fact_id integer primary key, embedding float[${D}] distance_metric=cosine);`);
let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const vec = () => { const v = new Float32Array(D); let n = 0; for (let i = 0; i < D; i++) { v[i] = rnd() - 0.5; n += v[i] ** 2; } n = Math.sqrt(n); for (let i = 0; i < D; i++) v[i] /= n; return v; };
const insF = db.prepare('insert into fact values (?,?,?,?,?,?)'), insE = db.prepare('insert into fact_embedding values (?,?)'), insV = db.prepare('insert into vec_fact(fact_id, embedding) values (?,?)');
db.transaction(() => { for (let i = 1; i <= N; i++) { const v = Buffer.from(vec().buffer);
  insF.run(i, i % 10 === 0 ? 'other' : 'repo', null, i % 7 === 0 ? '2026-06-01T00:00:00.000Z' : null, '2026-01-01T00:00:00.000Z', i % 5 === 0 ? '2026-07-01T00:00:00.000Z' : null);
  insE.run(i, v); insV.run(BigInt(i), v); } })();
const q = Buffer.from(vec().buffer);
const time = (label, fn) => { fn(); const t = process.hrtime.bigint(); let r; for (let i = 0; i < 5; i++) r = fn(); console.log(label.padEnd(58), (Number(process.hrtime.bigint() - t) / 5e6).toFixed(1) + ' ms', '| top:', r.slice(0, 3).map(x => x.fact_id).join(',')); return r; };
const now = '2026-11-13T00:00:00.000Z';
const scalar = db.prepare(`select e.fact_id, vec_distance_cosine(e.embedding, ?) as distance from fact f join fact_embedding e on e.fact_id = f.id
 where f.namespace = 'repo' and f.created_at <= ? and (f.invalidated_at is null or f.invalidated_at > ?) and (f.valid_from is null or f.valid_from <= ?) and (f.valid_to is null or f.valid_to > ?)
 order by distance limit 10`);
const scalarAll = db.prepare(`select fact_id, vec_distance_cosine(embedding, ?) as distance from fact_embedding order by distance limit 10`);
const knn = db.prepare(`select fact_id, distance from vec_fact where embedding match ? and k = 10 order by distance`);
console.log({ N, D, vec_version: db.prepare('select vec_version() v').get().v });
const a = time('plain table + vec_distance_cosine, no filter', () => scalarAll.all(q));
const b = time('vec0 KNN, no filter', () => knn.all(q));
console.log('same top-10 as vec0:', JSON.stringify(a.map(x => x.fact_id)) === JSON.stringify(b.map(x => x.fact_id)));
const c = time('plain table + vec_distance_cosine, exact bi-temporal filter', () => scalar.all(q, now, now, now, now));
const live = db.prepare(`select count(*) c from fact f where f.namespace = 'repo' and (f.invalidated_at is null or f.invalidated_at > ?) and (f.valid_to is null or f.valid_to > ?)`).get(now, now).c;
console.log('rows passing the filter:', live, '| every result passes it:', c.every(x => x.fact_id % 10 !== 0 && x.fact_id % 5 !== 0 && x.fact_id % 7 !== 0));
