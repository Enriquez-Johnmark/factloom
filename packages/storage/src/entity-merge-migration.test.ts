// Tests of the fifth migration, which adds entity merges (FL-052): its triggers, and its
// application to a database that the earlier migrations alone created.
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toTimestamp } from '@factloom/core';
import { afterEach, describe, expect, it } from 'vitest';
import { writeTimeline } from './memory-store-contract.ts';
import { openConnection } from './open-connection.ts';
import { openSqliteMemoryStore } from './open-sqlite-memory-store.ts';
import { runMigrations } from './run-migrations.ts';
import { closeLater, closeTestStores, FIXTURE_MODEL, openOnFile } from './sqlite-test-store.ts';

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');
const THIS = '0005_add_entity_merge.sql';

afterEach(closeTestStores);

describe('the entity_merge migration', () => {
  it('refuses a delete of a merge, and every update but setting undone_at once', async () => {
    const { store, path } = openOnFile();
    await writeTimeline(store);
    const db = openConnection(path);
    closeLater(() => db.close());
    db.exec(`
      INSERT INTO entity (id, namespace, type, name, name_key, created_at)
        VALUES ('e-other', 'repo:example', 'repository', 'example-two', 'example-two', '2026-01-10T00:00:00.000Z');
      INSERT INTO entity_merge (id, namespace, from_entity_id, into_entity_id, merged_at)
        VALUES ('m-1', 'repo:example', 'e-other', 'e-repo', '2026-05-01T00:00:00.000Z');
    `);

    expect(() => db.exec('DELETE FROM entity_merge')).toThrow('entity merges are never deleted');
    expect(() => db.exec("UPDATE entity_merge SET into_entity_id = 'e-other'")).toThrow(
      'changes only by being undone once',
    );
    expect(() => db.exec("UPDATE entity_merge SET merged_at = '2026-05-02T00:00:00.000Z'")).toThrow(
      'changes only by being undone once',
    );
    db.exec("UPDATE entity_merge SET undone_at = '2026-05-03T00:00:00.000Z'");
    expect(() => db.exec("UPDATE entity_merge SET undone_at = '2026-05-04T00:00:00.000Z'")).toThrow(
      'changes only by being undone once',
    );
  });

  it('applies to a database the earlier migrations created, and reads its fact unchanged', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'factloom-upgrade-'));
    closeLater(() => rmSync(directory, { recursive: true }));
    const earlierOnly = join(directory, 'migrations');
    mkdirSync(earlierOnly);
    for (const fileName of readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql') && name < THIS)) {
      copyFileSync(join(MIGRATIONS, fileName), join(earlierOnly, fileName));
    }
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
    const found = await opened.value.getFact({ namespace: 'repo:example', factId: 'pg14' });

    expect(found.ok && found.value?.fact).toMatchObject({
      id: 'pg14',
      statement: 'The example repository runs PostgreSQL 14',
      confidence: 0.9,
      purgedAt: null,
    });
    expect(found.ok && found.value?.subject.id).toBe('e-repo');
  });
});
