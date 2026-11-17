// Checks the first migration: that it is the DDL of SCHEMA.md, and that the database it
// creates refuses what the schema says it refuses. These are the refusals that
// spikes/fact-schema ran from outside the workspace. Tests here write SQL directly, which is
// allowed only for testing what the schema itself enforces.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDateInput, type Timestamp } from '@factloom/core';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from './run-migrations.ts';

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');
const SCHEMA_DOCUMENT = join(import.meta.dirname, '..', '..', '..', 'docs', 'architecture', 'SCHEMA.md');
const NAMESPACE = 'shop-api';
const NOW = at('2026-11-15');

function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

/** SQL with comments removed and white space collapsed, so that only the statements compare. */
function normaliseSql(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type FactRow = {
  id: string;
  subject?: string;
  value?: string;
  statement?: string;
  validFrom?: string | null;
  validTo?: string | null;
  createdAt?: string;
};

let db: Database.Database;

function insertEntity(id: string, namespace: string, name: string): void {
  db.prepare('INSERT INTO entity VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    namespace,
    'repository',
    name,
    name,
    NOW,
  );
}

function insertFact(row: FactRow, namespace = NAMESPACE): void {
  db.prepare(
    `INSERT INTO fact (id, namespace, subject_entity_id, predicate, object_value, statement, confidence, valid_from, valid_to, created_at)
     VALUES (@id, @namespace, @subject, 'uses_database_version', @value, @statement, 1, @validFrom, @validTo, @createdAt)`,
  ).run({
    subject: 'e-repo',
    value: 'PostgreSQL 16',
    statement: 'The repository uses PostgreSQL 16',
    validFrom: null,
    validTo: null,
    createdAt: at('2026-01-10'),
    ...row,
    namespace,
  });
}

function invalidate(factId: string, supersededBy: string | null): void {
  db.prepare('UPDATE fact SET invalidated_at = ?, superseded_by_fact_id = ? WHERE id = ?').run(
    NOW,
    supersededBy,
    factId,
  );
}

function run(sql: string, ...parameters: (string | null)[]): () => void {
  return () => {
    db.prepare(sql).run(...parameters);
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  sqliteVec.load(db);
  db.pragma('foreign_keys = ON');
  const migrated = runMigrations({ db, directory: MIGRATIONS, now: at('2026-01-01') });
  if (!migrated.ok) throw new Error(migrated.error.message);
  insertEntity('e-repo', NAMESPACE, 'shop-api');
  db.prepare(
    "INSERT INTO source (id, namespace, kind, content, observed_at, created_at) VALUES ('s-1', ?, 'agent_note', 'A note.', ?, ?)",
  ).run(NAMESPACE, NOW, NOW);
  insertFact({ id: 'pg16' });
  db.prepare("INSERT INTO fact_source VALUES ('pg16', 's-1')").run();
  db.prepare(
    `INSERT INTO audit_log (namespace, operation_id, operation, action, target_kind, target_id, trigger, reason_code, source_id, occurred_at)
     VALUES (?, 'op-1', 'remember', 'fact.recorded', 'fact', 'pg16', 'agent', 'stated', 's-1', ?)`,
  ).run(NAMESPACE, NOW);
});

describe('the first migration', () => {
  it('holds the statements of the "Tables" block in SCHEMA.md', () => {
    const document = readFileSync(SCHEMA_DOCUMENT, 'utf8');
    const tables = document.slice(
      document.indexOf('\n## Tables'),
      document.indexOf('\n## How the three retrieval lanes'),
    );
    const blocks = [...tables.matchAll(/```sql\n([\s\S]*?)```/g)].map((match) => match[1] ?? '');
    const migration = readFileSync(join(MIGRATIONS, '0001_initial.sql'), 'utf8');

    expect(blocks.length).toBeGreaterThan(0);
    expect(normaliseSql(migration)).toBe(normaliseSql(blocks.join('\n')));
  });

  it('runs on the pinned versions of SQLite and sqlite-vec', () => {
    const versions = db.prepare('SELECT sqlite_version() AS sqlite, vec_version() AS sqliteVec').get();

    expect(versions).toEqual({ sqlite: '3.54.1', sqliteVec: 'v0.1.9' });
  });

  it('keeps the keyword index in step with inserted facts', () => {
    insertFact({ id: 'redis', statement: 'The repository depends on Redis', value: 'Redis' });

    const rows = db
      .prepare(
        "SELECT f.id FROM fact_fts JOIN fact f ON f.rowid = fact_fts.rowid WHERE fact_fts MATCH 'redis'",
      )
      .all();

    expect(rows).toEqual([{ id: 'redis' }]);
  });
});

describe('what the schema refuses', () => {
  it('a fact cannot be deleted', () => {
    expect(run("DELETE FROM fact WHERE id = 'pg16'")).toThrow(/never deleted/);
  });

  it("a fact's statement, valid period or confidence cannot be changed", () => {
    expect(run("UPDATE fact SET statement = 'x' WHERE id = 'pg16'")).toThrow(
      /only by being invalidated once/,
    );
    expect(run("UPDATE fact SET valid_to = ? WHERE id = 'pg16'", NOW)).toThrow(
      /only by being invalidated once/,
    );
    expect(run("UPDATE fact SET valid_from = ? WHERE id = 'pg16'", NOW)).toThrow(
      /only by being invalidated once/,
    );
    expect(run("UPDATE fact SET confidence = 0.5 WHERE id = 'pg16'")).toThrow(
      /only by being invalidated once/,
    );
  });

  it('a fact cannot be invalidated twice or made live again', () => {
    invalidate('pg16', null);

    expect(() => invalidate('pg16', null)).toThrow(/only by being invalidated once/);
    expect(run("UPDATE fact SET invalidated_at = NULL WHERE id = 'pg16'")).toThrow(
      /only by being invalidated once/,
    );
  });

  it('a supersession link needs an invalidation', () => {
    insertFact({ id: 'pg17', value: 'PostgreSQL 17' });

    expect(run("UPDATE fact SET superseded_by_fact_id = 'pg17' WHERE id = 'pg16'")).toThrow(
      /only by being invalidated once|CHECK/,
    );
  });

  it('a fact cannot supersede itself', () => {
    expect(() => invalidate('pg16', 'pg16')).toThrow(/CHECK/);
  });

  it('a fact cannot be superseded from another namespace', () => {
    insertEntity('e-other', 'billing-api', 'billing-api');
    insertFact({ id: 'other-1', subject: 'e-other' }, 'billing-api');

    expect(() => invalidate('pg16', 'other-1')).toThrow(/own namespace/);
  });

  it('the row number of a fact cannot be changed', () => {
    expect(run("UPDATE fact SET rowid = rowid + 1000, invalidated_at = ? WHERE id = 'pg16'", NOW)).toThrow(
      /only by being invalidated once/,
    );
  });

  it.each(['2026-01-10 00:00:00', '2026-01-10T00:00:00Z', '2026-01-10T00:00:00.000+01:00', '2026-01-10'])(
    'a timestamp written as %s is rejected',
    (createdAt) => {
      expect(() => insertFact({ id: 'bad', createdAt })).toThrow(/CHECK/);
    },
  );

  it('valid_from must be before valid_to', () => {
    const sameInstant = at('2026-02-01');

    expect(() => insertFact({ id: 'bad', validFrom: sameInstant, validTo: sameInstant })).toThrow(/CHECK/);
    expect(() => insertFact({ id: 'bad', validFrom: at('2026-03-01'), validTo: sameInstant })).toThrow(
      /CHECK/,
    );
  });

  it('a fact has exactly one kind of object', () => {
    const columns = 'id, namespace, subject_entity_id, predicate, statement, confidence, created_at';
    const values = `'bad', '${NAMESPACE}', 'e-repo', 'p', 's', 1, ?`;

    expect(run(`INSERT INTO fact (${columns}) VALUES (${values})`, NOW)).toThrow(/CHECK/);
    expect(
      run(
        `INSERT INTO fact (${columns}, object_entity_id, object_value) VALUES (${values}, 'e-repo', 'v')`,
        NOW,
      ),
    ).toThrow(/CHECK/);
  });

  it('a fact must refer to an existing entity when foreign keys are on', () => {
    expect(() => insertFact({ id: 'bad', subject: 'e-missing' })).toThrow(/FOREIGN KEY/);
  });

  it('the same entity cannot be created twice in a namespace', () => {
    expect(() => insertEntity('e-repo-2', NAMESPACE, 'shop-api')).toThrow(/UNIQUE/);
  });

  it('an entity, a source and a source link cannot be changed or deleted', () => {
    expect(run("UPDATE entity SET name = 'x' WHERE id = 'e-repo'")).toThrow(/never changed/);
    expect(run("DELETE FROM entity WHERE id = 'e-repo'")).toThrow(/never deleted/);
    // Since the fourth migration, a source changes only by a purge, which this update is not.
    expect(run("UPDATE source SET content = 'x' WHERE id = 's-1'")).toThrow(
      /changes only by being purged once/,
    );
    expect(run("DELETE FROM source WHERE id = 's-1'")).toThrow(/never deleted/);
    expect(run("UPDATE fact_source SET source_id = 's-1' WHERE fact_id = 'pg16'")).toThrow(
      /keeps its sources/,
    );
    expect(run("DELETE FROM fact_source WHERE fact_id = 'pg16'")).toThrow(/keeps its sources/);
  });

  it('an audit entry cannot be changed or deleted', () => {
    expect(run("UPDATE audit_log SET reason_code = 'x'")).toThrow(/never changed/);
    expect(run('DELETE FROM audit_log')).toThrow(/never deleted/);
  });
});
