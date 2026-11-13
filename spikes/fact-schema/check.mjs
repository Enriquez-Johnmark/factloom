// Runs the draft first migration and checks the rules it must enforce.
// Timeline used below:
//   2026-01-10  recorded: the repository uses PostgreSQL 14 (true since 2025-06-01)
//   2026-01-10  recorded: CI runs on Node 20                 (this was wrong)
//   2026-04-02  learned:  PostgreSQL was upgraded to 16 on 2026-03-15   -> succession
//   2026-05-01  learned:  CI has always run on Node 22                  -> correction
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const db = new Database(':memory:');
sqliteVec.load(db);
db.pragma('foreign_keys = ON');
db.exec(readFileSync(new URL('./0001_initial.sql', import.meta.url), 'utf8'));

const NS = 'repo:example';
const at = (day) => `${day}T00:00:00.000Z`;
const vector = (...v) => Buffer.from(new Float32Array(v).buffer);
let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const rejects = (fn, pattern) => assert.throws(fn, pattern);

const insertEntity = db.prepare('INSERT INTO entity VALUES (?, ?, ?, ?, ?, ?)');
const insertSource = db.prepare("INSERT INTO source (id, namespace, kind, content, observed_at, created_at) VALUES (?, ?, 'agent_note', ?, ?, ?)");
const insertFact = db.prepare(`INSERT INTO fact (id, namespace, subject_entity_id, predicate, object_value, statement, confidence, valid_from, valid_to, created_at)
  VALUES (@id, '${NS}', @subject, @predicate, @value, @statement, 1, @validFrom, @validTo, @createdAt)`);
const linkSource = db.prepare('INSERT INTO fact_source VALUES (?, ?)');
const insertEmbedding = db.prepare("INSERT INTO fact_embedding VALUES (?, 'toy', 4, ?)");
const invalidate = db.prepare('UPDATE fact SET invalidated_at = ?, superseded_by_fact_id = ? WHERE id = ?');
const audit = db.prepare(`INSERT INTO audit_log (namespace, operation_id, operation, action, target_kind, target_id, trigger, reason_code, source_id, occurred_at)
  VALUES ('${NS}', ?, ?, ?, 'fact', ?, 'agent', ?, ?, ?)`);

const record = (fact, sourceId, embedding) => { insertFact.run(fact); linkSource.run(fact.id, sourceId); insertEmbedding.run(fact.id, embedding); };

// --- 2026-01-10: two facts recorded
insertEntity.run('e-repo', NS, 'repository', 'example', 'example', at('2026-01-10'));
insertSource.run('s-1', NS, 'We run PostgreSQL 14. CI runs on Node 20.', at('2026-01-10'), at('2026-01-10'));
record({ id: 'pg14', subject: 'e-repo', predicate: 'uses_database_version', value: 'PostgreSQL 14', statement: 'The example repository uses PostgreSQL 14', validFrom: at('2025-06-01'), validTo: null, createdAt: at('2026-01-10') }, 's-1', vector(1, 0, 0, 0));
record({ id: 'node20', subject: 'e-repo', predicate: 'ci_node_version', value: 'Node 20', statement: 'CI for the example repository runs on Node 20', validFrom: null, validTo: null, createdAt: at('2026-01-10') }, 's-1', vector(0, 1, 0, 0));

// --- 2026-04-02: succession. The old fact is revised to end; the new fact is recorded.
insertSource.run('s-2', NS, 'We upgraded to PostgreSQL 16 on 15 March.', at('2026-04-02'), at('2026-04-02'));
db.transaction(() => {
  record({ id: 'pg14-ended', subject: 'e-repo', predicate: 'uses_database_version', value: 'PostgreSQL 14', statement: 'The example repository uses PostgreSQL 14', validFrom: at('2025-06-01'), validTo: at('2026-03-15'), createdAt: at('2026-04-02') }, 's-1', vector(1, 0, 0, 0));
  linkSource.run('pg14-ended', 's-2'); // the source that reported the end
  invalidate.run(at('2026-04-02'), 'pg14-ended', 'pg14');
  record({ id: 'pg16', subject: 'e-repo', predicate: 'uses_database_version', value: 'PostgreSQL 16', statement: 'The example repository uses PostgreSQL 16', validFrom: at('2026-03-15'), validTo: null, createdAt: at('2026-04-02') }, 's-2', vector(0.9, 0.1, 0, 0));
  for (const [action, id] of [['fact.recorded', 'pg14-ended'], ['fact.invalidated', 'pg14'], ['fact.recorded', 'pg16']]) audit.run('op-2', 'succession', action, id, 'reported_ended', 's-2', at('2026-04-02'));
})();

// --- 2026-05-01: correction. The old fact was wrong; it is invalidated and superseded.
insertSource.run('s-3', NS, 'CI has always been on Node 22, not 20.', at('2026-05-01'), at('2026-05-01'));
db.transaction(() => {
  record({ id: 'node22', subject: 'e-repo', predicate: 'ci_node_version', value: 'Node 22', statement: 'CI for the example repository runs on Node 22', validFrom: null, validTo: null, createdAt: at('2026-05-01') }, 's-3', vector(0, 0.9, 0.1, 0));
  invalidate.run(at('2026-05-01'), 'node22', 'node20');
  for (const [action, id] of [['fact.recorded', 'node22'], ['fact.invalidated', 'node20']]) audit.run('op-3', 'correction', action, id, 'reported_wrong', 's-3', at('2026-05-01'));
})();

// One predicate answers every time question. validAt is the as-of date, knownAt the known-at date.
const TIME = `f.created_at <= @knownAt AND (f.invalidated_at IS NULL OR f.invalidated_at > @knownAt)
  AND (f.valid_from IS NULL OR f.valid_from <= @validAt) AND (f.valid_to IS NULL OR f.valid_to > @validAt)`;
const factsAt = db.prepare(`SELECT f.id FROM fact f WHERE f.namespace = '${NS}' AND ${TIME} ORDER BY f.id`);
const ids = (validAt, knownAt) => factsAt.all({ validAt: at(validAt), knownAt: at(knownAt) }).map((r) => r.id);
const NOW = '2026-11-13';

check('now: only the current facts are returned', () => assert.deepEqual(ids(NOW, NOW), ['node22', 'pg16']));
check('as of 2026-02-01: PostgreSQL 14 was true then, and the corrected Node fact applies', () => assert.deepEqual(ids('2026-02-01', NOW), ['node22', 'pg14-ended']));
check('as of the day of the upgrade: the interval is half-open, so only PostgreSQL 16', () => assert.deepEqual(ids('2026-03-15', NOW), ['node22', 'pg16']));
check('known at 2026-02-01: Factloom then believed PostgreSQL 14 and Node 20', () => assert.deepEqual(ids('2026-02-01', '2026-02-01'), ['node20', 'pg14']));
check('known at 2026-04-01, as of 2026-04-01: the upgrade was not yet known, so still PostgreSQL 14', () => assert.deepEqual(ids('2026-04-01', '2026-04-01'), ['node20', 'pg14']));
check('known at 2026-04-10, as of 2026-04-10: upgrade known, Node correction not yet', () => assert.deepEqual(ids('2026-04-10', '2026-04-10'), ['node20', 'pg16']));
check('before anything was recorded: nothing is returned', () => assert.deepEqual(ids('2026-01-01', '2026-01-01'), []));

check('keyword lane uses the same time filter', () => {
  const rows = db.prepare(`SELECT f.id FROM fact_fts JOIN fact f ON f.rowid = fact_fts.rowid WHERE fact_fts MATCH 'postgresql' AND f.namespace = '${NS}' AND ${TIME} ORDER BY bm25(fact_fts)`);
  assert.deepEqual(rows.all({ validAt: at(NOW), knownAt: at(NOW) }).map((r) => r.id), ['pg16']);
  assert.deepEqual(rows.all({ validAt: at('2026-02-01'), knownAt: at(NOW) }).map((r) => r.id), ['pg14-ended']);
});
check('vector lane uses the same time filter', () => {
  const rows = db.prepare(`SELECT f.id FROM fact f JOIN fact_embedding e ON e.fact_id = f.id WHERE f.namespace = '${NS}' AND ${TIME} ORDER BY vec_distance_cosine(e.embedding, @query) LIMIT 1`);
  assert.deepEqual(rows.all({ validAt: at(NOW), knownAt: at(NOW), query: vector(1, 0, 0, 0) }).map((r) => r.id), ['pg16']);
  assert.deepEqual(rows.all({ validAt: at('2026-02-01'), knownAt: at(NOW), query: vector(1, 0, 0, 0) }).map((r) => r.id), ['pg14-ended']);
});
check('fact history: every row for a subject and predicate, with its supersession link', () => {
  const rows = db.prepare(`SELECT id, valid_to, invalidated_at, superseded_by_fact_id FROM fact WHERE namespace = '${NS}' AND subject_entity_id = 'e-repo' AND predicate = 'uses_database_version' ORDER BY created_at, id`).all();
  assert.deepEqual(rows.map((r) => [r.id, r.superseded_by_fact_id]), [['pg14', 'pg14-ended'], ['pg14-ended', null], ['pg16', null]]);
});
check('audit log: one entry per change, grouped by operation', () => {
  const rows = db.prepare("SELECT operation, action, target_id FROM audit_log WHERE operation_id = 'op-2' ORDER BY id").all();
  assert.deepEqual(rows.map((r) => `${r.action}:${r.target_id}`), ['fact.recorded:pg14-ended', 'fact.invalidated:pg14', 'fact.recorded:pg16']);
});

check('a fact cannot be deleted', () => rejects(() => db.prepare("DELETE FROM fact WHERE id = 'pg16'").run(), /never deleted/));
check('a fact cannot be edited', () => {
  rejects(() => db.prepare("UPDATE fact SET statement = 'x' WHERE id = 'pg16'").run(), /only by being invalidated once/);
  rejects(() => db.prepare("UPDATE fact SET valid_to = ? WHERE id = 'pg16'").run(at(NOW)), /only by being invalidated once/);
  rejects(() => db.prepare("UPDATE fact SET confidence = 0.5 WHERE id = 'pg16'").run(), /only by being invalidated once/);
});
check('a fact cannot be invalidated twice or un-invalidated', () => {
  rejects(() => invalidate.run(at(NOW), null, 'pg14'), /only by being invalidated once/);
  rejects(() => db.prepare("UPDATE fact SET invalidated_at = NULL WHERE id = 'pg14'").run(), /only by being invalidated once/);
});
check('a supersession link requires an invalidation', () => rejects(() => db.prepare("UPDATE fact SET superseded_by_fact_id = 'pg14' WHERE id = 'pg16'").run(), /only by being invalidated once|CHECK/));
check('a timestamp in another format is rejected', () => {
  const bad = { id: 'bad', subject: 'e-repo', predicate: 'p', value: 'v', statement: 's', validFrom: null, validTo: null };
  for (const createdAt of ['2026-01-10 00:00:00', '2026-01-10T00:00:00Z', '2026-01-10T00:00:00.000+01:00', '2026-01-10']) rejects(() => insertFact.run({ ...bad, createdAt }), /CHECK/);
});
check('valid_from must be before valid_to', () => rejects(() => insertFact.run({ id: 'bad', subject: 'e-repo', predicate: 'p', value: 'v', statement: 's', validFrom: at('2026-02-01'), validTo: at('2026-02-01'), createdAt: at(NOW) }), /CHECK/));
check('a fact has exactly one kind of object', () => {
  rejects(() => db.prepare(`INSERT INTO fact (id, namespace, subject_entity_id, predicate, statement, confidence, created_at) VALUES ('bad', '${NS}', 'e-repo', 'p', 's', 1, ?)`).run(at(NOW)), /CHECK/);
  rejects(() => db.prepare(`INSERT INTO fact (id, namespace, subject_entity_id, predicate, object_entity_id, object_value, statement, confidence, created_at) VALUES ('bad', '${NS}', 'e-repo', 'p', 'e-repo', 'v', 's', 1, ?)`).run(at(NOW)), /CHECK/);
});
check('a fact must refer to an existing entity', () => rejects(() => insertFact.run({ id: 'bad', subject: 'e-missing', predicate: 'p', value: 'v', statement: 's', validFrom: null, validTo: null, createdAt: at(NOW) }), /FOREIGN KEY/));
check('the same entity cannot be created twice in a namespace', () => rejects(() => insertEntity.run('e-repo-2', NS, 'repository', 'Example', 'example', at(NOW)), /UNIQUE/));
check('audit entries cannot be changed or deleted', () => {
  rejects(() => db.prepare("UPDATE audit_log SET reason_code = 'x'").run(), /never changed/);
  rejects(() => db.prepare('DELETE FROM audit_log').run(), /never deleted/);
});
check('a fact cannot supersede itself or be superseded from another namespace', () => {
  insertEntity.run('e-other', 'repo:other', 'repository', 'other', 'other', at(NOW));
  db.prepare(`INSERT INTO fact (id, namespace, subject_entity_id, predicate, object_value, statement, confidence, created_at) VALUES ('other-1', 'repo:other', 'e-other', 'p', 'v', 's', 1, ?)`).run(at(NOW));
  rejects(() => invalidate.run(at(NOW), 'other-1', 'pg16'), /own namespace/);
  rejects(() => invalidate.run(at(NOW), 'pg16', 'pg16'), /CHECK/);
});
check('the row number that keyword search relies on cannot be changed', () => rejects(() => db.prepare("UPDATE fact SET rowid = rowid + 1000, invalidated_at = ? WHERE id = 'pg16'").run(at(NOW)), /only by being invalidated once/));
check('entities, sources and source links cannot be changed or deleted', () => {
  rejects(() => db.prepare("UPDATE entity SET name = 'x' WHERE id = 'e-repo'").run(), /never changed/);
  rejects(() => db.prepare("DELETE FROM entity WHERE id = 'e-other'").run(), /never deleted/);
  rejects(() => db.prepare("UPDATE source SET content = 'x' WHERE id = 's-1'").run(), /never changed/);
  rejects(() => db.prepare("DELETE FROM source WHERE id = 's-3'").run(), /never deleted/);
  rejects(() => db.prepare("DELETE FROM fact_source WHERE fact_id = 'pg16'").run(), /keeps its sources/);
});

// The single-value rule. A commit that records a fact for a single-valued predicate runs this
// query inside its transaction, after applying its changes, and fails if it returns a row.
// Two periods overlap unless one ends at or before the other starts; a missing bound is open.
const overlapping = db.prepare(`SELECT o.id FROM fact o WHERE o.namespace = '${NS}' AND o.subject_entity_id = @subject AND o.predicate = @predicate
  AND o.invalidated_at IS NULL AND o.id <> @id
  AND (o.valid_from IS NULL OR @validTo IS NULL OR o.valid_from < @validTo)
  AND (@validFrom IS NULL OR o.valid_to IS NULL OR @validFrom < o.valid_to) ORDER BY o.id`);
const overlaps = (validFrom, validTo) => overlapping.all({ id: 'candidate', subject: 'e-repo', predicate: 'uses_database_version', validFrom: validFrom && at(validFrom), validTo: validTo && at(validTo) }).map((r) => r.id);

check('single-value rule: a second open-ended value overlaps the current one', () => assert.deepEqual(overlaps('2026-06-01', null), ['pg16']));
check('single-value rule: an older fact arriving late overlaps the ended fact it would contradict', () => assert.deepEqual(overlaps('2024-01-01', '2025-09-01'), ['pg14-ended']));
check('single-value rule: an older fact that ends where the next begins does not overlap', () => assert.deepEqual(overlaps('2024-01-01', '2025-06-01'), []));
check('single-value rule: a fact dated in the future still overlaps the open-ended current one', () => assert.deepEqual(overlaps('2027-01-01', null), ['pg16']));
check('single-value rule: an unknown start overlaps everything before its end', () => assert.deepEqual(overlaps(null, '2025-07-01'), ['pg14-ended']));
check('correcting the date of a succession replaces both facts in one transaction and leaves no overlap or gap', () => {
  // The upgrade was on 2026-03-20, not 2026-03-15. Both neighbours are replaced together.
  db.transaction(() => {
    record({ id: 'pg14-ended-2', subject: 'e-repo', predicate: 'uses_database_version', value: 'PostgreSQL 14', statement: 'The example repository uses PostgreSQL 14', validFrom: at('2025-06-01'), validTo: at('2026-03-20'), createdAt: at('2026-06-01') }, 's-1', vector(1, 0, 0, 0));
    record({ id: 'pg16-2', subject: 'e-repo', predicate: 'uses_database_version', value: 'PostgreSQL 16', statement: 'The example repository uses PostgreSQL 16', validFrom: at('2026-03-20'), validTo: null, createdAt: at('2026-06-01') }, 's-2', vector(0.9, 0.1, 0, 0));
    invalidate.run(at('2026-06-01'), 'pg14-ended-2', 'pg14-ended');
    invalidate.run(at('2026-06-01'), 'pg16-2', 'pg16');
    for (const f of [{ id: 'pg14-ended-2', validFrom: at('2025-06-01'), validTo: at('2026-03-20') }, { id: 'pg16-2', validFrom: at('2026-03-20'), validTo: null }]) {
      assert.deepEqual(overlapping.all({ ...f, subject: 'e-repo', predicate: 'uses_database_version' }), []);
    }
  })();
  assert.deepEqual(ids('2026-03-17', NOW), ['node22', 'pg14-ended-2']);
  assert.deepEqual(ids('2026-03-17', '2026-05-15'), ['node22', 'pg16']); // what was believed before the date was corrected
});

check('no operation reduced the number of fact rows', () => assert.equal(db.prepare('SELECT count(*) AS n FROM fact').get().n, 8));

console.log(`\n${passed} checks passed on SQLite ${db.prepare('SELECT sqlite_version() AS v').get().v}, sqlite-vec ${db.prepare('SELECT vec_version() AS v').get().v}, Node ${process.version}`);
