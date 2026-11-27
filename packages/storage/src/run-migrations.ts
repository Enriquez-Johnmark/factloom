import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok, type Result, type Timestamp } from '@kronomind/core';
import type { Database } from 'better-sqlite3';

/** A migration file name: a four-digit number, an underscore and a name. */
const MIGRATION_FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

type MigrationFile = {
  readonly number: number;
  readonly name: string;
  readonly fileName: string;
  readonly sql: string;
  readonly sha256: string;
};

type AppliedMigration = { readonly number: number; readonly name: string; readonly sha256: string };

/** Reads the migration files of a directory, in number order. Throws on a name it cannot read. */
function readMigrationFiles(directory: string): MigrationFile[] {
  const files: MigrationFile[] = [];
  for (const fileName of readdirSync(directory).filter((entry) => entry.endsWith('.sql'))) {
    const match = MIGRATION_FILE.exec(fileName);
    const [, digits, name] = match ?? [];
    if (digits === undefined || name === undefined) {
      throw new Error(`The migration file ${fileName} is not named like 0001_initial.sql.`);
    }
    const bytes = readFileSync(join(directory, fileName));
    files.push({
      number: Number(digits),
      name,
      fileName,
      sql: bytes.toString('utf8'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  files.sort((first, second) => first.number - second.number);
  const repeated = files.find((file, index) => files[index + 1]?.number === file.number);
  if (repeated !== undefined) throw new Error(`Two migration files have the number ${repeated.number}.`);
  return files;
}

/** Names what is wrong between the recorded migrations and the files, or returns null. */
function findHistoryMismatch(
  applied: readonly AppliedMigration[],
  files: readonly MigrationFile[],
): string | null {
  for (const recorded of applied) {
    const label = `${String(recorded.number).padStart(4, '0')}_${recorded.name}`;
    const file = files.find((candidate) => candidate.number === recorded.number);
    if (file === undefined) {
      return `This database records the migration ${label}, which this version of Factloom does not have. It was written by a newer version, or the migration file is missing.`;
    }
    if (file.sha256 !== recorded.sha256) {
      return `The migration ${label} was changed after it was applied to this database. A released migration is never edited: restore the file, and fix a mistake with a new migration.`;
    }
  }
  return null;
}

/**
 * Brings a database up to date: applies the migration files that it has not recorded, in
 * number order, each in its own transaction, and records each in `schema_migration`. A file
 * that another process applied in the meantime is skipped, so several processes may open one
 * new database at once. It
 * applies nothing and returns `storage_failed` when a recorded migration has no file or its
 * file was changed. If a migration fails, its transaction is rolled back and later files are
 * not applied.
 */
export function runMigrations(parts: {
  readonly db: Database;
  readonly directory: string;
  readonly now: Timestamp;
}): Result<{ readonly applied: readonly string[] }> {
  const { db, directory, now } = parts;
  let current = 'reading the migrations';
  try {
    const files = readMigrationFiles(directory);
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
      number      INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      sha256      TEXT NOT NULL,
      applied_at  TEXT NOT NULL
    ) STRICT`);
    const applied = db
      .prepare<[], AppliedMigration>('SELECT number, name, sha256 FROM schema_migration ORDER BY number')
      .all();
    const mismatch = findHistoryMismatch(applied, files);
    if (mismatch !== null) return err('storage_failed', mismatch);

    const recordMigration = db.prepare(
      'INSERT INTO schema_migration (number, name, sha256, applied_at) VALUES (?, ?, ?, ?)',
    );
    const isRecorded = db.prepare<[number], { number: number }>(
      'SELECT number FROM schema_migration WHERE number = ?',
    );
    const appliedNumbers = new Set(applied.map((recorded) => recorded.number));
    const newlyApplied: string[] = [];
    for (const file of files.filter((candidate) => !appliedNumbers.has(candidate.number))) {
      current = `applying the migration ${file.fileName}`;
      // Another process opening the same new file may have applied it since the list above was
      // read (FL-086). An immediate transaction takes the write lock before the check, so the
      // check and the migration see the same database.
      const wasApplied = db
        .transaction(() => {
          if (isRecorded.get(file.number) !== undefined) return false;
          db.exec(file.sql);
          recordMigration.run(file.number, file.name, file.sha256, now);
          return true;
        })
        .immediate();
      if (wasApplied) newlyApplied.push(file.fileName);
    }
    return ok({ applied: newlyApplied });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return err('storage_failed', `The database could not be brought up to date while ${current}. ${reason}`, {
      cause,
    });
  }
}
