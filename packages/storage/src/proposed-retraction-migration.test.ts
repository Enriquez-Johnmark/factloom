// Tests of the eleventh migration, which lets a proposal hold a retraction (FL-095): its checks,
// and its application to a database that holds a pending proposal from the earlier migrations.
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
const THIS = '0011_proposed_retraction.sql';
const NEW_FACT = JSON.stringify({
  fact: {
    subjectEntityId: 'e-repo',
    predicate: 'uses_database_version',
    object: { kind: 'value', value: 'PostgreSQL 16' },
    statement: 'The example repository runs PostgreSQL 16',
    confidence: 0.9,
    validFrom: null,
    validTo: null,
  },
  newEntities: [],
});

afterEach(closeTestStores);

describe('the proposed retraction migration', () => {
  it('refuses a correction with no new fact and a retraction with one, and accepts a retraction without', async () => {
    const { store, path } = openOnFile();
    await writeTimeline(store);
    const db = openConnection(path);
    closeLater(() => db.close());
    const insert = (id: string, kind: string, newFact: string | null) =>
      db
        .prepare(
          `INSERT INTO proposed_change (id, namespace, stored_fact_id, kind, changed_at, new_fact, source_id,
                                        reason_code, proposed_at, state)
           VALUES (?, 'repo:example', 'pg16', ?, NULL, ?, 's-1', 'reported_wrong', '2026-06-01T00:00:00.000Z', 'pending')`,
        )
        .run(id, kind, newFact);

    expect(() => insert('p-1', 'correction', null)).toThrow('CHECK constraint failed');
    expect(() => insert('p-2', 'retraction', NEW_FACT)).toThrow('CHECK constraint failed');
    insert('p-3', 'retraction', null);
    expect(() => db.exec('DELETE FROM proposed_change')).toThrow('proposed changes are never deleted');
  });

  it('keeps a pending proposal made before it, and reads it the same afterwards', async () => {
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
      INSERT INTO source (id, namespace, kind, locator, version, content, content_hash, observed_at, created_at)
        VALUES ('s-1', 'repo:example', 'agent_note', NULL, NULL, 'We run PostgreSQL 16.', NULL,
                '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
    `);
    old
      .prepare(
        `INSERT INTO proposed_change (id, namespace, stored_fact_id, kind, changed_at, new_fact, source_id,
                                      reason_code, proposed_at, state)
         VALUES ('p-1', 'repo:example', 'pg14', 'succession', '2026-05-01T00:00:00.000Z', ?, 's-1',
                 'judged_ended', '2026-06-01T00:00:00.000Z', 'pending')`,
      )
      .run(NEW_FACT);
    old.close();

    const opened = openSqliteMemoryStore({ path, ...FIXTURE_MODEL });
    if (!opened.ok) throw new Error(opened.error.message);
    closeLater(() => void opened.value.close());
    const listed = await opened.value.listPendingProposals({ namespace: 'repo:example' });

    expect(listed.ok && listed.value.map((pending) => pending.proposal)).toEqual([
      {
        id: 'p-1',
        namespace: 'repo:example',
        storedFactId: 'pg14',
        supersession: { kind: 'succession', changedAt: '2026-05-01T00:00:00.000Z' },
        newFact: JSON.parse(NEW_FACT),
        sourceId: 's-1',
        reasonCode: 'judged_ended',
        proposedAt: '2026-06-01T00:00:00.000Z',
        state: 'pending',
        decidedAt: null,
      },
    ]);
  });
});
