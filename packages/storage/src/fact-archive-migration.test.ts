// Tests of the eighth migration, which adds the archiving of FL-065: its triggers, and its
// application to a database that the earlier migrations alone created.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveFacts, toTimestamp } from '@factloom/core';
import { afterEach, describe, expect, it } from 'vitest';
import { writeTimeline } from './memory-store-contract.ts';
import { openConnection } from './open-connection.ts';
import { openSqliteMemoryStore } from './open-sqlite-memory-store.ts';
import { runMigrations } from './run-migrations.ts';
import { closeLater, closeTestStores, FIXTURE_MODEL, openOnFile } from './sqlite-test-store.ts';

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');
const THIS = '0008_add_fact_archive.sql';
const EARLIER = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith('.sql') && name < THIS)
  .sort();

afterEach(closeTestStores);

describe('the archiving migration', () => {
  it('refuses a delete of an archiving and every update but setting unarchived_at once', async () => {
    const { store, path } = openOnFile();
    await writeTimeline(store);
    const db = openConnection(path);
    closeLater(() => db.close());
    db.prepare(
      `INSERT INTO fact_archive (id, namespace, fact_id, archived_at)
       VALUES ('ar-1', 'repo:example', 'pg16', '2026-05-01T00:00:00.000Z')`,
    ).run();

    expect(() =>
      db.prepare("UPDATE fact_archive SET archived_at = '2026-05-02T00:00:00.000Z'").run(),
    ).toThrow('an archiving changes only by setting unarchived_at once');
    db.prepare("UPDATE fact_archive SET unarchived_at = '2026-05-03T00:00:00.000Z'").run();
    expect(() =>
      db.prepare("UPDATE fact_archive SET unarchived_at = '2026-05-04T00:00:00.000Z'").run(),
    ).toThrow('an archiving changes only by setting unarchived_at once');
    expect(() => db.prepare('DELETE FROM fact_archive').run()).toThrow('archivings are never deleted');
  });

  it('applies to a database the earlier migrations created, and archives a fact already there', async () => {
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
    let count = 0;
    const archived = await archiveFacts(
      {
        store: opened.value,
        now: () => toTimestamp(new Date('2026-05-01')),
        newId: () => {
          count += 1;
          return `id-${count}`;
        },
      },
      { namespace: 'repo:example', trigger: 'person', reasonCode: 'requested', factIds: ['pg14'] },
    );

    expect(archived).toEqual({ ok: true, value: { archiveIds: ['id-1'] } });
    const found = await opened.value.getFact({ namespace: 'repo:example', factId: 'pg14' });
    expect(found.ok && found.value?.archivedAt).toBe(toTimestamp(new Date('2026-05-01')));
    const db = openConnection(path);
    closeLater(() => db.close());
    const sha256 = createHash('sha256')
      .update(readFileSync(join(MIGRATIONS, THIS)))
      .digest('hex');
    expect(db.prepare('SELECT name, sha256 FROM schema_migration WHERE number = 8').get()).toEqual({
      name: 'add_fact_archive',
      sha256,
    });
    console.info(`Recorded migration: ${THIS}, sha256 ${sha256}`);
  });
});
