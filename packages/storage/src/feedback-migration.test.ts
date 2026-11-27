// Tests of the third migration, which adds the feedback of FL-046: its triggers, and its
// application to a database that the earlier migrations alone created.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toTimestamp } from '@kronomind/core';
import { afterEach, describe, expect, it } from 'vitest';
import { writeTimeline } from './memory-store-contract.ts';
import { openConnection } from './open-connection.ts';
import { openSqliteMemoryStore } from './open-sqlite-memory-store.ts';
import { runMigrations } from './run-migrations.ts';
import { closeLater, closeTestStores, FIXTURE_MODEL, openOnFile } from './sqlite-test-store.ts';

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');
const EARLIER = ['0001_initial.sql', '0002_add_fact_confidence.sql'];
const THIS = '0003_add_feedback.sql';

afterEach(closeTestStores);

describe('the feedback migration', () => {
  it('refuses a direct update or delete of feedback', async () => {
    const { store, path } = openOnFile();
    await writeTimeline(store);
    const db = openConnection(path);
    closeLater(() => db.close());
    db.prepare(
      `INSERT INTO feedback (id, namespace, fact_id, signal, trigger, source_id, recorded_at)
       VALUES ('fb-1', 'repo:example', 'pg16', 'wrong', 'agent', NULL, '2026-05-01T00:00:00.000Z')`,
    ).run();

    expect(() => db.prepare("UPDATE feedback SET signal = 'right'").run()).toThrow(
      'feedback is never changed',
    );
    expect(() => db.prepare('DELETE FROM feedback').run()).toThrow('feedback is never deleted');
  });

  it('applies to a database the earlier migrations created, and records feedback on its fact', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'factloom-upgrade-'));
    closeLater(() => rmSync(directory, { recursive: true }));
    const earlierOnly = join(directory, 'migrations');
    mkdirSync(earlierOnly);
    for (const fileName of EARLIER) copyFileSync(join(MIGRATIONS, fileName), join(earlierOnly, fileName));
    const path = join(directory, 'factloom.db');
    const old = openConnection(path);
    expect(
      runMigrations({ db: old, directory: earlierOnly, now: toTimestamp(new Date('2026-01-01')) }).ok,
    ).toBe(true);
    old.exec(`
      INSERT INTO entity (id, namespace, type, name, name_key, created_at)
        VALUES ('e-repo', 'repo:example', 'repository', 'example', 'example', '2026-01-10T00:00:00.000Z');
      INSERT INTO fact (id, namespace, subject_entity_id, predicate, object_value, statement, confidence, created_at)
        VALUES ('pg14', 'repo:example', 'e-repo', 'uses_database_version', 'PostgreSQL 14',
                'The example repository runs PostgreSQL 14', 0.9, '2026-01-10T00:00:00.000Z');
    `);
    old.close();

    const opened = openSqliteMemoryStore({ path, ...FIXTURE_MODEL });
    if (!opened.ok) throw new Error(opened.error.message);
    closeLater(() => void opened.value.close());
    const recorded = await opened.value.commit({
      namespace: 'repo:example',
      operationId: 'op-feedback',
      operation: 'feedback',
      trigger: 'agent',
      reasonCode: 'feedback_given',
      explainedBySourceId: null,
      occurredAt: toTimestamp(new Date('2026-05-01T00:00:00.000Z')),
      changes: [
        {
          kind: 'record_feedback',
          feedback: {
            id: 'fb-1',
            namespace: 'repo:example',
            factId: 'pg14',
            signal: 'outdated',
            trigger: 'agent',
            sourceId: null,
            recordedAt: toTimestamp(new Date('2026-05-01T00:00:00.000Z')),
          },
        },
      ],
    });

    expect(recorded.ok).toBe(true);
    const db = openConnection(path);
    closeLater(() => db.close());
    expect(db.prepare('SELECT id, fact_id, signal FROM feedback').all()).toEqual([
      { id: 'fb-1', fact_id: 'pg14', signal: 'outdated' },
    ]);
    const sha256 = createHash('sha256')
      .update(readFileSync(join(MIGRATIONS, THIS)))
      .digest('hex');
    expect(db.prepare('SELECT name, sha256 FROM schema_migration WHERE number = 3').get()).toEqual({
      name: 'add_feedback',
      sha256,
    });
    console.info(`Recorded migration: ${THIS}, sha256 ${sha256}`);
  });
});
