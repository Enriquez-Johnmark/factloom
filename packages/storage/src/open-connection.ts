import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { retryWhileBusy } from './retry-while-busy.ts';

/**
 * How long a connection waits for another process's write lock before it gives up, in
 * milliseconds. The value the SQLite research ran.
 */
const BUSY_TIMEOUT_MS = 5000;

/** Setting the journal mode is tried again this often, within the same busy timeout. */
const JOURNAL_MODE_RETRY = { pauseMs: 25, attempts: BUSY_TIMEOUT_MS / 25 };

/**
 * Opens a connection with the settings every connection needs, and loads the vector
 * extension. Throws what the driver throws, with the step that failed in the message and the
 * driver's error as the cause; the caller turns that into a result.
 */
export function openConnection(path: string): Database.Database {
  // Named in the error, so that a failure reported from another machine says where opening
  // stopped (FL-087).
  let step = 'opening the file';
  let db: Database.Database | null = null;
  try {
    db = new Database(path, { timeout: BUSY_TIMEOUT_MS });
    step = 'turning on foreign keys';
    // SQLite enforces no REFERENCES clause unless this is on, and it is set per connection.
    db.pragma('foreign_keys = ON');
    step = 'setting the journal mode to WAL';
    // Readers and the one writer do not block each other. An in-memory database stays 'memory'.
    // On macOS this reports busy at once, without waiting, while other processes open the same
    // new file (FL-087), so it is tried again.
    const connection = db;
    retryWhileBusy(() => connection.pragma('journal_mode = WAL'), JOURNAL_MODE_RETRY);
    step = 'loading the vector extension';
    sqliteVec.load(db);
    return db;
  } catch (cause) {
    db?.close();
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${reason}, while ${step}`, { cause });
  }
}
