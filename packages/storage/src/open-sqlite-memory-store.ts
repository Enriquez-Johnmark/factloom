import { join } from 'node:path';
import { err, type MemoryStore, ok, type Result, toTimestamp } from '@factloom/core';
import type { Database } from 'better-sqlite3';
import { createCommit } from './create-commit.ts';
import { createReads } from './create-reads.ts';
import { findEmbeddingModelMismatch } from './embedding-model.ts';
import { openConnection } from './open-connection.ts';
import { runMigrations } from './run-migrations.ts';

const MIGRATIONS_DIRECTORY = join(import.meta.dirname, '..', 'migrations');

export type SqliteMemoryStoreOptions = {
  /** The database file, created if it does not exist. `:memory:` gives a private database. */
  readonly path: string;
  /** The name of the embedding model whose vectors this database holds. */
  readonly embeddingModel: string;
  /** The size of that model's vectors. */
  readonly embeddingDimensions: number;
};

/** Runs a read and turns what the driver or a row mapper throws into `storage_failed`. */
function read<Value>(run: () => Result<Value>): Promise<Result<Value>> {
  try {
    return Promise.resolve(run());
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return Promise.resolve(err('storage_failed', `The read failed. ${reason}`, { cause }));
  }
}

/**
 * Opens a SQLite file as a memory store: applies the connection settings, loads the vector
 * extension and brings the schema up to date. Returns `storage_failed` when the file cannot
 * be opened or its migration history does not match this version.
 */
export function openSqliteMemoryStore(options: SqliteMemoryStoreOptions): Result<MemoryStore> {
  let db: Database;
  try {
    db = openConnection(options.path);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return err('storage_failed', `The database ${options.path} could not be opened. ${reason}`, { cause });
  }
  try {
    // The one time not taken from a caller's clock: it records when this file's schema was
    // brought up to date, and is not part of memory.
    const migrated = runMigrations({ db, directory: MIGRATIONS_DIRECTORY, now: toTimestamp(new Date()) });
    if (!migrated.ok) {
      db.close();
      return migrated;
    }
    const embeddingModel = { model: options.embeddingModel, dimensions: options.embeddingDimensions };
    const mismatch = findEmbeddingModelMismatch(db, embeddingModel);
    if (mismatch !== null) {
      db.close();
      return mismatch;
    }
    const commit = createCommit(db, embeddingModel);
    const reads = createReads(db, embeddingModel);
    const store: MemoryStore = {
      commit: (changeSet) => Promise.resolve(commit(changeSet)),
      findEntities: (query) => read(() => ok(reads.findEntities(query))),
      getFact: (query) => read(() => ok(reads.getFact(query))),
      listFacts: (query) => read(() => reads.listFacts(query)),
      searchFactsByVector: (query) => read(() => reads.searchFactsByVector(query)),
      searchFactsByKeyword: (query) => read(() => reads.searchFactsByKeyword(query)),
      getSource: (query) => read(() => ok(reads.getSource(query))),
      listAuditEntries: (query) => read(() => ok(reads.listAuditEntries(query))),
      close: () => {
        db.close();
        return Promise.resolve();
      },
    };
    return ok(store);
  } catch (cause) {
    db.close();
    const reason = cause instanceof Error ? cause.message : String(cause);
    return err('storage_failed', `The database ${options.path} could not be prepared. ${reason}`, { cause });
  }
}
