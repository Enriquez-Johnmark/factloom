// Tests of the ninth migration, which adds proposed changes (FL-043): its triggers, and its
// application to a database that the earlier migrations alone created.
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
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
const THIS = '0009_add_proposed_change.sql';
const NEW_FACT = JSON.stringify({
  fact: { statement: 'The example repository runs PostgreSQL 17' },
  newEntities: [],
});

afterEach(closeTestStores);

describe('the proposed_change migration', () => {
  it('refuses a delete of any proposal, and every update but deciding a pending one once', async () => {
    const { store, path } = openOnFile();
    await writeTimeline(store);
    const db = openConnection(path);
    closeLater(() => db.close());
    db.prepare(
      `INSERT INTO proposed_change (id, namespace, stored_fact_id, kind, changed_at, new_fact, source_id,
                                    reason_code, proposed_at, state)
       VALUES ('p-1', 'repo:example', 'pg16', 'correction', NULL, ?, 's-1', 'judged_wrong',
               '2026-06-01T00:00:00.000Z', 'pending')`,
    ).run(NEW_FACT);

    expect(() => db.exec('DELETE FROM proposed_change')).toThrow('proposed changes are never deleted');
    expect(() => db.exec("UPDATE proposed_change SET stored_fact_id = 'pg14'")).toThrow(
      'changes only by being decided once',
    );
    expect(() =>
      db.exec(
        "UPDATE proposed_change SET state = 'approved', decided_at = '2026-06-02T00:00:00.000Z', new_fact = '{}'",
      ),
    ).toThrow('changes only by being decided once');
    db.exec("UPDATE proposed_change SET state = 'rejected', decided_at = '2026-06-02T00:00:00.000Z'");
    expect(() =>
      db.exec("UPDATE proposed_change SET state = 'approved', decided_at = '2026-06-03T00:00:00.000Z'"),
    ).toThrow('changes only by being decided once');
    expect(() => db.exec('DELETE FROM proposed_change')).toThrow('proposed changes are never deleted');
  });

  it('refuses a succession with no moment of change, and a decision with no time', async () => {
    const { store, path } = openOnFile();
    await writeTimeline(store);
    const db = openConnection(path);
    closeLater(() => db.close());
    const insert = (kind: string, changedAt: string | null, state: string, decidedAt: string | null) =>
      db
        .prepare(
          `INSERT INTO proposed_change (id, namespace, stored_fact_id, kind, changed_at, new_fact, source_id,
                                        reason_code, proposed_at, state, decided_at)
           VALUES (?, 'repo:example', 'pg16', ?, ?, ?, 's-1', 'judged_ended', '2026-06-01T00:00:00.000Z', ?, ?)`,
        )
        .run(`p-${kind}-${state}`, kind, changedAt, NEW_FACT, state, decidedAt);

    expect(() => insert('succession', null, 'pending', null)).toThrow('CHECK constraint failed');
    expect(() => insert('correction', null, 'approved', null)).toThrow('CHECK constraint failed');
    expect(() => insert('correction', '2026-05-01T00:00:00.000Z', 'pending', null)).toThrow(
      'CHECK constraint failed',
    );
    insert('succession', '2026-05-01T00:00:00.000Z', 'pending', null);
  });

  it('applies to a database the earlier migrations created, and reads its fact unchanged', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'kronomind-upgrade-'));
    closeLater(() => rmSync(directory, { recursive: true }));
    const earlierOnly = join(directory, 'migrations');
    mkdirSync(earlierOnly);
    for (const fileName of readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql') && name < THIS)) {
      copyFileSync(join(MIGRATIONS, fileName), join(earlierOnly, fileName));
    }
    const path = join(directory, 'kronomind.db');
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
    });
  });

  it('allows the new fact of a proposal to change only to the marker, and only once its source is purged', async () => {
    const { store, path } = openOnFile();
    await writeTimeline(store);
    const db = openConnection(path);
    closeLater(() => db.close());
    db.prepare(
      `INSERT INTO proposed_change (id, namespace, stored_fact_id, kind, changed_at, new_fact, source_id,
                                    reason_code, proposed_at, state)
       VALUES ('p-1', 'repo:example', 'pg16', 'correction', NULL, ?, 's-1', 'judged_wrong',
               '2026-06-01T00:00:00.000Z', 'pending')`,
    ).run(NEW_FACT);
    const purgeText =
      "UPDATE proposed_change SET new_fact = json_set(new_fact, '$.fact.statement', '[purged]')";

    expect(() => db.exec(purgeText)).toThrow('or purged with its source');
    db.exec(
      "UPDATE source SET content = '[purged]', content_hash = NULL, locator = NULL, purged_at = '2026-06-02T00:00:00.000Z' WHERE id = 's-1'",
    );
    expect(() =>
      db.exec("UPDATE proposed_change SET new_fact = json_set(new_fact, '$.fact.statement', 'edited')"),
    ).toThrow('or purged with its source');
    db.exec(purgeText);
  });
});
