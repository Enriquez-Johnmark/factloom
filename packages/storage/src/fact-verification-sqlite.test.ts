// SQLite tests of FL-049 that the contract suite cannot see: the triggers that keep
// fact_verification append-only, and the indexes that the stale and orphaned lists use.
import { afterEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { ORPHANED_FACTS_SQL, STALE_FACTS_SQL } from './create-reads.ts';
import { writeTimeline } from './memory-store-contract.ts';
import { openConnection } from './open-connection.ts';
import { closeLater, closeTestStores, openOnFile } from './sqlite-test-store.ts';

afterEach(closeTestStores);

/** The steps of a query's plan, one per line. */
function explain(db: Database.Database, sql: string, parameters: Record<string, unknown>): string {
  return db
    .prepare<[Record<string, unknown>], { detail: string }>(`EXPLAIN QUERY PLAN ${sql}`)
    .all(parameters)
    .map((step) => step.detail)
    .join('\n');
}

const AT = '2026-11-13T00:00:00.000Z';

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

  it('reads the facts of the stale list by the namespace index and their latest verification by its index', async () => {
    const { store, rows } = openOnFile();
    await writeTimeline(store);

    const plan = explain(rows, STALE_FACTS_SQL, {
      namespace: 'repo:example',
      validAt: AT,
      knownAt: AT,
      notVerifiedSince: AT,
      confidenceBelow: 0.5,
      limit: 10,
    });

    expect(plan).toMatch(/SEARCH f USING INDEX fact_subject_predicate \(namespace=\?\)/);
    expect(plan).toMatch(/SEARCH v USING (COVERING )?INDEX fact_verification_by_fact \(fact_id=\?\)/);
    expect(plan).not.toMatch(/SCAN (f|v)\b/);
  });

  it('reads the facts of the orphaned list by the namespace index and their latest verification by its index', async () => {
    const { store, rows } = openOnFile();
    await writeTimeline(store);

    const plan = explain(rows, ORPHANED_FACTS_SQL, { namespace: 'repo:example', limit: 10 });

    expect(plan).toMatch(/SEARCH f USING INDEX fact_subject_predicate \(namespace=\?\)/);
    expect(plan).toMatch(/SEARCH v USING (COVERING )?INDEX fact_verification_by_fact \(fact_id=\?\)/);
    expect(plan).not.toMatch(/SCAN (f|v|fs|s)\b/);
  });
});
