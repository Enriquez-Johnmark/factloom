import {
  type ChangeSet,
  createInMemoryStore,
  createTestDeps,
  type Domain,
  type Embedder,
  err,
  type MemoryStore,
  ok,
  TEST_DOMAIN,
  toTimestamp,
} from '@kronomind/core';
import { describe, expect, it } from 'vitest';
import { findDuplicateEntities, NAME_STAGE } from './find-duplicate-entities.ts';

const NAMESPACE = 'repo:shop-api';

/** An embedder that fails the test if the job calls it. */
const FAILING_EMBEDDER: Embedder = {
  model: 'failing',
  dimensions: 4,
  embed: () => {
    throw new Error('The duplicate job called the embedder.');
  },
};

/** Creates entities, each on the day given, in one commit per entity. */
async function createEntities(
  store: MemoryStore,
  entities: readonly {
    readonly id: string;
    readonly name: string;
    readonly type?: string;
    readonly day: string;
  }[],
) {
  for (const { id, name, type, day } of entities) {
    const at = toTimestamp(new Date(day));
    const created = await store.commit({
      namespace: NAMESPACE,
      operationId: `op-${id}`,
      operation: 'remember',
      trigger: 'agent',
      reasonCode: 'stated',
      explainedBySourceId: null,
      occurredAt: at,
      changes: [
        {
          kind: 'create_entity',
          entity: { id, namespace: NAMESPACE, type: type ?? 'dependency', name, createdAt: at },
        },
      ],
    });
    if (!created.ok) throw new Error(created.error.message);
  }
}

/** Runs the job on 2026-03-01 with the name stage, a failing LLM client and a failing embedder. */
function run(store: MemoryStore, domain: Domain = TEST_DOMAIN) {
  const deps = { ...createTestDeps({ now: '2026-03-01', store, domain }), embedder: FAILING_EMBEDDER };
  return findDuplicateEntities({ ...deps, stages: [NAME_STAGE] }, { namespace: NAMESPACE });
}

async function merges(store: MemoryStore) {
  const listed = await store.listEntityMerges({ namespace: NAMESPACE });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.map((merge) => [merge.fromEntityId, merge.intoEntityId, merge.undoneAt === null]);
}

describe('findDuplicateEntities', () => {
  it('merges two entities whose names differ only in punctuation and case into the one created earlier', async () => {
    const store = createInMemoryStore();
    await createEntities(store, [
      { id: 'e-later', name: 'nodejs', day: '2026-02-01' },
      { id: 'e-earlier', name: 'Node.js', day: '2026-01-10' },
    ]);

    const result = await run(store);

    expect(result.ok && result.value).toMatchObject({ examined: 1, changed: 1, flagged: 0, failed: 0 });
    expect(await merges(store)).toEqual([['e-later', 'e-earlier', true]]);
    const audit = await store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'entity',
      targetId: 'e-later',
    });
    expect(
      audit.ok && audit.value.filter((entry) => entry.operation === 'merge').map((entry) => entry.trigger),
    ).toEqual(['maintenance']);
  });

  it('does not compare entities of a type whose names are exact, such as the symbols of code', async () => {
    const store = createInMemoryStore();
    await createEntities(store, [
      { id: 'e-earlier', name: 'formatDate', type: 'symbol', day: '2026-01-10' },
      { id: 'e-later', name: 'format_date', type: 'symbol', day: '2026-02-01' },
    ]);
    const deps = { ...createTestDeps({ now: '2026-03-01', store }), embedder: FAILING_EMBEDDER };

    const result = await findDuplicateEntities(
      { ...deps, stages: [NAME_STAGE], exactEntityTypes: ['symbol'] },
      { namespace: NAMESPACE },
    );

    expect(result.ok && result.value).toMatchObject({ examined: 0, changed: 0 });
    expect(await merges(store)).toEqual([]);
  });

  it('does not compare two entities with equal names and different types', async () => {
    const store = createInMemoryStore();
    await createEntities(store, [
      { id: 'e-tool', name: 'Vitest', type: 'dependency', day: '2026-01-10' },
      { id: 'e-repo', name: 'vitest', type: 'repository', day: '2026-02-01' },
    ]);

    const result = await run(store);

    expect(result.ok && result.value.examined).toBe(0);
    expect(await merges(store)).toEqual([]);
  });

  it('reports the pair under human_approval and writes no merge row', async () => {
    const store = createInMemoryStore();
    await createEntities(store, [
      { id: 'e-earlier', name: 'Node.js', day: '2026-01-10' },
      { id: 'e-later', name: 'nodejs', day: '2026-02-01' },
    ]);

    const result = await run(store, { ...TEST_DOMAIN, correctionPolicy: 'human_approval' });

    expect(result.ok && result.value).toMatchObject({
      changed: 0,
      flagged: 1,
      flaggedItems: [{ id: 'e-later->e-earlier', reason: 'same_entity' }],
    });
    expect(await merges(store)).toEqual([]);
  });

  it('does not merge again a pair whose merge was undone', async () => {
    const inner = createInMemoryStore();
    await createEntities(inner, [
      { id: 'e-earlier', name: 'Node.js', day: '2026-01-10' },
      { id: 'e-later', name: 'nodejs', day: '2026-02-01' },
    ]);
    const undone = {
      id: 'm-undone',
      namespace: NAMESPACE,
      fromEntityId: 'e-later',
      intoEntityId: 'e-earlier',
      mergedAt: toTimestamp(new Date('2026-02-02')),
      undoneAt: toTimestamp(new Date('2026-02-03')),
    };
    const store: MemoryStore = { ...inner, listEntityMerges: async () => ok([undone]) };

    const result = await run(store);

    expect(result.ok && result.value.changed).toBe(0);
    expect(await merges(inner)).toEqual([]);
  });

  it('counts a merge refused with conflict as flagged, with the facts in the way, and goes on', async () => {
    const inner = createInMemoryStore();
    await createEntities(inner, [
      { id: 'e-a1', name: 'Node.js', day: '2026-01-10' },
      { id: 'e-a2', name: 'nodejs', day: '2026-01-11' },
      { id: 'e-b1', name: 'TypeScript', day: '2026-01-12' },
      { id: 'e-b2', name: 'Type-Script', day: '2026-01-13' },
    ]);
    const store: MemoryStore = {
      ...inner,
      commit: (changeSet: ChangeSet) =>
        changeSet.changes.some(
          (change) => change.kind === 'merge_entities' && change.merge.fromEntityId === 'e-a2',
        )
          ? Promise.resolve(
              err('conflict', 'The two hold different values.', { relatedFactIds: ['f-1', 'f-2'] }),
            )
          : inner.commit(changeSet),
    };

    const result = await run(store);

    expect(result.ok && result.value).toMatchObject({
      changed: 1,
      flagged: 1,
      failed: 0,
      flaggedItems: [{ id: 'e-a2->e-a1', reason: 'merge_conflict: f-1, f-2' }],
    });
    expect(await merges(inner)).toEqual([['e-b2', 'e-b1', true]]);
  });

  it('makes no further merge on a second run over the same memory', async () => {
    const store = createInMemoryStore();
    await createEntities(store, [
      { id: 'e-earlier', name: 'Node.js', day: '2026-01-10' },
      { id: 'e-later', name: 'nodejs', day: '2026-02-01' },
      { id: 'e-third', name: 'NODE JS', day: '2026-02-02' },
    ]);
    await run(store);
    const afterFirst = await merges(store);

    const second = await run(store);

    expect(afterFirst).toEqual([
      ['e-later', 'e-earlier', true],
      ['e-third', 'e-earlier', true],
    ]);
    expect(second.ok && second.value.changed).toBe(0);
    expect(await merges(store)).toEqual(afterFirst);
  });
});
