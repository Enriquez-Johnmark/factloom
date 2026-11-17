import { describe, expect, it } from 'vitest';
import { createTestDeps } from '../create-test-deps.ts';
import type { Embedder } from '../embedder.ts';
import type { MemoryStore } from '../memory-store.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { err, ok } from '../result.ts';
import { toTimestamp } from '../timestamp.ts';
import type { FactDraft, NewEntity, NewSource } from './operation-inputs.ts';
import { buildRecordFactsChangeSet, type RecordFactsInput, recordFacts } from './record-facts.ts';

const NAMESPACE = 'shop-api';
const context = { namespace: NAMESPACE, trigger: 'agent', reasonCode: 'stated' } as const;
const shopApi: NewEntity = { id: 'entity-shop-api', type: 'repository', name: 'shop-api' };

function note(content: string | null): NewSource {
  return {
    kind: 'note',
    locator: null,
    version: null,
    content,
    observedAt: toTimestamp(new Date('2026-01-01T00:00:00.000Z')),
  };
}

function draft(predicate: string, value: string, newEntities: readonly NewEntity[] = []): FactDraft {
  return {
    fact: {
      subjectEntityId: shopApi.id,
      predicate,
      object: { kind: 'value', value },
      statement: `shop-api ${predicate} ${value}`,
      confidence: 1,
      validFrom: null,
      validTo: null,
    },
    newEntities,
  };
}

function input(parts: Partial<RecordFactsInput>): RecordFactsInput {
  return { ...context, source: note('A note.'), drafts: [], restatedFactIds: [], ...parts };
}

/** Records the first fact of a test, which also creates the entity `shop-api`. */
async function recordFirst(deps: OperationDeps, predicate: string, value: string): Promise<string> {
  const recorded = await recordFacts(deps, input({ drafts: [draft(predicate, value, [shopApi])] }));
  if (!recorded.ok) throw new Error(recorded.error.message);
  const factId = recorded.value.factIds[0];
  if (factId === undefined) throw new Error('No fact was recorded.');
  return factId;
}

async function listAllFacts(store: MemoryStore) {
  const listed = await store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time: 'all',
    limit: 100,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value;
}

async function countEntitiesNamedShopApi(store: MemoryStore): Promise<number> {
  const found = await store.findEntities({ namespace: NAMESPACE, name: 'shop-api', type: null });
  if (!found.ok) throw new Error(found.error.message);
  return found.value.length;
}

const failingEmbedder: Embedder = {
  model: 'failing-embedder',
  dimensions: 16,
  embed: async () => err('embedding_failed', 'The embedder is not available.'),
};

describe('recordFacts', () => {
  it('records a source, a new entity and a fact in one commit', async () => {
    const deps = createTestDeps({ now: '2026-01-10' });

    const recorded = await recordFacts(
      deps,
      input({ source: note('abc'), drafts: [draft('uses_database_version', '16', [shopApi])] }),
    );

    if (!recorded.ok) throw new Error(recorded.error.message);
    const [factId] = recorded.value.factIds;
    if (factId === undefined) throw new Error('No fact was recorded.');
    const found = await deps.store.getFact({ namespace: NAMESPACE, factId });
    if (!found.ok || found.value === null) throw new Error('The fact was not found.');
    expect(found.value.fact.createdAt).toBe('2026-01-10T00:00:00.000Z');
    expect(found.value.sources.map((source) => source.id)).toEqual([recorded.value.sourceId]);
    expect(found.value.sources[0]?.contentHash).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const targets = [
      { targetKind: 'source', targetId: recorded.value.sourceId },
      { targetKind: 'entity', targetId: shopApi.id },
      { targetKind: 'fact', targetId: factId },
    ] as const;
    const entries = [];
    for (const target of targets) {
      const listed = await deps.store.listAuditEntries({ namespace: NAMESPACE, ...target });
      if (!listed.ok) throw new Error(listed.error.message);
      entries.push(...listed.value);
    }
    expect(entries.map((entry) => entry.action)).toEqual([
      'source.recorded',
      'entity.created',
      'fact.recorded',
    ]);
    expect(new Set(entries.map((entry) => entry.operationId)).size).toBe(1);
    expect(entries.map((entry) => entry.operation)).toEqual(['remember', 'remember', 'remember']);
  });

  it('attaches the source to a restated fact and records no second fact', async () => {
    const deps = createTestDeps();
    const factId = await recordFirst(deps, 'uses_database_version', '16');

    const restated = await recordFacts(
      deps,
      input({ reasonCode: 'restated', source: note('Said again.'), restatedFactIds: [factId] }),
    );

    expect(restated.ok && restated.value.factIds).toEqual([]);
    const facts = await listAllFacts(deps.store);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.sources).toHaveLength(2);
  });

  it('records nothing when one draft conflicts with a live fact', async () => {
    const deps = createTestDeps();
    await recordFirst(deps, 'uses_database_version', '16');
    const redis: NewEntity = { id: 'entity-redis', type: 'dependency', name: 'redis' };

    const result = await recordFacts(
      deps,
      input({
        source: note('A second note.'),
        drafts: [draft('depends_on', 'redis', [redis]), draft('uses_database_version', '17')],
      }),
    );

    expect(!result.ok && result.error.code).toBe('conflict');
    expect(await listAllFacts(deps.store)).toHaveLength(1);
    const foundRedis = await deps.store.findEntities({ namespace: NAMESPACE, name: 'redis', type: null });
    expect(foundRedis.ok && foundRedis.value).toEqual([]);
    // The counting generator gave id-1 to id-3 to the first call, so the refused source is id-6.
    const foundSource = await deps.store.getSource({ namespace: NAMESPACE, sourceId: 'id-6' });
    expect(foundSource).toEqual({ ok: true, value: null });
  });

  it('returns invalid_input for a predicate the domain does not have', async () => {
    const deps = createTestDeps();

    const result = await recordFacts(deps, input({ drafts: [draft('has_mascot', 'a fox', [shopApi])] }));

    expect(!result.ok && result.error.code).toBe('invalid_input');
    expect(await countEntitiesNamedShopApi(deps.store)).toBe(0);
  });

  it('returns invalid_input for an entity type the domain does not have', async () => {
    const deps = createTestDeps();
    const team: NewEntity = { id: 'entity-team', type: 'team', name: 'platform' };

    const result = await recordFacts(
      deps,
      input({ drafts: [draft('depends_on', 'redis', [shopApi, team])] }),
    );

    expect(!result.ok && result.error.code).toBe('invalid_input');
    expect(await countEntitiesNamedShopApi(deps.store)).toBe(0);
  });

  it('returns invalid_input for a valid period that ends before it starts', async () => {
    const deps = createTestDeps();
    const reversed = draft('depends_on', 'redis', [shopApi]);

    const result = await recordFacts(
      deps,
      input({
        drafts: [
          {
            ...reversed,
            fact: {
              ...reversed.fact,
              validFrom: toTimestamp(new Date('2026-03-01T00:00:00.000Z')),
              validTo: toTimestamp(new Date('2026-02-01T00:00:00.000Z')),
            },
          },
        ],
      }),
    );

    expect(!result.ok && result.error.code).toBe('invalid_input');
    expect(await countEntitiesNamedShopApi(deps.store)).toBe(0);
  });

  it('returns invalid_input when there is nothing to record', async () => {
    const result = await recordFacts(createTestDeps(), input({}));

    expect(!result.ok && result.error.code).toBe('invalid_input');
  });

  it('records nothing when the embedder fails', async () => {
    const deps = { ...createTestDeps(), embedder: failingEmbedder };

    const result = await recordFacts(deps, input({ drafts: [draft('depends_on', 'redis', [shopApi])] }));

    expect(!result.ok && result.error.code).toBe('embedding_failed');
    expect(await countEntitiesNamedShopApi(deps.store)).toBe(0);
  });

  it('records nothing when the embedder returns fewer vectors than statements', async () => {
    const shortEmbedder: Embedder = {
      model: 'short-embedder',
      dimensions: 16,
      embed: async (texts) => ok(texts.slice(1).map(() => new Float32Array(16).fill(0.25))),
    };
    const deps = { ...createTestDeps(), embedder: shortEmbedder };

    const result = await recordFacts(
      deps,
      input({ drafts: [draft('depends_on', 'redis', [shopApi]), draft('depends_on', 'kafka')] }),
    );

    expect(!result.ok && result.error.code).toBe('embedding_failed');
    expect(await countEntitiesNamedShopApi(deps.store)).toBe(0);
  });

  it("marks a fact single-valued from the domain's predicate", async () => {
    const deps = createTestDeps();
    await recordFirst(deps, 'depends_on', 'redis');

    const secondMulti = await recordFacts(deps, input({ drafts: [draft('depends_on', 'postgres')] }));
    const firstSingle = await recordFacts(deps, input({ drafts: [draft('uses_database_version', '16')] }));
    const secondSingle = await recordFacts(deps, input({ drafts: [draft('uses_database_version', '17')] }));

    expect(secondMulti.ok).toBe(true);
    expect(firstSingle.ok).toBe(true);
    expect(!secondSingle.ok && secondSingle.error.code).toBe('conflict');
    expect(await listAllFacts(deps.store)).toHaveLength(3);
  });

  it('creates an entity once when two drafts introduce it', async () => {
    const deps = createTestDeps();

    const recorded = await recordFacts(
      deps,
      input({
        drafts: [draft('depends_on', 'redis', [shopApi]), draft('depends_on', 'postgres', [shopApi])],
      }),
    );

    expect(recorded.ok && recorded.value.factIds).toHaveLength(2);
    expect(await countEntitiesNamedShopApi(deps.store)).toBe(1);
  });

  it('records a source that only restates without embedding anything', async () => {
    const deps = createTestDeps();
    const factId = await recordFirst(deps, 'uses_database_version', '16');
    const embedderThatMustNotRun: Embedder = {
      model: 'fake-embedder',
      dimensions: 16,
      embed: () => {
        throw new Error('The embedder was called.');
      },
    };

    const restated = await recordFacts(
      { ...deps, embedder: embedderThatMustNotRun },
      input({ reasonCode: 'restated', source: note(null), restatedFactIds: [factId] }),
    );

    if (!restated.ok) throw new Error(restated.error.message);
    const source = await deps.store.getSource({ namespace: NAMESPACE, sourceId: restated.value.sourceId });
    expect(source.ok && source.value?.contentHash).toBeNull();
  });

  it("returns the store's error for a restated fact that does not exist", async () => {
    const deps = createTestDeps();

    const result = await recordFacts(deps, input({ restatedFactIds: ['no-such-fact'] }));

    expect(!result.ok && result.error.code).toBe('not_found');
  });
});

describe('buildRecordFactsChangeSet', () => {
  it('orders the changes: the source, the new entities, the facts, the restated facts', () => {
    const now = toTimestamp(new Date('2026-01-10T00:00:00.000Z'));
    const entity = { ...shopApi, namespace: NAMESPACE, createdAt: now };
    const source = {
      ...note(null),
      id: 'source-1',
      namespace: NAMESPACE,
      contentHash: null,
      purgedAt: null,
      createdAt: now,
    };
    const fact = {
      ...draft('uses_database_version', '16').fact,
      id: 'fact-1',
      namespace: NAMESPACE,
      createdAt: now,
      invalidatedAt: null,
      purgedAt: null,
      supersededByFactId: null,
    };

    const changeSet = buildRecordFactsChangeSet({
      context,
      operationId: 'operation-1',
      occurredAt: now,
      source,
      prepared: {
        newEntities: [entity],
        facts: [{ fact, vector: new Float32Array(16), singleValued: true }],
      },
      restatedFactIds: ['fact-0'],
    });

    expect(changeSet.changes.map((change) => change.kind)).toEqual([
      'record_source',
      'create_entity',
      'record_fact',
      'attach_source',
    ]);
    expect(changeSet).toMatchObject({
      namespace: NAMESPACE,
      operationId: 'operation-1',
      operation: 'remember',
      trigger: 'agent',
      reasonCode: 'stated',
      explainedBySourceId: 'source-1',
      occurredAt: now,
    });
    expect(changeSet.changes[2]).toMatchObject({ sourceIds: ['source-1'], singleValued: true });
  });
});
