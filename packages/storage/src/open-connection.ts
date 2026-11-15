import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

/**
 * How long a connection waits for another process's write lock before it gives up, in
 * milliseconds. The value the SQLite research ran.
 */
const BUSY_TIMEOUT_MS = 5000;

/**
 * Opens a connection with the settings every connection needs, and loads the vector
 * extension. Throws what the driver throws; the caller turns that into a result.
 */
export function openConnection(path: string): Database.Database {
  const db = new Database(path, { timeout: BUSY_TIMEOUT_MS });
  try {
    // SQLite enforces no REFERENCES clause unless this is on, and it is set per connection.
    db.pragma('foreign_keys = ON');
    // Readers and the one writer do not block each other. An in-memory database stays 'memory'.
    db.pragma('journal_mode = WAL');
    sqliteVec.load(db);
    return db;
  } catch (cause) {
    db.close();
    throw cause;
  }
}
