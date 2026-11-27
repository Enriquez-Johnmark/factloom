// Tests of the second migration, which adds the confidence history of FL-045: its triggers,
// and its application to a database that the first migration alone created.
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
const FIRST = '0001_initial.sql';
const SECOND = '0002_add_fact_confidence.sql';

afterEach(closeTestStores);

describe('the fact_confidence migration', () => {
  it('refuses a direct update or delete of a confidence adjustment', async () => {
    const { store, path } = openOnFile();
    await writeTimeline(store);
    const db = openConnection(path);
    closeLater(() => db.close());
    db.prepare(
      "INSERT INTO fact_confidence (fact_id, confidence, adjusted_at) VALUES ('pg16', 0.4, '2026-05-01T00:00:00.000Z')",
    ).run();

    expect(() => db.prepare('UPDATE fact_confidence SET confidence = 0.1').run()).toThrow(
      'confidence adjustments are never changed',
    );
    expect(() => db.prepare('DELETE FROM fact_confidence').run()).toThrow(
      'confidence adjustments are never deleted',
    );
  });

  it('applies to a database the first migration created, and reads its fact with the confidence at recording', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'factloom-upgrade-'));
    closeLater(() => rmSync(directory, { recursive: true }));
    const firstOnly = join(directory, 'migrations');
    mkdirSync(firstOnly);
    copyFileSync(join(MIGRATIONS, FIRST), join(firstOnly, FIRST));
    const path = join(directory, 'factloom.db');
    const old = openConnection(path);
    expect(
      runMigrations({ db: old, directory: firstOnly, now: toTimestamp(new Date('2026-01-01')) }).ok,
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
    const found = await opened.value.getFact({ namespace: 'repo:example', factId: 'pg14' });

    expect(found.ok && found.value?.fact.confidence).toBe(0.9);
    const db = openConnection(path);
    closeLater(() => db.close());
    const sha256 = createHash('sha256')
      .update(readFileSync(join(MIGRATIONS, SECOND)))
      .digest('hex');
    expect(db.prepare('SELECT number, name, sha256 FROM schema_migration WHERE number = 2').get()).toEqual({
      number: 2,
      name: 'add_fact_confidence',
      sha256,
    });
    console.info(`Recorded migration: ${SECOND}, sha256 ${sha256}`);
  });
});
