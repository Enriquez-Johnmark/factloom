// SQLite tests of usage (FL-055): what the contract suite cannot see.
import { afterEach, describe, expect, it } from 'vitest';
import { at, NAMESPACE, NOW, writeTimeline } from './memory-store-contract.ts';
import { closeTestStores, countRows, openOnFile } from './sqlite-test-store.ts';

afterEach(closeTestStores);

/** Every row of every table, as text, so that two dumps can be compared. */
function dump(rows: import('better-sqlite3').Database): string {
  const tables = rows
    .prepare<[], { name: string }>("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
  // The table names come from sqlite_schema, never from outside.
  return JSON.stringify(
    tables.map((table) => [
      table,
      rows
        .prepare(`SELECT * FROM "${table}"`)
        .raw()
        .all()
        .map((row) =>
          JSON.stringify(row, (_, value) => (Buffer.isBuffer(value) ? value.toString('hex') : value)),
        )
        .sort(),
    ]),
  );
}

describe('usage in SQLite', () => {
  it('changes no row of fact, source, entity or audit_log', async () => {
    const { store, rows } = openOnFile();
    await writeTimeline(store);
    const before = countRows(rows);

    await store.recordFactUsage({
      namespace: NAMESPACE,
      factIds: ['pg16', 'node22'],
      recalledAt: at('2026-06-01'),
    });

    const after = countRows(rows);
    expect(after).toEqual(before);
    expect(rows.prepare('SELECT count(*) AS n FROM fact_usage').get()).toEqual({ n: 2 });
  });

  it('the lane queries leave every table as it was', async () => {
    const { store, rows } = openOnFile();
    await writeTimeline(store);
    const before = dump(rows);
    const now = { validAt: NOW, knownAt: NOW };

    await store.searchFactsByKeyword({ namespace: NAMESPACE, text: 'postgresql', time: now, limit: 10 });
    await store.searchFactsByVector({
      namespace: NAMESPACE,
      vector: new Float32Array([1, 0, 0, 0]),
      time: now,
      limit: 10,
    });
    await store.listFacts({
      namespace: NAMESPACE,
      subjectEntityId: null,
      predicate: null,
      touchingEntityIds: ['e-repo'],
      supersededByFactId: null,
      time: now,
      limit: 10,
    });

    expect(dump(rows)).toBe(before);
  });
});
