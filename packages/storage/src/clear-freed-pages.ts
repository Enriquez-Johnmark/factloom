import { err, ok, type Result } from '@factloom/core';
import { openConnection } from './open-connection.ts';

/**
 * Clears what a purge leaves in freed pages (ADR 0012, "The phase 2 design", question 8):
 * rebuilds the database file with `VACUUM`, then copies the write-ahead log into it and
 * truncates the log with `wal_checkpoint(TRUNCATE)`. Run it after `purgeContent`, with no
 * store open on the file in this process. `checkpointComplete` is false when another
 * connection held a read transaction, so old pages can stay in the log until it ends; running
 * this again when the server is stopped finishes it.
 */
export function clearFreedPages(path: string): Result<{ readonly checkpointComplete: boolean }> {
  let db: ReturnType<typeof openConnection> | null = null;
  try {
    db = openConnection(path);
    db.exec('VACUUM');
    const rows = db.pragma('wal_checkpoint(TRUNCATE)');
    const [first] = Array.isArray(rows) ? rows : [];
    const busy = first !== null && typeof first === 'object' && 'busy' in first ? first.busy : 1;
    return ok({ checkpointComplete: busy === 0 });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return err('storage_failed', `The freed pages of ${path} could not be cleared. ${reason}`, { cause });
  } finally {
    db?.close();
  }
}
