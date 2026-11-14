import { describe, expect, it } from 'vitest';
import type { Change, ChangeSet } from './change-set.ts';
import type { Fact, TimeFilter } from './fact.ts';
import { createInMemoryStore } from './in-memory-store.ts';
import type { MemoryStore } from './memory-store.ts';
import { parseDateInput, type Timestamp } from './timestamp.ts';

const NAMESPACE = 'repo:example';
const OTHER_NAMESPACE = 'repo:other';

function day(text: string): Timestamp {
  const parsed = parseDateInput(text);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

const NOW: TimeFilter = { validAt: day('2026-11-13'), knownAt: day('2026-11-13') };

function fact(id: string, statement: string, fields: Partial<Fact> = {}): Fact {
  return {
    id,
    namespace: NAMESPACE,
    subjectEntityId: 'e-repo',
    predicate: 'note',
    object: { kind: 'value', value: statement },
    statement,
    confidence: 1,
    validFrom: null,
    validTo: null,
    createdAt: day('2026-01-10'),
    invalidatedAt: null,
    supersededByFactId: null,
    ...fields,
  };
}

function record(recorded: Fact, embedding: Float32Array | { copyFromFactId: string }): Change {
  return { kind: 'record_fact', fact: recorded, sourceIds: ['s-1'], embedding, singleValued: false };
}

function changeSet(
  operationId: string,
  changes: readonly Change[],
  fields: Partial<ChangeSet> = {},
): ChangeSet {
  return {
    namespace: NAMESPACE,
    operationId,
    operation: 'remember',
    trigger: 'agent',
    reasonCode: 'stated',
    explainedBySourceId: null,
    occurredAt: day('2026-01-10'),
    changes,
    ...fields,
  };
}

async function commit(store: MemoryStore, set: ChangeSet): Promise<void> {
  const result = await store.commit(set);
  if (!result.ok) throw new Error(result.error.message);
}

/** A store with one entity, one source and the given changes, in the example namespace. */
async function createStore(changes: readonly Change[]): Promise<MemoryStore> {
  const store = createInMemoryStore();
  await commit(
    store,
    changeSet('op-seed', [
      {
        kind: 'create_entity',
        entity: {
          id: 'e-repo',
          namespace: NAMESPACE,
          type: 'repository',
          name: 'example',
          createdAt: day('2026-01-10'),
        },
      },
      {
        kind: 'record_source',
        source: {
          id: 's-1',
          namespace: NAMESPACE,
          kind: 'agent_note',
          locator: null,
          version: null,
          content: null,
          contentHash: null,
          observedAt: day('2026-01-10'),
          createdAt: day('2026-01-10'),
        },
      },
      ...changes,
    ]),
  );
  return store;
}

async function byVector(
  store: MemoryStore,
  vector: Float32Array,
  limit = 10,
  time = NOW,
  namespace = NAMESPACE,
): Promise<string[]> {
  const found = await store.searchFactsByVector({ namespace, vector, time, limit });
  if (!found.ok) throw new Error(found.error.message);
  return found.value.map((result) => result.fact.id);
}

async function byKeyword(
  store: MemoryStore,
  text: string,
  limit = 10,
  time = NOW,
  namespace = NAMESPACE,
): Promise<string[]> {
  const found = await store.searchFactsByKeyword({ namespace, text, time, limit });
  if (!found.ok) throw new Error(found.error.message);
  return found.value.map((result) => result.fact.id);
}

describe('the vector lane of the in-memory store', () => {
  it('returns the nearest fact first in the vector lane', async () => {
    const store = await createStore([
      record(fact('far', 'CI runs on Node 22'), new Float32Array([0, 1, 0, 0])),
      record(fact('near', 'The package manager is pnpm'), new Float32Array([1, 0, 0, 0])),
      record(fact('middle', 'Dependencies are pinned exactly'), new Float32Array([0.7, 0.7, 0, 0])),
    ]);
    expect(await byVector(store, new Float32Array([1, 0.05, 0, 0]))).toEqual(['near', 'middle', 'far']);
    expect(await byVector(store, new Float32Array([1, 0.05, 0, 0]), 2)).toEqual(['near', 'middle']);
  });

  it('returns a copied fact through the vector lane', async () => {
    const store = await createStore([
      record(fact('original', 'The repository uses PostgreSQL 14'), new Float32Array([0, 0, 1, 0])),
    ]);
    await commit(
      store,
      changeSet(
        'op-revise',
        [
          record(
            fact('copy', 'The repository uses PostgreSQL 14', {
              validTo: day('2026-03-15'),
              createdAt: day('2026-04-02'),
            }),
            { copyFromFactId: 'original' },
          ),
          { kind: 'invalidate_fact', factId: 'original', supersededByFactId: 'copy' },
        ],
        { operation: 'revision', reasonCode: 'reported_ended', occurredAt: day('2026-04-02') },
      ),
    );
    // As of 2026-02-01, known at 2026-11-13: the ended copy is the live belief about that date.
    const asOfFebruary: TimeFilter = { validAt: day('2026-02-01'), knownAt: day('2026-11-13') };
    expect(await byVector(store, new Float32Array([0, 0, 1, 0]), 10, asOfFebruary)).toEqual(['copy']);
  });

  it('returns invalid_input for a query vector of another size, and for a limit below 1', async () => {
    const store = await createStore([record(fact('f-1', 'A note'), new Float32Array([1, 0, 0, 0]))]);
    const wrongSize = await store.searchFactsByVector({
      namespace: NAMESPACE,
      vector: new Float32Array([1, 0]),
      time: NOW,
      limit: 5,
    });
    expect(wrongSize.ok ? null : wrongSize.error.code).toBe('invalid_input');
    const noLimit = await store.searchFactsByVector({
      namespace: NAMESPACE,
      vector: new Float32Array([1, 0, 0, 0]),
      time: NOW,
      limit: 0,
    });
    expect(noLimit.ok ? null : noLimit.error.code).toBe('invalid_input');
  });
});

describe('the keyword lane of the in-memory store', () => {
  it('returns the facts whose statement holds a word of the text', async () => {
    const store = await createStore([
      record(fact('pnpm', 'The package manager is pnpm'), new Float32Array([1, 0, 0, 0])),
      record(fact('node', 'CI runs on Node 22'), new Float32Array([0, 1, 0, 0])),
      record(
        fact('pins', 'Every package version is pinned by the package manager catalog'),
        new Float32Array([0, 0, 1, 0]),
      ),
    ]);
    expect(await byKeyword(store, 'PNPM')).toEqual(['pnpm']);
    expect(await byKeyword(store, 'which Package Manager?')).toEqual(['pnpm', 'pins']);
    expect(await byKeyword(store, 'node')).toEqual(['node']);
  });

  it('ranks a fact that matches more words first', async () => {
    const store = await createStore([
      record(fact('one-word', 'The manager approved it'), new Float32Array([1, 0, 0, 0])),
      record(fact('two-words', 'The package manager is pnpm'), new Float32Array([0, 1, 0, 0])),
    ]);
    expect(await byKeyword(store, 'package manager')).toEqual(['two-words', 'one-word']);
  });

  it('returns nothing for a text with no word, and invalid_input for a limit below 1', async () => {
    const store = await createStore([record(fact('f-1', 'A note'), new Float32Array([1, 0, 0, 0]))]);
    expect(await byKeyword(store, '  ?! ')).toEqual([]);
    const noLimit = await store.searchFactsByKeyword({
      namespace: NAMESPACE,
      text: 'note',
      time: NOW,
      limit: 0,
    });
    expect(noLimit.ok ? null : noLimit.error.code).toBe('invalid_input');
  });
});

describe('both lanes of the in-memory store', () => {
  it('applies the time filter before the limit in both lanes', async () => {
    const store = await createStore([
      record(fact('stale', 'The test framework is Jest and only Jest'), new Float32Array([1, 0, 0, 0])),
      record(fact('current', 'The test framework is Vitest'), new Float32Array([0.8, 0.6, 0, 0])),
    ]);
    await commit(
      store,
      changeSet('op-retract', [{ kind: 'invalidate_fact', factId: 'stale', supersededByFactId: null }], {
        operation: 'retraction',
        reasonCode: 'reported_wrong',
        occurredAt: day('2026-04-02'),
      }),
    );
    // As of 2026-11-13, known at 2026-11-13, with a limit of 1: the invalidated fact matches
    // better in both lanes, and must not take the one place.
    expect(await byVector(store, new Float32Array([1, 0, 0, 0]), 1)).toEqual(['current']);
    expect(await byKeyword(store, 'test framework only', 1)).toEqual(['current']);
    // As of 2026-02-01, known at 2026-02-01: the fact was still believed then, and ranks first.
    const inFebruary: TimeFilter = { validAt: day('2026-02-01'), knownAt: day('2026-02-01') };
    expect(await byVector(store, new Float32Array([1, 0, 0, 0]), 1, inFebruary)).toEqual(['stale']);
    expect(await byKeyword(store, 'test framework only', 1, inFebruary)).toEqual(['stale']);
  });

  it('returns nothing from another namespace', async () => {
    const store = await createStore([
      record(fact('f-1', 'The package manager is pnpm'), new Float32Array([1, 0, 0, 0])),
    ]);
    expect(await byVector(store, new Float32Array([1, 0, 0, 0]), 10, NOW, OTHER_NAMESPACE)).toEqual([]);
    expect(await byKeyword(store, 'pnpm', 10, NOW, OTHER_NAMESPACE)).toEqual([]);
  });

  it('returns each fact with its subject and its sources', async () => {
    const store = await createStore([
      record(fact('f-1', 'The package manager is pnpm'), new Float32Array([1, 0, 0, 0])),
    ]);
    const found = await store.searchFactsByKeyword({
      namespace: NAMESPACE,
      text: 'pnpm',
      time: NOW,
      limit: 1,
    });
    expect(found.ok && found.value[0]?.subject.name).toBe('example');
    expect(found.ok && found.value[0]?.sources.map((source) => source.id)).toEqual(['s-1']);
  });
});
