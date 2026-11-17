// Throwaway spike for FL-047: applies the purge design to a database file built from the
// project's migrations, unchanged, plus the draft 0004_purge.sql, and searches for the purged
// text everywhere. It runs the design four times, with different handling of freed pages, to
// show which steps are needed. Not the implementation.
//
// Memory built for each run (namespace repo:example):
//   s-1   source whose content and locator hold the marker; s-1b, a second row with the same text
//   f-1   fact from s-1 and s-1b whose statement and value hold the marker
//   f-1e  f-1 ended on 2026-03-01 (a revision copy), with the end note s-2
//   f-2   correction of f-1e, from s-3, a note that quotes the marker
//   fb-1  feedback on f-1e whose comment, source s-5, quotes the marker
//   u-1   an unrelated fact from s-4
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const MIGRATIONS = new URL('../../packages/storage/migrations/', import.meta.url);
const DRAFT = new URL('./0004_purge.sql', import.meta.url);
const NS = 'repo:example';
const MARKER = 'ZEBRA7731';
const PURGED = '[purged]';
const at = (day) => `${day}T00:00:00.000Z`;
const vector = (...v) => Buffer.from(new Float32Array(v).buffer);
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function open(path) {
  const db = new Database(path);
  sqliteVec.load(db);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function migrate(db) {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
  for (const name of files) db.exec(readFileSync(new URL(name, MIGRATIONS), 'utf8'));
  db.exec(readFileSync(DRAFT, 'utf8'));
  return files;
}

/** Builds the memory described at the top, with ordinary updates, as the store makes them. */
function build(db) {
  const entity = db.prepare('INSERT INTO entity VALUES (?, ?, ?, ?, ?, ?)');
  const source = db.prepare(
    `INSERT INTO source (id, namespace, kind, locator, content, content_hash, observed_at, created_at)
     VALUES (?, '${NS}', 'agent_note', ?, ?, ?, ?, ?)`,
  );
  const fact = db.prepare(
    `INSERT INTO fact (id, namespace, subject_entity_id, predicate, object_value, statement, confidence, valid_from, valid_to, created_at)
     VALUES (@id, '${NS}', 'e-repo', @predicate, @value, @statement, 0.9, @validFrom, @validTo, @createdAt)`,
  );
  const link = db.prepare('INSERT INTO fact_source VALUES (?, ?)');
  const embed = db.prepare("INSERT INTO fact_embedding VALUES (?, 'toy', 4, ?)");
  const copyEmbedding = db.prepare(
    "INSERT INTO fact_embedding SELECT ?, model, dimensions, embedding FROM fact_embedding WHERE fact_id = ?",
  );
  const invalidate = db.prepare('UPDATE fact SET invalidated_at = ?, superseded_by_fact_id = ? WHERE id = ?');
  const audit = db.prepare(
    `INSERT INTO audit_log (namespace, operation_id, operation, action, target_kind, target_id, trigger, reason_code, source_id, detail, occurred_at)
     VALUES ('${NS}', ?, ?, ?, ?, ?, 'agent', ?, ?, ?, ?)`,
  );
  const feedback = db.prepare(`INSERT INTO feedback VALUES (?, '${NS}', ?, ?, 'agent', ?, ?)`);
  const secretText = `The deploy key of the example repository is ${MARKER}.`;

  db.transaction(() => {
    entity.run('e-repo', NS, 'repository', 'example', 'example', at('2026-01-10'));
    source.run('s-1', `notes/${MARKER}.md`, secretText, sha256(secretText), at('2026-01-10'), at('2026-01-10'));
    source.run('s-1b', null, secretText, sha256(secretText), at('2026-01-10'), at('2026-01-10'));
    fact.run({ id: 'f-1', predicate: 'has_deploy_key', value: MARKER, statement: `The deploy key is ${MARKER}`, validFrom: null, validTo: null, createdAt: at('2026-01-10') });
    link.run('f-1', 's-1');
    link.run('f-1', 's-1b');
    embed.run('f-1', vector(1, 0, 0, 0));
    audit.run('op-1', 'remember', 'source.recorded', 'source', 's-1', 'stated', 's-1', null, at('2026-01-10'));
    audit.run('op-1', 'remember', 'fact.recorded', 'fact', 'f-1', 'stated', 's-1', null, at('2026-01-10'));
    const unrelated = 'The example repository uses pnpm.';
    source.run('s-4', null, unrelated, sha256(unrelated), at('2026-01-10'), at('2026-01-10'));
    fact.run({ id: 'u-1', predicate: 'uses_package_manager', value: 'pnpm', statement: 'The example repository uses pnpm', validFrom: null, validTo: null, createdAt: at('2026-01-10') });
    link.run('u-1', 's-4');
    embed.run('u-1', vector(0, 1, 0, 0));
    audit.run('op-1', 'remember', 'fact.recorded', 'fact', 'u-1', 'stated', 's-4', null, at('2026-01-10'));
  })();

  db.transaction(() => {
    source.run('s-2', null, 'The key was rotated on 1 March.', null, at('2026-03-02'), at('2026-03-02'));
    fact.run({ id: 'f-1e', predicate: 'has_deploy_key', value: MARKER, statement: `The deploy key is ${MARKER}`, validFrom: null, validTo: at('2026-03-01'), createdAt: at('2026-03-02') });
    link.run('f-1e', 's-1');
    link.run('f-1e', 's-2');
    copyEmbedding.run('f-1e', 'f-1');
    invalidate.run(at('2026-03-02'), 'f-1e', 'f-1');
    audit.run('op-2', 'revision', 'source.recorded', 'source', 's-2', 'reported_ended', 's-2', null, at('2026-03-02'));
    audit.run('op-2', 'revision', 'fact.recorded', 'fact', 'f-1e', 'reported_ended', 's-2', '{"revisesFactId":"f-1"}', at('2026-03-02'));
    audit.run('op-2', 'revision', 'fact.invalidated', 'fact', 'f-1', 'reported_ended', 's-2', '{"supersededByFactId":"f-1e"}', at('2026-03-02'));
  })();

  db.transaction(() => {
    const comment = `It never was ${MARKER}; that was the staging key.`;
    source.run('s-5', null, comment, sha256(comment), at('2026-03-05'), at('2026-03-05'));
    feedback.run('fb-1', 'f-1e', 'wrong', 's-5', at('2026-03-05'));
    audit.run('op-3', 'feedback', 'feedback.recorded', 'feedback', 'fb-1', 'feedback_given', 's-5', '{"factId":"f-1e"}', at('2026-03-05'));
  })();

  db.transaction(() => {
    const note = `Correction: the key was never ${MARKER}. It is KEY-B.`;
    source.run('s-3', null, note, sha256(note), at('2026-03-10'), at('2026-03-10'));
    fact.run({ id: 'f-2', predicate: 'has_deploy_key', value: 'KEY-B', statement: 'The deploy key is KEY-B', validFrom: null, validTo: at('2026-03-01'), createdAt: at('2026-03-10') });
    link.run('f-2', 's-3');
    embed.run('f-2', vector(0, 0, 1, 0));
    invalidate.run(at('2026-03-10'), 'f-2', 'f-1e');
    audit.run('op-4', 'correction', 'source.recorded', 'source', 's-3', 'reported_wrong', 's-3', null, at('2026-03-10'));
    audit.run('op-4', 'correction', 'fact.recorded', 'fact', 'f-2', 'reported_wrong', 's-3', null, at('2026-03-10'));
    audit.run('op-4', 'correction', 'fact.invalidated', 'fact', 'f-1e', 'reported_wrong', 's-3', '{"supersededByFactId":"f-2"}', at('2026-03-10'));
  })();
}

/**
 * The design's rule for what a purge of one source covers (ADR 0012, questions 1 to 3).
 * Sources: the target, and every source in the namespace with the same content hash.
 * Facts: those whose every source is one of these, and every copy of one of them, a copy
 * being a fact linked by supersession with the same subject, predicate and object.
 * Explaining sources: every source that an audit entry about one of those facts, or a
 * feedback row on one of them, names. Their content is purged; facts that came only from
 * them are left, as orphaned facts.
 */
function findPurgeSet(db, targetSourceId) {
  const target = db.prepare('SELECT id, content_hash FROM source WHERE id = ? AND namespace = ?').get(targetSourceId, NS);
  const sources = new Set([target.id]);
  if (target.content_hash !== null) {
    for (const { id } of db.prepare('SELECT id FROM source WHERE namespace = ? AND content_hash = ?').all(NS, target.content_hash)) sources.add(id);
  }
  const facts = new Set();
  for (const { fact_id } of db.prepare(`SELECT DISTINCT fs.fact_id FROM fact_source fs JOIN fact f ON f.id = fs.fact_id WHERE f.namespace = ?`).all(NS)) {
    const linked = db.prepare('SELECT source_id FROM fact_source WHERE fact_id = ?').all(fact_id).map((row) => row.source_id);
    if (linked.every((id) => sources.has(id))) facts.add(fact_id);
  }
  const copies = db.prepare(
    `SELECT g.id FROM fact f JOIN fact g
       ON (g.superseded_by_fact_id = f.id OR f.superseded_by_fact_id = g.id)
      AND g.namespace = f.namespace AND g.subject_entity_id = f.subject_entity_id AND g.predicate = f.predicate
      AND g.object_entity_id IS f.object_entity_id AND g.object_value IS f.object_value
     WHERE f.id = ?`,
  );
  const queue = [...facts];
  while (queue.length > 0) {
    for (const { id } of copies.all(queue.pop())) {
      if (!facts.has(id)) {
        facts.add(id);
        queue.push(id);
      }
    }
  }
  const explaining = new Set();
  for (const factId of facts) {
    for (const { source_id } of db.prepare("SELECT source_id FROM audit_log WHERE namespace = ? AND target_kind = 'fact' AND target_id = ? AND source_id IS NOT NULL").all(NS, factId)) explaining.add(source_id);
    for (const { source_id } of db.prepare('SELECT source_id FROM feedback WHERE namespace = ? AND fact_id = ? AND source_id IS NOT NULL').all(NS, factId)) explaining.add(source_id);
  }
  for (const id of sources) explaining.delete(id);
  return { sources: [...sources].sort(), facts: [...facts].sort(), explaining: [...explaining].sort() };
}

/** The designed steps, in one transaction, with one audit entry per change. */
function purge(db, set, now) {
  const isLive = db.prepare('SELECT invalidated_at IS NULL AS live FROM fact WHERE id = ?');
  const invalidate = db.prepare('UPDATE fact SET invalidated_at = ? WHERE id = ?');
  const purgeFact = db.prepare(
    `UPDATE fact SET statement = '${PURGED}', object_value = CASE WHEN object_value IS NULL THEN NULL ELSE '${PURGED}' END, purged_at = ? WHERE id = ?`,
  );
  const removeVector = db.prepare('DELETE FROM fact_embedding WHERE fact_id = ?');
  const purgeSource = db.prepare(
    `UPDATE source SET content = CASE WHEN content IS NULL THEN NULL ELSE '${PURGED}' END, content_hash = NULL, locator = NULL, purged_at = ? WHERE id = ?`,
  );
  const audit = db.prepare(
    `INSERT INTO audit_log (namespace, operation_id, operation, action, target_kind, target_id, trigger, reason_code, source_id, detail, occurred_at)
     VALUES ('${NS}', 'op-purge', 'purge', ?, ?, ?, 'person', 'secret_stored', NULL, NULL, ?)`,
  );
  db.transaction(() => {
    for (const factId of set.facts) {
      if (isLive.get(factId).live === 1) {
        invalidate.run(now, factId);
        audit.run('fact.invalidated', 'fact', factId, now);
      }
      purgeFact.run(now, factId);
      removeVector.run(factId);
      audit.run('fact.purged', 'fact', factId, now);
    }
    for (const sourceId of [...set.sources, ...set.explaining]) {
      purgeSource.run(now, sourceId);
      audit.run('source.purged', 'source', sourceId, now);
    }
  })();
}

/** Every place in the tables where the marker is, case-insensitively, as text or bytes. */
function searchTables(db) {
  const found = [];
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all().map((row) => row.name);
  for (const table of tables) {
    for (const { name } of db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all()) {
      const hits = db
        .prepare(`SELECT count(*) AS n FROM "${table}" WHERE instr(lower(CAST("${name}" AS BLOB)), lower(CAST(? AS BLOB))) > 0`)
        .get(MARKER).n;
      if (hits > 0) found.push(`${table}.${name}`);
    }
  }
  return { tables, found };
}

function fileContainsMarker(path) {
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    return { size: 0, found: false };
  }
  const lower = Buffer.from(bytes.toString('latin1').toLowerCase(), 'latin1');
  return { size: bytes.length, found: lower.includes(Buffer.from(MARKER.toLowerCase(), 'latin1')) };
}

// The draft migration turns FTS5 secure-delete on. Run A turns it off again, to show why it is there.
const RUNS = [
  { name: 'A: the purge transaction, with FTS5 secure-delete turned off', pragma: false, fts: false, vacuum: false },
  { name: 'B: the purge transaction, with PRAGMA secure_delete', pragma: true, fts: true, vacuum: false },
  { name: 'C: the purge transaction, with FTS5 secure-delete turned off, then VACUUM and wal_checkpoint(TRUNCATE)', pragma: false, fts: false, vacuum: true },
  { name: 'D: the design: the purge transaction, then VACUUM and wal_checkpoint(TRUNCATE)', pragma: false, fts: true, vacuum: true },
  { name: 'E: the design and PRAGMA secure_delete as well', pragma: true, fts: true, vacuum: true },
];

let designPassed = true;
let printedVersions = false;
for (const run of RUNS) {
  const directory = mkdtempSync(join(tmpdir(), 'factloom-purge-'));
  const path = join(directory, 'factloom.db');
  const db = open(path);
  const applied = migrate(db);
  if (!printedVersions) {
    const versions = db.prepare('SELECT sqlite_version() AS sqlite, vec_version() AS vec').get();
    console.log(`SQLite ${versions.sqlite}, sqlite-vec ${versions.vec}, better-sqlite3 13.1.1, Node.js ${process.version}`);
    console.log(`Migrations: ${applied.join(', ')}, then the draft 0004_purge.sql`);
    console.log(`secure_delete when a connection opens: ${db.pragma('secure_delete', { simple: true })}`);
    printedVersions = true;
  }
  build(db);
  const counts = () => ({
    fact: db.prepare('SELECT count(*) AS n FROM fact').get().n,
    source: db.prepare('SELECT count(*) AS n FROM source').get().n,
    audit: db.prepare('SELECT count(*) AS n FROM audit_log').get().n,
  });
  const before = counts();
  const unrelatedBefore = JSON.stringify([
    db.prepare("SELECT * FROM fact WHERE id = 'u-1'").get(),
    db.prepare("SELECT * FROM source WHERE id = 's-4'").get(),
    db.prepare("SELECT hex(embedding) AS e FROM fact_embedding WHERE fact_id = 'u-1'").get(),
  ]);

  const set = findPurgeSet(db, 's-1');
  if (run.pragma) db.pragma('secure_delete = ON');
  if (!run.fts) db.prepare("INSERT INTO fact_fts (fact_fts, rank) VALUES ('secure-delete', 0)").run();
  purge(db, set, at('2026-06-01'));
  if (run.vacuum) {
    db.exec('VACUUM');
    db.pragma('wal_checkpoint(TRUNCATE)');
  }

  console.log(`\n${run.name}`);
  console.log(`  purge set: sources ${set.sources.join(', ')}; facts ${set.facts.join(', ')}; explaining sources ${set.explaining.join(', ')}`);
  const { tables, found } = searchTables(db);
  for (const table of tables) {
    const hit = found.filter((place) => place.startsWith(`${table}.`));
    console.log(`  table ${table}: ${hit.length === 0 ? 'not found' : `found in ${hit.join(', ')}`}`);
  }
  const keyword = db.prepare('SELECT count(*) AS n FROM fact_fts WHERE fact_fts MATCH ?').get(MARKER).n;
  console.log(`  keyword index (MATCH ${MARKER}): ${keyword === 0 ? 'not found' : `found ${keyword}`}`);
  const vectors = db.prepare(`SELECT count(*) AS n FROM fact_embedding WHERE fact_id IN (${set.facts.map(() => '?').join(',')})`).get(...set.facts).n;
  console.log(`  vector entries of purged facts: ${vectors === 0 ? 'not found' : `found ${vectors}`}`);
  // Read while the connection is open, as a running server holds it: closing checkpoints the log.
  const file = fileContainsMarker(path);
  const wal = fileContainsMarker(`${path}-wal`);
  console.log(`  bytes of the database file, connection open (${file.size} bytes): ${file.found ? 'found' : 'not found'}`);
  console.log(`  bytes of the write-ahead log, connection open (${wal.size} bytes): ${wal.found ? 'found' : 'not found'}`);
  db.close();
  const fileClosed = fileContainsMarker(path);
  console.log(`  bytes of the database file after the connection closed (${fileClosed.size} bytes): ${fileClosed.found ? 'found' : 'not found'}`);

  const reopened = open(path);
  const after = { fact: reopened.prepare('SELECT count(*) AS n FROM fact').get().n, source: reopened.prepare('SELECT count(*) AS n FROM source').get().n, audit: reopened.prepare('SELECT count(*) AS n FROM audit_log').get().n };
  const unrelatedAfter = JSON.stringify([
    reopened.prepare("SELECT * FROM fact WHERE id = 'u-1'").get(),
    reopened.prepare("SELECT * FROM source WHERE id = 's-4'").get(),
    reopened.prepare("SELECT hex(embedding) AS e FROM fact_embedding WHERE fact_id = 'u-1'").get(),
  ]);
  const unchanged = unrelatedAfter === unrelatedBefore;
  console.log(`  unrelated fact u-1, its source and its vector: ${unchanged ? 'unchanged' : 'CHANGED'}`);
  const auditAdded = after.audit - before.audit;
  const sameRows = after.fact === before.fact && after.source === before.source;
  console.log(`  rows: fact ${before.fact} -> ${after.fact}, source ${before.source} -> ${after.source}, audit ${before.audit} -> ${after.audit} (${auditAdded} purge entries added, none removed)`);
  const f2 = reopened.prepare("SELECT statement, invalidated_at, purged_at FROM fact WHERE id = 'f-2'").get();
  console.log(`  f-2, the correction from an explaining source: statement "${f2.statement}", live ${f2.invalidated_at === null}, purged ${f2.purged_at !== null}, so an orphaned fact`);

  const refusals = [
    ["UPDATE fact SET statement = 'edited' WHERE id = 'u-1'", 'a fact changes only'],
    ["UPDATE fact SET object_value = 'edited', purged_at = '2026-06-02T00:00:00.000Z' WHERE id = 'u-1'", 'a fact changes only'],
    ["UPDATE fact SET statement = '[purged]', purged_at = '2026-06-02T00:00:00.000Z' WHERE id = 'f-1'", 'a fact changes only'],
    ["UPDATE source SET content = 'edited' WHERE id = 's-4'", 'a source changes only'],
    ["UPDATE source SET locator = NULL WHERE id = 's-4'", 'a source changes only'],
    ["UPDATE source SET content = '[purged]', content_hash = NULL, locator = NULL, purged_at = '2026-06-02T00:00:00.000Z', kind = 'other' WHERE id = 's-4'", 'a source changes only'],
    ["UPDATE source SET content = NULL, content_hash = NULL, locator = NULL, purged_at = '2026-06-02T00:00:00.000Z' WHERE id = 's-4'", 'a source changes only'],
    ["DELETE FROM fact_embedding WHERE fact_id = 'u-1'", 'a vector is removed only'],
  ];
  let refused = 0;
  for (const [sql, message] of refusals) {
    try {
      reopened.exec(sql);
    } catch (error) {
      if (String(error.message).includes(message)) refused += 1;
    }
  }
  console.log(`  updates outside the design's condition refused: ${refused} of ${refusals.length}`);
  reopened.close();
  rmSync(directory, { recursive: true });

  const tablesClean = found.length === 0 && keyword === 0 && vectors === 0;
  if (run.name.startsWith('D')) {
    designPassed =
      tablesClean && !file.found && !wal.found && !fileClosed.found && unchanged && sameRows && refused === refusals.length;
  }
}

console.log(designPassed ? '\nThe spike passed: run D, the design, leaves the marker nowhere.' : '\nThe spike FAILED: see run D.');
process.exitCode = designPassed ? 0 : 1;
