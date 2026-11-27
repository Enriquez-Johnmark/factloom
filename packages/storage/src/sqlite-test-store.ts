// Helpers for the adapter tests: a store on a temporary file, with a second, read-only
// connection for reading its rows with SQL. Not a test file, and not exported by the package.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryStore } from '@kronomind/core';
import Database from 'better-sqlite3';
import { openSqliteMemoryStore } from './open-sqlite-memory-store.ts';

export const FIXTURE_MODEL = { embeddingModel: 'fixture-model', embeddingDimensions: 4 } as const;

const TABLES = ['entity', 'source', 'fact', 'fact_source', 'fact_embedding', 'audit_log'] as const;
const closers: (() => void)[] = [];

/** Runs after everything opened so far is closed, and before its file is removed. */
export function closeLater(close: () => void): void {
  closers.unshift(close);
}

/** Opens a store on a new temporary file, with a second connection for reading its rows. */
export function openOnFile(): { store: MemoryStore; rows: Database.Database; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'factloom-store-'));
  const path = join(directory, 'factloom.db');
  const opened = openSqliteMemoryStore({ path, ...FIXTURE_MODEL });
  if (!opened.ok) throw new Error(opened.error.message);
  const store = opened.value;
  const rows = new Database(path, { readonly: true });
  closers.push(() => {
    rows.close();
    void store.close();
    rmSync(directory, { recursive: true });
  });
  return { store, rows, path };
}

/** Closes every store and connection the helpers opened, and removes the files. Call after each test. */
export function closeTestStores(): void {
  for (const close of closers.splice(0)) close();
}

/** The number of rows in each table that a commit writes to. */
export function countRows(rows: Database.Database): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    // The table name is one of the fixed names above, never a value from outside.
    const row = rows.prepare<[], { count: number }>(`SELECT count(*) AS count FROM ${table}`).get();
    counts[table] = row?.count ?? -1;
  }
  return counts;
}
