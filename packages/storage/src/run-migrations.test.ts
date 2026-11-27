import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDateInput, type Timestamp } from '@kronomind/core';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { runMigrations } from './run-migrations.ts';

const directories: string[] = [];

/** Writes migration files to a new temporary directory. */
function writeMigrations(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'kronomind-migrations-'));
  directories.push(directory);
  for (const [fileName, sql] of Object.entries(files)) writeFileSync(join(directory, fileName), sql);
  return directory;
}

function day(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function listTables(db: Database.Database): string[] {
  const rows = db
    .prepare<[], { name: string }>("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
    .all();
  return rows.map((row) => row.name);
}

const FIRST = 'CREATE TABLE first (id INTEGER PRIMARY KEY);';
// The second file reads the first table, so it fails unless the first was applied before it.
const SECOND = 'CREATE TABLE second AS SELECT id FROM first;';
// The SHA-256 of FIRST, computed with sha256sum.
const FIRST_SHA256 = '0a82972be752ac7bfe0bcfbdadc9d4bb8c81e4082565dfda712e2072ac9ddf75';

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

describe('runMigrations', () => {
  it('applies pending migrations in number order', () => {
    const db = new Database(':memory:');
    const directory = writeMigrations({ '0002_second.sql': SECOND, '0001_first.sql': FIRST });

    const result = runMigrations({ db, directory, now: day('2026-01-10') });

    expect(result).toEqual({ ok: true, value: { applied: ['0001_first.sql', '0002_second.sql'] } });
    expect(listTables(db)).toEqual(['first', 'schema_migration', 'second']);
  });

  it('applies nothing when every migration is already recorded', () => {
    const db = new Database(':memory:');
    const directory = writeMigrations({ '0001_first.sql': FIRST });
    runMigrations({ db, directory, now: day('2026-01-10') });

    const again = runMigrations({ db, directory, now: day('2026-01-11') });

    expect(again).toEqual({ ok: true, value: { applied: [] } });
    expect(db.prepare('SELECT applied_at FROM schema_migration').all()).toEqual([
      { applied_at: '2026-01-10T00:00:00.000Z' },
    ]);
  });

  it('applies only what is missing when a new migration is added', () => {
    const db = new Database(':memory:');
    runMigrations({ db, directory: writeMigrations({ '0001_first.sql': FIRST }), now: day('2026-01-10') });
    const both = writeMigrations({ '0001_first.sql': FIRST, '0002_second.sql': SECOND });

    const result = runMigrations({ db, directory: both, now: day('2026-02-10') });

    expect(result).toEqual({ ok: true, value: { applied: ['0002_second.sql'] } });
  });

  it('refuses to continue when an applied migration file was changed', () => {
    const db = new Database(':memory:');
    runMigrations({ db, directory: writeMigrations({ '0001_first.sql': FIRST }), now: day('2026-01-10') });
    const edited = writeMigrations({ '0001_first.sql': `${FIRST} -- edited`, '0002_second.sql': SECOND });

    const result = runMigrations({ db, directory: edited, now: day('2026-02-10') });

    expect(!result.ok && result.error.code).toBe('storage_failed');
    expect(!result.ok && result.error.message).toContain('0001_first');
    expect(listTables(db)).toEqual(['first', 'schema_migration']);
  });

  it('refuses a database that records a migration it does not have', () => {
    const db = new Database(':memory:');
    const both = writeMigrations({ '0001_first.sql': FIRST, '0002_second.sql': SECOND });
    runMigrations({ db, directory: both, now: day('2026-01-10') });

    const result = runMigrations({
      db,
      directory: writeMigrations({ '0001_first.sql': FIRST }),
      now: day('2026-02-10'),
    });

    expect(!result.ok && result.error.code).toBe('storage_failed');
    expect(!result.ok && result.error.message).toContain('0002_second');
  });

  it('leaves no trace of a migration that fails part way', () => {
    const db = new Database(':memory:');
    const directory = writeMigrations({
      '0001_first.sql': FIRST,
      '0002_broken.sql': 'CREATE TABLE half_done (id INTEGER); INSERT INTO no_such_table VALUES (1);',
      '0003_third.sql': 'CREATE TABLE third (id INTEGER);',
    });

    const result = runMigrations({ db, directory, now: day('2026-01-10') });

    expect(!result.ok && result.error.code).toBe('storage_failed');
    expect(!result.ok && result.error.message).toContain('0002_broken.sql');
    expect(listTables(db)).toEqual(['first', 'schema_migration']);
    expect(db.prepare('SELECT number FROM schema_migration').all()).toEqual([{ number: 1 }]);
  });

  it('records the number, name, hash and time of each migration', () => {
    const db = new Database(':memory:');
    const directory = writeMigrations({ '0001_first.sql': FIRST });

    runMigrations({ db, directory, now: day('2026-01-10') });

    expect(db.prepare('SELECT * FROM schema_migration').all()).toEqual([
      { number: 1, name: 'first', sha256: FIRST_SHA256, applied_at: '2026-01-10T00:00:00.000Z' },
    ]);
  });

  it('refuses a migration file whose name has no four-digit number', () => {
    const db = new Database(':memory:');
    const directory = writeMigrations({ 'initial.sql': FIRST });

    const result = runMigrations({ db, directory, now: day('2026-01-10') });

    expect(!result.ok && result.error.code).toBe('storage_failed');
    expect(listTables(db)).toEqual([]);
  });
});
