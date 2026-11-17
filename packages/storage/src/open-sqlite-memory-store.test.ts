// Tests of opening a SQLite store and of the write path of commit. The store has no read
// methods yet, so these tests read the rows with SQL through a second connection.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  at,
  changeSet,
  entity,
  fact,
  NAMESPACE,
  recordFact,
  source,
  writeTimeline,
} from './memory-store-contract.ts';
import { openConnection } from './open-connection.ts';
import { openSqliteMemoryStore } from './open-sqlite-memory-store.ts';
import { closeLater, closeTestStores, countRows, FIXTURE_MODEL, openOnFile } from './sqlite-test-store.ts';

afterEach(closeTestStores);

describe('openConnection', () => {
  it('a connection has foreign keys on, write-ahead logging and a busy timeout', () => {
    const { path } = openOnFile();

    const db = openConnection(path);
    closeLater(() => db.close());

    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    expect(db.prepare('SELECT vec_version() AS version').get()).toEqual({ version: 'v0.1.9' });
  });
});

describe('openSqliteMemoryStore', () => {
  it('creates the schema in a new file and applies nothing when it is opened again', () => {
    const { rows, path } = openOnFile();

    const again = openSqliteMemoryStore({ path, ...FIXTURE_MODEL });
    if (again.ok) closeLater(() => void again.value.close());

    expect(again.ok).toBe(true);
    expect(rows.prepare('SELECT number, name FROM schema_migration').all()).toEqual([
      { number: 1, name: 'initial' },
      { number: 2, name: 'add_fact_confidence' },
      { number: 3, name: 'add_feedback' },
      { number: 4, name: 'purge' },
      { number: 5, name: 'add_entity_merge' },
    ]);
  });

  it('opens a private database for the path :memory:', async () => {
    const opened = openSqliteMemoryStore({ path: ':memory:', ...FIXTURE_MODEL });
    if (!opened.ok) throw new Error(opened.error.message);

    await expect(writeTimeline(opened.value)).resolves.toBeUndefined();
    await opened.value.close();
  });

  it('returns storage_failed when the file cannot be opened', () => {
    const path = join(tmpdir(), 'factloom-no-such-directory', 'nested', 'factloom.db');

    const opened = openSqliteMemoryStore({ path, ...FIXTURE_MODEL });

    expect(!opened.ok && opened.error.code).toBe('storage_failed');
  });

  it('returns storage_failed after the store is closed', async () => {
    const { store } = openOnFile();
    await store.close();

    const result = await store.commit(
      changeSet('op-1', '2026-01-10', [{ kind: 'create_entity', entity: entity('e-repo', 'example') }]),
    );

    expect(!result.ok && result.error.code).toBe('storage_failed');
  });
});

describe('commit on SQLite', () => {
  it("writes the fixture's succession as rows", async () => {
    const { store, rows } = openOnFile();

    await writeTimeline(store);

    expect(countRows(rows)).toMatchObject({ fact: 5, fact_embedding: 5, entity: 1, source: 3 });
    expect(
      rows
        .prepare('SELECT id, superseded_by_fact_id AS link, invalidated_at AS ended FROM fact ORDER BY id')
        .all(),
    ).toEqual([
      { id: 'node20', link: 'node22', ended: at('2026-05-01') },
      { id: 'node22', link: null, ended: null },
      { id: 'pg14', link: 'pg14-ended', ended: at('2026-04-02') },
      { id: 'pg14-ended', link: null, ended: null },
      { id: 'pg16', link: null, ended: null },
    ]);
    expect(
      rows.prepare("SELECT source_id FROM fact_source WHERE fact_id = 'pg14-ended' ORDER BY source_id").all(),
    ).toEqual([{ source_id: 's-1' }, { source_id: 's-2' }]);
    expect(
      rows
        .prepare(
          "SELECT operation, action, target_id, reason_code, source_id, occurred_at FROM audit_log WHERE operation_id = 'op-2' ORDER BY id",
        )
        .all(),
    ).toEqual(
      [
        ['source.recorded', 's-2'],
        ['fact.recorded', 'pg14-ended'],
        ['fact.invalidated', 'pg14'],
        ['fact.recorded', 'pg16'],
      ].map(([action, target_id]) => ({
        operation: 'succession',
        action,
        target_id,
        reason_code: 'reported_ended',
        source_id: 's-2',
        occurred_at: at('2026-04-02'),
      })),
    );
    expect(rows.prepare('SELECT DISTINCT model, dimensions FROM fact_embedding').all()).toEqual([
      { model: 'fixture-model', dimensions: 4 },
    ]);
    expect(rows.prepare("SELECT name_key FROM entity WHERE id = 'e-repo'").get()).toEqual({
      name_key: 'example',
    });
  });

  it('writes the detail fixed for each action', async () => {
    const { store, rows } = openOnFile();

    await writeTimeline(store);

    const details = rows
      .prepare<[], { action: string; target_id: string; detail: string | null }>(
        "SELECT action, target_id, detail FROM audit_log WHERE operation_id IN ('op-2', 'op-3') ORDER BY id",
      )
      .all()
      .map((row) => [row.action, row.target_id, row.detail === null ? null : JSON.parse(row.detail)]);
    expect(details).toEqual([
      ['source.recorded', 's-2', null],
      ['fact.recorded', 'pg14-ended', { revisesFactId: 'pg14' }],
      ['fact.invalidated', 'pg14', { supersededByFactId: 'pg14-ended' }],
      ['fact.recorded', 'pg16', null],
      ['source.recorded', 's-3', null],
      // A correction: node22 has another object than node20, so it is not a revised copy.
      ['fact.recorded', 'node22', null],
      ['fact.invalidated', 'node20', { supersededByFactId: 'node22' }],
    ]);
  });

  it('writes the source as the detail of an attached source', async () => {
    const { store, rows } = openOnFile();
    await writeTimeline(store);

    const attached = await store.commit(
      changeSet(
        'op-4',
        '2026-06-01',
        [
          { kind: 'record_source', source: source('s-4', '2026-06-01', 'Still on PostgreSQL 16.') },
          { kind: 'attach_source', factId: 'pg16', sourceId: 's-4' },
        ],
        { reasonCode: 'restated', explainedBySourceId: 's-4' },
      ),
    );

    expect(attached).toEqual({ ok: true, value: { operationId: 'op-4', auditEntryCount: 2 } });
    expect(
      rows
        .prepare(
          "SELECT detail FROM audit_log WHERE operation_id = 'op-4' AND action = 'fact.source_attached'",
        )
        .get(),
    ).toEqual({ detail: '{"sourceId":"s-4"}' });
    expect(countRows(rows)).toMatchObject({ fact: 5, fact_source: 7 });
  });

  it('rolls back every row when the last change fails', async () => {
    const { store, rows } = openOnFile();
    await writeTimeline(store);
    const before = countRows(rows);

    const result = await store.commit(
      changeSet(
        'op-4',
        '2026-06-01',
        [
          { kind: 'create_entity', entity: entity('e-other', 'other') },
          { kind: 'record_source', source: source('s-4', '2026-06-01', 'A note.') },
          recordFact(fact('redis', 'depends_on', 'Redis', { createdAt: at('2026-06-01') }), {
            sourceIds: ['s-4'],
          }),
          // The last change fails: this fact was invalidated by the fixture.
          { kind: 'invalidate_fact', factId: 'pg14', supersededByFactId: null },
        ],
        { explainedBySourceId: 's-4' },
      ),
    );

    expect(!result.ok && result.error.code).toBe('already_invalidated');
    expect(countRows(rows)).toEqual(before);
  });

  it('returns invalid_input for a change set that fails its schema', async () => {
    const { store, rows } = openOnFile();
    await writeTimeline(store);
    const before = rows.pragma('data_version', { simple: true });

    const result = await store.commit({ ...changeSet('op-4', '2026-06-01', []), namespace: '' });

    expect(!result.ok && result.error.code).toBe('invalid_input');
    expect(rows.pragma('data_version', { simple: true })).toBe(before);
  });

  it('copies a vector for a fact recorded with copyFromFactId', async () => {
    const { store, rows } = openOnFile();

    await writeTimeline(store);

    const embeddings = rows
      .prepare<[], { embedding: Buffer }>(
        "SELECT embedding FROM fact_embedding WHERE fact_id IN ('pg14', 'pg14-ended') ORDER BY fact_id",
      )
      .all();
    expect(embeddings).toHaveLength(2);
    expect(embeddings[0]?.embedding.equals(embeddings[1]?.embedding ?? Buffer.alloc(0))).toBe(true);
    expect(embeddings[0]?.embedding.byteLength).toBe(16);
  });

  it('writes nothing to another namespace', async () => {
    const { store, rows } = openOnFile();

    await writeTimeline(store);

    expect(rows.prepare('SELECT DISTINCT namespace FROM fact').all()).toEqual([{ namespace: NAMESPACE }]);
    expect(rows.prepare('SELECT DISTINCT namespace FROM audit_log').all()).toEqual([
      { namespace: NAMESPACE },
    ]);
  });
});
