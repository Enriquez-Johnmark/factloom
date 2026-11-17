import {
  createInMemoryStore,
  createScriptedLlm,
  createTestDeps,
  type Embedder,
  type LlmClient,
  type MemoryStore,
  ok,
  TEST_DOMAIN,
  toTimestamp,
} from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { createSimilarityStage } from './create-similarity-stage.ts';
import { findDuplicateEntities, NAME_STAGE } from './find-duplicate-entities.ts';

const NAMESPACE = 'repo:shop-api';

/** Vectors placed by hand: the Postgres names point the same way, the others elsewhere. */
const VECTORS: Readonly<Record<string, readonly number[]>> = {
  Postgres: [1, 0.1, 0],
  PostgreSQL: [1, 0.12, 0],
  Redis: [0, 1, 0],
  Valkey: [0, 0.95, 0.3],
  Vitest: [0, 0, 1],
  vitest: [0, 0, 1],
};

/** Five pairs of names, each pair pointing one way, every pair apart from the others. */
const FIVE_PAIRS = ['north', 'south', 'east', 'west', 'up'];
const PAIR_VECTORS: Readonly<Record<string, readonly number[]>> = Object.fromEntries(
  FIVE_PAIRS.flatMap((direction, index) => {
    const vector = FIVE_PAIRS.map((_, position) => (position === index ? 1 : 0));
    return [
      [`${direction}-one`, vector],
      [`${direction}-two`, vector],
    ];
  }),
);

/** An embedder that returns the hand-placed vector of each name. */
const PLACED_EMBEDDER: Embedder = {
  model: 'placed',
  dimensions: 3,
  embed: async (texts) =>
    ok(texts.map((text) => new Float32Array(VECTORS[text] ?? PAIR_VECTORS[text] ?? [0.3, 0.3, 0.3]))),
};

async function createEntities(
  store: MemoryStore,
  entities: readonly { id: string; name: string; type?: string }[],
) {
  for (const [index, { id, name, type }] of entities.entries()) {
    const at = toTimestamp(new Date(Date.UTC(2026, 0, 10 + index)));
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

function run(store: MemoryStore, llm: LlmClient | null, maxCalls?: number) {
  const deps = createTestDeps({ now: '2026-03-01', store, domain: TEST_DOMAIN });
  const similarity = createSimilarityStage({
    store,
    embedder: PLACED_EMBEDDER,
    llm,
    namespace: NAMESPACE,
    threshold: 0.9,
    ...(maxCalls === undefined ? {} : { maxCalls }),
  });
  return findDuplicateEntities({ ...deps, stages: [NAME_STAGE, similarity] }, { namespace: NAMESPACE });
}

async function merges(store: MemoryStore) {
  const listed = await store.listEntityMerges({ namespace: NAMESPACE });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.map((merge) => [merge.fromEntityId, merge.intoEntityId]);
}

describe('the similarity stage', () => {
  it('sends a pair above the threshold to the LLM and not one below it, and merges on "same" with trigger maintenance', async () => {
    const store = createInMemoryStore();
    await createEntities(store, [
      { id: 'e-postgres', name: 'Postgres' },
      { id: 'e-postgresql', name: 'PostgreSQL' },
      { id: 'e-redis', name: 'Redis' },
    ]);

    // One answer only: a second call would throw.
    const result = await run(store, createScriptedLlm([{ answer: 'same' }]));

    expect(result.ok && result.value.changed).toBe(1);
    expect(await merges(store)).toEqual([['e-postgresql', 'e-postgres']]);
    const audit = await store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'entity',
      targetId: 'e-postgresql',
    });
    expect(
      audit.ok && audit.value.filter((entry) => entry.operation === 'merge').map((entry) => entry.trigger),
    ).toEqual(['maintenance']);
  });

  it('leaves the pair unmerged on "different" and on "unsure", and reports the unsure one', async () => {
    const different = createInMemoryStore();
    const unsure = createInMemoryStore();
    for (const store of [different, unsure]) {
      await createEntities(store, [
        { id: 'e-postgres', name: 'Postgres' },
        { id: 'e-postgresql', name: 'PostgreSQL' },
      ]);
    }

    const fromDifferent = await run(different, createScriptedLlm([{ answer: 'different' }]));
    const fromUnsure = await run(unsure, createScriptedLlm([{ answer: 'unsure' }]));

    expect([await merges(different), await merges(unsure)]).toEqual([[], []]);
    expect(fromDifferent.ok && fromDifferent.value.flaggedItems).toEqual([]);
    expect(fromUnsure.ok && fromUnsure.value.flaggedItems).toEqual([
      { id: 'e-postgresql->e-postgres', reason: 'similar_name' },
    ]);
  });

  it('merges no pair without an LLM client, and reports the candidates', async () => {
    const store = createInMemoryStore();
    await createEntities(store, [
      { id: 'e-postgres', name: 'Postgres' },
      { id: 'e-postgresql', name: 'PostgreSQL' },
    ]);

    const result = await run(store, null);

    expect(await merges(store)).toEqual([]);
    expect(result.ok && result.value.flaggedItems).toEqual([
      { id: 'e-postgresql->e-postgres', reason: 'similar_name' },
    ]);
  });

  it('sends a pair of two types with equal names to the LLM, and merges it on "same"', async () => {
    const store = createInMemoryStore();
    await createEntities(store, [
      { id: 'e-tool', name: 'Vitest', type: 'dependency' },
      { id: 'e-repo', name: 'vitest', type: 'repository' },
    ]);

    await run(store, createScriptedLlm([{ answer: 'same' }]));

    expect(await merges(store)).toEqual([['e-repo', 'e-tool']]);
  });

  it('makes at most the call limit: with a limit of 2 and five candidates, two calls, and the rest left for the next run', async () => {
    const store = createInMemoryStore();
    // Five pairs of close names, every pair far from the others: five candidates.
    await createEntities(
      store,
      FIVE_PAIRS.flatMap((direction) => [
        { id: `e-${direction}-one`, name: `${direction}-one` },
        { id: `e-${direction}-two`, name: `${direction}-two` },
      ]),
    );

    const result = await run(store, createScriptedLlm([{ answer: 'different' }, { answer: 'different' }]), 2);

    // Two answers only: a third call would throw.
    expect(result.ok && result.value).toMatchObject({ failed: 0, undecided: 3 });
  });

  it('leaves the pair unmerged when the call fails, and counts it as failed', async () => {
    const store = createInMemoryStore();
    await createEntities(store, [
      { id: 'e-postgres', name: 'Postgres' },
      { id: 'e-postgresql', name: 'PostgreSQL' },
    ]);

    const result = await run(store, createScriptedLlm([{ verdict: 'yes' }]));

    expect(await merges(store)).toEqual([]);
    expect(result.ok && result.value.failed).toBe(1);
  });
});
