// SQLite tests of FL-049 that the contract suite cannot see: the triggers that keep
// fact_verification append-only, and the indexes that the stale and orphaned lists use.
import { afterEach, describe, expect, it } from 'vitest';
import { writeTimeline } from './memory-store-contract.ts';
import { openConnection } from './open-connection.ts';
import { closeLater, closeTestStores, openOnFile } from './sqlite-test-store.ts';

afterEach(closeTestStores);

describe('fact_verification in SQLite', () => {
  it('refuses a direct update or delete of a verification', async () => {
    const { store, path } = openOnFile();
    await writeTimeline(store);
    const db = openConnection(path);
    closeLater(() => db.close());
    db.prepare(
      `INSERT INTO fact_verification (id, namespace, fact_id, outcome, method, verified_at)
       VALUES ('vr-1', 'repo:example', 'pg16', 'confirmed', 'deterministic', '2026-05-01T00:00:00.000Z')`,
    ).run();

    expect(() => db.prepare("UPDATE fact_verification SET outcome = 'contradicted'").run()).toThrow(
      'verifications are never changed',
    );
    expect(() => db.prepare('DELETE FROM fact_verification').run()).toThrow(
      'verifications are never deleted',
    );
  });
});
