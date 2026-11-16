// Adapter tests of the vector lane and of the embedding model checks: what the contract
// cases V1 to V6 do not cover.
import type { Change } from '@factloom/core';
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
import { openSqliteMemoryStore } from './open-sqlite-memory-store.ts';
import { closeLater, closeTestStores, countRows, FIXTURE_MODEL, openOnFile } from './sqlite-test-store.ts';

afterEach(closeTestStores);

const NOW = at('2026-11-16');
const FRAMEWORK = 'uses_test_framework';
const JEST_VECTOR = new Float32Array([0, 0, 1, 0]);

/** A value of the test framework, valid for the given period, recorded on the given day. */
function framework(
  id: string,
  value: string,
  period: { from: string; to: string | null },
  recordedOn: string,
  embedding: Float32Array | { copyFromFactId: string },
): Change {
  return recordFact(
    fact(id, FRAMEWORK, value, {
      validFrom: at(period.from),
      validTo: period.to === null ? null : at(period.to),
      createdAt: at(recordedOn),
    }),
    { embedding },
  );
}

describe('the vector lane on SQLite', () => {
  it('returns current facts when every nearer vector belongs to a superseded copy', async () => {
    const { store } = openOnFile();
    const commits = [
      changeSet('op-1', '2026-01-10', [
        { kind: 'create_entity', entity: entity('e-repo', 'example') },
        { kind: 'record_source', source: source('s-1', '2026-01-10', 'Notes.') },
        framework('jest', 'Jest', { from: '2025-01-01', to: null }, '2026-01-10', JEST_VECTOR),
      ]),
      // The fact is ended, and Vitest follows it. The copy carries the same vector.
      changeSet(
        'op-2',
        '2026-04-02',
        [
          framework('jest-ended', 'Jest', { from: '2025-01-01', to: '2026-03-15' }, '2026-04-02', {
            copyFromFactId: 'jest',
          }),
          { kind: 'invalidate_fact', factId: 'jest', supersededByFactId: 'jest-ended' },
          framework(
            'vitest',
            'Vitest',
            { from: '2026-03-15', to: null },
            '2026-04-02',
            new Float32Array([0, 0, 0.6, 0.8]),
          ),
        ],
        { operation: 'succession', reasonCode: 'reported_ended' },
      ),
      // The end is moved to 20 March: the copy is ended again, and so is Vitest's start.
      changeSet(
        'op-3',
        '2026-05-01',
        [
          framework('jest-ended-2', 'Jest', { from: '2025-01-01', to: '2026-03-20' }, '2026-05-01', {
            copyFromFactId: 'jest-ended',
          }),
          { kind: 'invalidate_fact', factId: 'jest-ended', supersededByFactId: 'jest-ended-2' },
          framework('vitest-2', 'Vitest', { from: '2026-03-20', to: null }, '2026-05-01', {
            copyFromFactId: 'vitest',
          }),
          { kind: 'invalidate_fact', factId: 'vitest', supersededByFactId: 'vitest-2' },
        ],
        { operation: 'revision', reasonCode: 'reported_ended' },
      ),
    ];
    for (const commit of commits) {
      const committed = await store.commit(commit);
      if (!committed.ok) throw new Error(committed.error.message);
    }
    const search = async (validAt: string, knownAt: string): Promise<string[]> => {
      const found = await store.searchFactsByVector({
        namespace: NAMESPACE,
        vector: JEST_VECTOR,
        time: { validAt: at(validAt), knownAt: at(knownAt) },
        limit: 1,
      });
      if (!found.ok) throw new Error(found.error.message);
      return found.value.map((result) => result.fact.id);
    };

    // Three rows hold the query's own vector, and none of them is true now.
    // As of now, known now: the current fact, though its vector is the farthest.
    expect(await search('2026-11-16', '2026-11-16')).toEqual(['vitest-2']);
    // As of 2026-02-01, known now: the latest copy of the ended fact.
    expect(await search('2026-02-01', '2026-11-16')).toEqual(['jest-ended-2']);
    // As of 2026-02-01, known at 2026-02-01: the original, before anyone knew it had ended.
    expect(await search('2026-02-01', '2026-02-01')).toEqual(['jest']);
  });

  it('returns invalid_input for a limit below 1', async () => {
    const { store } = openOnFile();

    const found = await store.searchFactsByVector({
      namespace: NAMESPACE,
      vector: JEST_VECTOR,
      time: { validAt: NOW, knownAt: NOW },
      limit: 0,
    });

    expect(!found.ok && found.error.code).toBe('invalid_input');
  });
});

describe('the embedding model of a SQLite store', () => {
  it('refuses to open a database built with another model', async () => {
    const { store, path } = openOnFile();
    await writeTimeline(store);

    const opened = openSqliteMemoryStore({ path, embeddingModel: 'another-model', embeddingDimensions: 4 });

    expect(!opened.ok && opened.error.code).toBe('embedding_model_mismatch');
    expect(!opened.ok && opened.error.message).toContain('fixture-model');
    expect(!opened.ok && opened.error.message).toContain('another-model');
  });

  it('refuses to open a database built with another number of dimensions', async () => {
    const { store, path } = openOnFile();
    await writeTimeline(store);

    const opened = openSqliteMemoryStore({ path, embeddingModel: 'fixture-model', embeddingDimensions: 384 });

    expect(!opened.ok && opened.error.code).toBe('embedding_model_mismatch');
  });

  it('opens an empty database with any model', () => {
    const { path } = openOnFile();

    const opened = openSqliteMemoryStore({ path, embeddingModel: 'another-model', embeddingDimensions: 384 });
    if (opened.ok) closeLater(() => void opened.value.close());

    expect(opened.ok).toBe(true);
  });

  it('gives a copied fact the vector of the fact it copies', async () => {
    const { store, rows } = openOnFile();

    await writeTimeline(store);

    const embeddings = rows
      .prepare<[], { model: string; dimensions: number; embedding: Buffer }>(
        "SELECT model, dimensions, embedding FROM fact_embedding WHERE fact_id IN ('pg14', 'pg14-ended') ORDER BY fact_id",
      )
      .all();
    expect(embeddings).toHaveLength(2);
    expect(embeddings[1]).toEqual(embeddings[0]);
  });

  it('does not copy a vector across namespaces', async () => {
    const { store, rows } = openOnFile();
    await writeTimeline(store);
    await writeTimeline(store, { namespace: 'repo:other', prefix: 'other-' });
    const before = countRows(rows);

    const result = await store.commit(
      changeSet(
        'op-9',
        '2026-06-01',
        [
          recordFact(
            fact('copy', 'has_note', 'x', {
              namespace: 'repo:other',
              subjectEntityId: 'other-e-repo',
              createdAt: at('2026-06-01'),
            }),
            { sourceIds: ['other-s-1'], embedding: { copyFromFactId: 'pg16' }, singleValued: false },
          ),
        ],
        { namespace: 'repo:other' },
      ),
    );

    expect(!result.ok && result.error.code).toBe('not_found');
    expect(countRows(rows)).toEqual(before);
  });
});
