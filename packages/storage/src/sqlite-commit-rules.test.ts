// Tests of what the SQLite commit refuses: the single-value rule and the error code of each
// refusal. The store has no read methods yet, so these tests assert on results and on rows
// read with SQL through a second connection.
import type { Change } from '@factloom/core';
import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  at,
  changeSet,
  DATABASE,
  entity,
  fact,
  NAMESPACE,
  recordFact,
  source,
  writeTimeline,
} from './memory-store-contract.ts';
import { openSqliteMemoryStore } from './open-sqlite-memory-store.ts';
import { closeLater, closeTestStores, countRows, FIXTURE_MODEL, openOnFile } from './sqlite-test-store.ts';

afterEach(closeTestStores);

const OTHER_NAMESPACE = 'repo:other';

/** A store holding the fixture: `pg14-ended` until 2026-03-15 and `pg16` after it are live. */
async function openWithTimeline() {
  const opened = openOnFile();
  await writeTimeline(opened.store);
  return opened;
}

/** A new value for the database version of the repository, valid for the given period. */
function databaseFact(id: string, validFrom: string | null, validTo: string | null): Change {
  return recordFact(
    fact(id, DATABASE, 'PostgreSQL 13', {
      validFrom: validFrom === null ? null : at(validFrom),
      validTo: validTo === null ? null : at(validTo),
      createdAt: at('2026-06-01'),
    }),
  );
}

function countLiveDatabaseFacts(rows: Database.Database): number {
  const row = rows
    .prepare<[string, string], { count: number }>(
      "SELECT count(*) AS count FROM fact WHERE namespace = ? AND subject_entity_id = 'e-repo' AND predicate = ? AND invalidated_at IS NULL",
    )
    .get(NAMESPACE, DATABASE);
  return row?.count ?? -1;
}

describe('the single-value rule on SQLite', () => {
  it('refuses the four overlapping periods and accepts the touching one', async () => {
    const { store, rows } = await openWithTimeline();
    const before = countRows(rows);
    const overlapping = [
      { name: 'a second open-ended value', from: '2026-06-01', to: null, overlaps: 'pg16' },
      { name: 'an older fact arriving late', from: '2024-01-01', to: '2025-09-01', overlaps: 'pg14-ended' },
      { name: 'a fact dated in the future', from: '2027-01-01', to: null, overlaps: 'pg16' },
      { name: 'an unknown start', from: null, to: '2025-07-01', overlaps: 'pg14-ended' },
    ];

    for (const period of overlapping) {
      const refused = await store.commit(
        changeSet('op-4', '2026-06-01', [databaseFact('pg13', period.from, period.to)]),
      );
      expect(!refused.ok && refused.error.code, period.name).toBe('conflict');
      expect(!refused.ok && refused.error.relatedFactIds, period.name).toEqual([period.overlaps]);
    }
    expect(countRows(rows)).toEqual(before);

    // An older fact that ends where the next begins only touches it.
    const touching = await store.commit(
      changeSet('op-4', '2026-06-01', [databaseFact('pg13', '2024-01-01', '2025-06-01')]),
    );
    expect(touching.ok).toBe(true);
    expect(countLiveDatabaseFacts(rows)).toBe(3);
  });

  it('does not apply the single-value rule to a multi-valued predicate', async () => {
    const { store } = await openWithTimeline();
    const dependency = (id: string, value: string): Change =>
      recordFact(fact(id, 'depends_on', value, { createdAt: at('2026-06-01') }), { singleValued: false });

    const result = await store.commit(
      changeSet('op-4', '2026-06-01', [dependency('redis', 'Redis'), dependency('kafka', 'Kafka')]),
    );

    expect(result.ok).toBe(true);
  });

  it('accepts a change set that invalidates a fact and records its replacement', async () => {
    const { store, rows } = await openWithTimeline();

    const result = await store.commit(
      changeSet(
        'op-4',
        '2026-06-01',
        [
          recordFact(
            fact('pg17', DATABASE, 'PostgreSQL 17', {
              validFrom: at('2026-03-15'),
              createdAt: at('2026-06-01'),
            }),
          ),
          { kind: 'invalidate_fact', factId: 'pg16', supersededByFactId: 'pg17' },
        ],
        { operation: 'correction', reasonCode: 'reported_wrong' },
      ),
    );

    expect(result.ok).toBe(true);
    expect(countLiveDatabaseFacts(rows)).toBe(2);
  });

  it('two stores on one file cannot both commit facts that break the single-value rule', async () => {
    const { store, rows, path } = await openWithTimeline();
    const second = openSqliteMemoryStore({ path, ...FIXTURE_MODEL });
    if (!second.ok) throw new Error(second.error.message);
    closeLater(() => void second.value.close());
    const openEnded = (id: string): Change =>
      recordFact(fact(id, 'runs_on', id, { validFrom: at('2026-06-01'), createdAt: at('2026-06-01') }));

    const first = await store.commit(changeSet('op-4', '2026-06-01', [openEnded('linux')]));
    const other = await second.value.commit(changeSet('op-5', '2026-06-01', [openEnded('macos')]));

    expect(first.ok).toBe(true);
    expect(!other.ok && other.error.code).toBe('conflict');
    expect(!other.ok && other.error.relatedFactIds).toEqual(['linux']);
    expect(
      rows
        .prepare("SELECT count(*) AS count FROM fact WHERE predicate = 'runs_on' AND invalidated_at IS NULL")
        .get(),
    ).toEqual({ count: 1 });
  });
});

describe('the error code of each refusal on SQLite', () => {
  it('returns each documented error code', async () => {
    const { store, rows } = await openWithTimeline();
    const before = countRows(rows);
    const note = { kind: 'record_source', source: source('s-4', '2026-06-01', 'A note.') } as const;
    const refusals: readonly { code: string; changes: readonly Change[]; related?: readonly string[] }[] = [
      {
        code: 'not_found',
        changes: [{ kind: 'invalidate_fact', factId: 'no-such-fact', supersededByFactId: null }],
      },
      {
        code: 'not_found',
        changes: [note, { kind: 'attach_source', factId: 'pg16', sourceId: 'no-such-source' }],
      },
      {
        code: 'not_found',
        changes: [recordFact(fact('f', DATABASE, 'x', { subjectEntityId: 'no-such-entity' }))],
      },
      {
        code: 'not_found',
        changes: [recordFact(fact('f', 'p', 'x'), { embedding: { copyFromFactId: 'no-such-fact' } })],
      },
      {
        code: 'already_invalidated',
        changes: [{ kind: 'invalidate_fact', factId: 'pg14', supersededByFactId: null }],
        related: ['pg14-ended'],
      },
      {
        code: 'already_invalidated',
        changes: [note, { kind: 'attach_source', factId: 'node20', sourceId: 's-4' }],
        related: ['node22'],
      },
      { code: 'already_exists', changes: [{ kind: 'create_entity', entity: entity('e-repo-2', 'Example') }] },
      {
        code: 'already_exists',
        changes: [{ kind: 'create_entity', entity: entity('e-repo', 'another name') }],
      },
      {
        code: 'already_exists',
        changes: [{ kind: 'record_source', source: source('s-1', '2026-06-01', 'Again.') }],
      },
      { code: 'already_exists', changes: [recordFact(fact('pg16', 'p', 'x'))] },
      { code: 'already_exists', changes: [{ kind: 'attach_source', factId: 'pg16', sourceId: 's-2' }] },
      { code: 'conflict', changes: [note, databaseFact('pg13', '2026-06-01', null)], related: ['pg16'] },
    ];

    for (const [index, refusal] of refusals.entries()) {
      const result = await store.commit(changeSet('op-4', '2026-06-01', refusal.changes));
      expect(!result.ok && result.error.code, `refusal ${index}`).toBe(refusal.code);
      if (refusal.related !== undefined) {
        expect(!result.ok && result.error.relatedFactIds, `refusal ${index}`).toEqual(refusal.related);
      }
      expect(countRows(rows), `refusal ${index}`).toEqual(before);
    }
  });

  it('returns not_found for an identifier that exists only in another namespace', async () => {
    const { store, rows } = await openWithTimeline();
    await writeTimeline(store, { namespace: OTHER_NAMESPACE, prefix: 'other-' });
    const before = countRows(rows);
    const elsewhere = { namespace: OTHER_NAMESPACE } as const;
    const refusals: readonly (readonly Change[])[] = [
      // A fact to invalidate that is live in the first namespace only.
      [{ kind: 'invalidate_fact', factId: 'pg16', supersededByFactId: null }],
      // A subject entity of the first namespace.
      [
        recordFact(fact('f', 'p', 'x', { ...elsewhere, subjectEntityId: 'e-repo' }), {
          sourceIds: ['other-s-1'],
        }),
      ],
      // A source of the first namespace.
      [
        recordFact(fact('f', 'p', 'x', { ...elsewhere, subjectEntityId: 'other-e-repo' }), {
          sourceIds: ['s-1'],
        }),
      ],
      [{ kind: 'attach_source', factId: 'other-pg16', sourceId: 's-3' }],
      // A superseding fact, and a fact to copy a vector from, of the first namespace.
      [{ kind: 'invalidate_fact', factId: 'other-pg16', supersededByFactId: 'pg16' }],
      [
        recordFact(fact('f', 'p', 'x', { ...elsewhere, subjectEntityId: 'other-e-repo' }), {
          sourceIds: ['other-s-1'],
          embedding: { copyFromFactId: 'pg16' },
        }),
      ],
    ];

    for (const [index, changes] of refusals.entries()) {
      const result = await store.commit(changeSet('op-9', '2026-06-01', changes, elsewhere));
      expect(!result.ok && result.error.code, `refusal ${index}`).toBe('not_found');
      expect(countRows(rows), `refusal ${index}`).toEqual(before);
    }
  });
});
