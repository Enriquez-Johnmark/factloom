import { FactUsageSchema, type MemoryStore, type Timestamp, TimestampSchema } from '@kronomind/core';
import type { Database } from 'better-sqlite3';

/**
 * The usage methods of a SQLite store (FL-055). Usage is bookkeeping, not memory: the write
 * is outside `commit`, builds no change set and writes no audit entry, and touches only
 * `fact_usage` and `fact_usage_tracking`. The functions throw what the driver throws; the
 * caller turns that into `storage_failed`.
 */
export function createUsage(db: Database) {
  // One batched statement for every fact of a result. A fact outside the namespace is skipped.
  const upsertUsage = db.prepare(
    `INSERT INTO fact_usage (fact_id, namespace, last_recalled_at, recall_count)
     SELECT f.id, f.namespace, @recalledAt, 1 FROM fact f
     WHERE f.namespace = @namespace AND f.id IN (SELECT DISTINCT value FROM json_each(@factIds))
     ON CONFLICT (fact_id) DO UPDATE SET last_recalled_at = excluded.last_recalled_at, recall_count = recall_count + 1`,
  );
  const startTracking = db.prepare(
    'INSERT OR IGNORE INTO fact_usage_tracking (namespace, started_at) VALUES (@namespace, @recalledAt)',
  );
  const selectUsage = db.prepare<
    [string, string],
    { fact_id: string; last_recalled_at: string; recall_count: number }
  >('SELECT fact_id, last_recalled_at, recall_count FROM fact_usage WHERE fact_id = ? AND namespace = ?');
  const selectStart = db.prepare<[string], { started_at: string }>(
    'SELECT started_at FROM fact_usage_tracking WHERE namespace = ?',
  );
  const record = db.transaction((usage: Parameters<MemoryStore['recordFactUsage']>[0]) => {
    const written = upsertUsage.run({
      namespace: usage.namespace,
      factIds: JSON.stringify(usage.factIds),
      recalledAt: usage.recalledAt,
    });
    if (written.changes > 0) startTracking.run({ namespace: usage.namespace, recalledAt: usage.recalledAt });
  });

  return {
    recordFactUsage(usage: Parameters<MemoryStore['recordFactUsage']>[0]): void {
      record(usage);
    },
    getFactUsage(query: Parameters<MemoryStore['getFactUsage']>[0]) {
      const row = selectUsage.get(query.factId, query.namespace);
      if (row === undefined) return null;
      return FactUsageSchema.parse({
        factId: row.fact_id,
        lastRecalledAt: row.last_recalled_at,
        recallCount: row.recall_count,
      });
    },
    getUsageTrackingStart(query: Parameters<MemoryStore['getUsageTrackingStart']>[0]): Timestamp | null {
      const row = selectStart.get(query.namespace);
      return row === undefined ? null : TimestampSchema.parse(row.started_at);
    },
  };
}
