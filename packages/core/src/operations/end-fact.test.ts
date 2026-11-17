import { describe, expect, it } from 'vitest';
import { createTestDeps, TEST_DOMAIN } from '../create-test-deps.ts';
import type { Domain } from '../domain.ts';
import type { Embedder } from '../embedder.ts';
import type { FactWithSources, TimeFilter } from '../fact.ts';
import { createInMemoryStore } from '../in-memory-store.ts';
import type { MemoryStore } from '../memory-store.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { type Timestamp, toTimestamp } from '../timestamp.ts';
import { buildEndFactChangeSet, endFact } from './end-fact.ts';
import type { FactDraft, NewEntity, NewSource } from './operation-inputs.ts';
import { recordFacts } from './record-facts.ts';

const NAMESPACE = 'shop-api';
const stated = { namespace: NAMESPACE, trigger: 'agent', reasonCode: 'stated' } as const;
const reportedEnded = { namespace: NAMESPACE, trigger: 'agent', reasonCode: 'reported_ended' } as const;
const shopApi: NewEntity = { id: 'entity-shop-api', type: 'repository', name: 'shop-api' };

const DOMAIN: Domain = {
  ...TEST_DOMAIN,
  predicates: [
    ...TEST_DOMAIN.predicates,
    { name: 'runs_ci_on', description: 'What continuous integration runs on.', cardinality: 'single' },
  ],
};

// The timeline of spikes/fact-schema: PostgreSQL 14 since June 2025, recorded in January;
// the upgrade to 16 happened on 15 March and was learned on 2 April.
const RECORDED_ON = '2026-01-10';
const LEARNED_ON = '2026-04-02';
const TRUE_SINCE = day('2025-06-01');
const UPGRADED_ON = day('2026-03-15');
const NOW = day('2026-11-15');

function day(date: string): Timestamp {
  return toTimestamp(new Date(`${date}T00:00:00.000Z`));
}

function note(content: string): NewSource {
  return { kind: 'note', locator: null, version: null, content, observedAt: day('2026-01-01') };
}

function draft(predicate: string, value: string, validFrom: Timestamp | null = null): FactDraft {
  return {
    fact: {
      subjectEntityId: shopApi.id,
      predicate,
      object: { kind: 'value', value },
      statement: `shop-api ${predicate} ${value}`,
      confidence: 1,
      validFrom,
      validTo: null,
    },
    newEntities: [],
  };
}

/** One memory with a clock that each step of a test sets, and identifiers that never repeat. */
function createMemory() {
  const store = createInMemoryStore();
  let count = 0;
  const newId = (): string => {
    count += 1;
    return `id-${count}`;
  };
  return {
    store,
    on: (date: string): OperationDeps => createTestDeps({ now: date, domain: DOMAIN, store, newId }),
  };
}

async function record(deps: OperationDeps, given: FactDraft, isFirst = true): Promise<string> {
  const recorded = await recordFacts(deps, {
    ...stated,
    source: note('We run PostgreSQL 14.'),
    drafts: [{ ...given, newEntities: isFirst ? [shopApi] : [] }],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const factId = recorded.value.factIds[0];
  if (factId === undefined) throw new Error('No fact was recorded.');
  return factId;
}

async function list(
  store: MemoryStore,
  time: TimeFilter | 'live' | 'all',
  supersededByFactId: string | null = null,
): Promise<readonly FactWithSources[]> {
  const listed = await store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: shopApi.id,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId,
    time,
    limit: 100,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value;
}

async function listIds(store: MemoryStore, time: TimeFilter | 'live' | 'all'): Promise<string[]> {
  return (await list(store, time)).map(({ fact }) => fact.id);
}

/** Records PostgreSQL 14 in January and, in April, its end on 15 March with PostgreSQL 16 after it. */
async function upgradeDatabase(
  successor: FactDraft | null = draft('uses_database_version', 'PostgreSQL 16'),
) {
  const memory = createMemory();
  const originalId = await record(
    memory.on(RECORDED_ON),
    draft('uses_database_version', 'PostgreSQL 14', TRUE_SINCE),
  );
  const ended = await endFact(memory.on(LEARNED_ON), {
    ...reportedEnded,
    factId: originalId,
    validTo: UPGRADED_ON,
    source: note('We upgraded to PostgreSQL 16 on 15 March.'),
    successor,
  });
  if (!ended.ok) throw new Error(ended.error.message);
  return { store: memory.store, originalId, ...ended.value };
}

describe('endFact', () => {
  it('ends PostgreSQL 14 and records PostgreSQL 16 as its successor', async () => {
    const { store, originalId, endedFactId, successorFactId } = await upgradeDatabase();

    // As of now, known now.
    expect(await listIds(store, { validAt: NOW, knownAt: NOW })).toEqual([successorFactId]);
    // As of 2026-02-01, known now: the ended fact.
    expect(await listIds(store, { validAt: day('2026-02-01'), knownAt: NOW })).toEqual([endedFactId]);
    // As of the day of the upgrade, known now: the valid period is half-open, so only the successor.
    expect(await listIds(store, { validAt: UPGRADED_ON, knownAt: NOW })).toEqual([successorFactId]);
    // As of 2026-04-01, known at 2026-04-01: the upgrade was not yet known, so the original.
    expect(await listIds(store, { validAt: day('2026-04-01'), knownAt: day('2026-04-01') })).toEqual([
      originalId,
    ]);
  });

  it("gives the ended copy the original's sources and the source that reported the end", async () => {
    const { store, originalId, endedFactId } = await upgradeDatabase();

    const original = await store.getFact({ namespace: NAMESPACE, factId: originalId });
    const copy = await store.getFact({ namespace: NAMESPACE, factId: endedFactId });
    if (!original.ok || !copy.ok || original.value === null || copy.value === null)
      throw new Error('Not found.');
    expect(copy.value.sources.map((source) => source.content).sort()).toEqual([
      'We run PostgreSQL 14.',
      'We upgraded to PostgreSQL 16 on 15 March.',
    ]);
    expect(copy.value.fact).toMatchObject({
      statement: original.value.fact.statement,
      object: original.value.fact.object,
      validFrom: TRUE_SINCE,
      validTo: UPGRADED_ON,
      createdAt: day(LEARNED_ON),
    });
  });

  it('links the original to its ended copy', async () => {
    const { store, originalId, endedFactId } = await upgradeDatabase();

    const superseded = await list(store, 'all', endedFactId);

    expect(superseded.map(({ fact }) => fact.id)).toEqual([originalId]);
    expect(superseded[0]?.fact.invalidatedAt).toBe(day(LEARNED_ON));
  });

  it('starts a successor at the end of the fact it follows when no start is given', async () => {
    const { store, successorFactId } = await upgradeDatabase();

    const successor = await store.getFact({ namespace: NAMESPACE, factId: successorFactId ?? '' });

    expect(successor.ok && successor.value?.fact.validFrom).toBe(UPGRADED_ON);
  });

  it("keeps the successor's own start when one is given", async () => {
    const laterStart = day('2026-03-20');
    const { store, successorFactId } = await upgradeDatabase(
      draft('uses_database_version', 'PostgreSQL 16', laterStart),
    );

    const successor = await store.getFact({ namespace: NAMESPACE, factId: successorFactId ?? '' });

    expect(successor.ok && successor.value?.fact.validFrom).toBe(laterStart);
  });

  it('ends a fact with no successor as a revision', async () => {
    const { store, originalId, endedFactId, successorFactId } = await upgradeDatabase(null);

    expect(successorFactId).toBeNull();
    // As of now, known now: nothing. As of 2026-02-01, known now: the ended fact.
    expect(await listIds(store, { validAt: NOW, knownAt: NOW })).toEqual([]);
    expect(await listIds(store, { validAt: day('2026-02-01'), knownAt: NOW })).toEqual([endedFactId]);
    const entries = [];
    for (const targetId of [endedFactId, originalId]) {
      const listed = await store.listAuditEntries({ namespace: NAMESPACE, targetKind: 'fact', targetId });
      if (!listed.ok) throw new Error(listed.error.message);
      entries.push(...listed.value.filter((entry) => entry.operation !== 'remember'));
    }
    expect(entries.map((entry) => [entry.operation, entry.action])).toEqual([
      ['revision', 'fact.recorded'],
      ['revision', 'fact.invalidated'],
    ]);
    expect(new Set(entries.map((entry) => entry.operationId)).size).toBe(1);
  });

  it('returns invalid_input when the end is not after the start', async () => {
    const memory = createMemory();
    const factId = await record(
      memory.on(RECORDED_ON),
      draft('uses_database_version', 'PostgreSQL 14', TRUE_SINCE),
    );
    const input = { ...reportedEnded, factId, source: note('It ended.'), successor: null };

    const atStart = await endFact(memory.on(LEARNED_ON), { ...input, validTo: TRUE_SINCE });
    const beforeStart = await endFact(memory.on(LEARNED_ON), { ...input, validTo: day('2025-01-01') });

    expect(!atStart.ok && atStart.error.code).toBe('invalid_input');
    expect(!beforeStart.ok && beforeStart.error.code).toBe('invalid_input');
    expect(await listIds(memory.store, 'all')).toEqual([factId]);
  });

  it('ends a fact whose start is unknown at any moment', async () => {
    const memory = createMemory();
    const factId = await record(memory.on(RECORDED_ON), draft('uses_database_version', 'PostgreSQL 14'));

    const ended = await endFact(memory.on(LEARNED_ON), {
      ...reportedEnded,
      factId,
      validTo: day('2020-01-01'),
      source: note('It ended long ago.'),
      successor: null,
    });

    expect(ended.ok).toBe(true);
  });

  it('ends a fact with no successor without embedding anything', async () => {
    const memory = createMemory();
    const factId = await record(
      memory.on(RECORDED_ON),
      draft('uses_database_version', 'PostgreSQL 14', TRUE_SINCE),
    );
    const embedderThatMustNotRun: Embedder = {
      model: 'fake-embedder',
      dimensions: 16,
      embed: () => {
        throw new Error('The embedder was called.');
      },
    };

    const ended = await endFact(
      { ...memory.on(LEARNED_ON), embedder: embedderThatMustNotRun },
      { ...reportedEnded, factId, validTo: UPGRADED_ON, source: note('It ended.'), successor: null },
    );

    expect(ended.ok).toBe(true);
  });

  it('changes nothing when the successor conflicts with another live fact', async () => {
    const memory = createMemory();
    const deps = memory.on(RECORDED_ON);
    const factId = await record(deps, draft('uses_database_version', 'PostgreSQL 14', TRUE_SINCE));
    const otherId = await record(deps, draft('runs_ci_on', 'Node 22'), false);

    const result = await endFact(memory.on(LEARNED_ON), {
      ...reportedEnded,
      factId,
      validTo: UPGRADED_ON,
      source: note('We upgraded.'),
      successor: draft('runs_ci_on', 'Node 24'),
    });

    expect(!result.ok && result.error.code).toBe('conflict');
    expect((await listIds(memory.store, 'live')).sort()).toEqual([factId, otherId].sort());
    expect(await listIds(memory.store, 'all')).toHaveLength(2);
  });

  it('returns already_invalidated with the ended copy for a fact that was already ended', async () => {
    const { store, originalId, endedFactId } = await upgradeDatabase(null);

    const again = await endFact(createTestDeps({ now: '2026-04-03', domain: DOMAIN, store }), {
      ...reportedEnded,
      factId: originalId,
      validTo: UPGRADED_ON,
      source: note('It ended.'),
      successor: null,
    });

    expect(!again.ok && again.error.code).toBe('already_invalidated');
    expect(!again.ok && again.error.relatedFactIds).toEqual([endedFactId]);
  });

  it('returns not_found for a fact that does not exist', async () => {
    const result = await endFact(createTestDeps(), {
      ...reportedEnded,
      factId: 'no-such-fact',
      validTo: UPGRADED_ON,
      source: note('It ended.'),
      successor: null,
    });

    expect(!result.ok && result.error.code).toBe('not_found');
  });

  it('refuses a successor whose predicate the domain does not have, and changes nothing', async () => {
    const memory = createMemory();
    const factId = await record(
      memory.on(RECORDED_ON),
      draft('uses_database_version', 'PostgreSQL 14', TRUE_SINCE),
    );

    const result = await endFact(memory.on(LEARNED_ON), {
      ...reportedEnded,
      factId,
      validTo: UPGRADED_ON,
      source: note('We moved the queue to kafka.'),
      successor: draft('uses_message_queue', 'kafka'),
    });

    expect(!result.ok && result.error.code).toBe('invalid_input');
    expect(await listIds(memory.store, 'all')).toEqual([factId]);
  });

  it('returns conflict when a later end would overlap another live fact', async () => {
    // PostgreSQL 14 until 15 March, then PostgreSQL 16. Moving the end of 14 to June would
    // make the two overlap for a single-valued predicate.
    const memory = createMemory();
    const deps = memory.on(RECORDED_ON);
    const until = draft('uses_database_version', 'PostgreSQL 14', TRUE_SINCE);
    const postgres14 = await record(deps, { ...until, fact: { ...until.fact, validTo: UPGRADED_ON } });
    const postgres16 = await record(
      deps,
      draft('uses_database_version', 'PostgreSQL 16', UPGRADED_ON),
      false,
    );

    const result = await endFact(memory.on(LEARNED_ON), {
      ...reportedEnded,
      factId: postgres14,
      validTo: day('2026-06-01'),
      source: note('PostgreSQL 14 ran until June.'),
      successor: null,
    });

    expect(!result.ok && result.error.code).toBe('conflict');
    expect(!result.ok && result.error.relatedFactIds).toEqual([postgres16]);
    expect((await listIds(memory.store, 'live')).sort()).toEqual([postgres14, postgres16].sort());
  });

  it('ends a fact whose predicate the domain no longer has', async () => {
    const memory = createMemory();
    const factId = await record(memory.on(RECORDED_ON), draft('runs_ci_on', 'Node 22'));
    let count = 0;
    const withoutThePredicate = createTestDeps({
      now: LEARNED_ON,
      domain: TEST_DOMAIN,
      store: memory.store,
      newId: () => {
        count += 1;
        return `later-${count}`;
      },
    });

    const result = await endFact(withoutThePredicate, {
      ...reportedEnded,
      factId,
      validTo: UPGRADED_ON,
      source: note('We stopped running CI on Node 22.'),
      successor: null,
    });

    expect(result.ok).toBe(true);
    expect(await listIds(memory.store, 'live')).toEqual(result.ok ? [result.value.endedFactId] : []);
  });
});

describe('buildEndFactChangeSet', () => {
  const now = day(LEARNED_ON);
  const source = {
    ...note('We upgraded.'),
    id: 'source-2',
    namespace: NAMESPACE,
    contentHash: null,
    purgedAt: null,
    createdAt: now,
  };
  const row = {
    namespace: NAMESPACE,
    createdAt: now,
    invalidatedAt: null,
    supersededByFactId: null,
    purgedAt: null,
  };
  const endedCopy = {
    ...draft('uses_database_version', 'PostgreSQL 14', TRUE_SINCE).fact,
    ...row,
    id: 'pg14-ended',
    validTo: UPGRADED_ON,
  };
  const shared = {
    context: reportedEnded,
    operationId: 'operation-2',
    occurredAt: now,
    source,
    originalFactId: 'pg14',
    endedCopy,
    originalSourceIds: ['source-1'],
    isSingleValued: true,
  };

  it("copies the original's vector to the ended copy", () => {
    const changeSet = buildEndFactChangeSet({ ...shared, successor: null });

    expect(changeSet.operation).toBe('revision');
    expect(changeSet.changes).toEqual([
      { kind: 'record_source', source },
      {
        kind: 'record_fact',
        fact: endedCopy,
        sourceIds: ['source-1', 'source-2'],
        embedding: { copyFromFactId: 'pg14' },
        singleValued: true,
      },
      { kind: 'invalidate_fact', factId: 'pg14', supersededByFactId: 'pg14-ended' },
    ]);
  });

  it('orders a succession: the source, new entities, the ended copy, the invalidation, the successor', () => {
    const successorFact = {
      ...draft('uses_database_version', 'PostgreSQL 16', UPGRADED_ON).fact,
      ...row,
      id: 'pg16',
    };
    const entity = {
      id: 'entity-new',
      namespace: NAMESPACE,
      type: 'dependency',
      name: 'postgres',
      createdAt: now,
    };

    const changeSet = buildEndFactChangeSet({
      ...shared,
      successor: {
        newEntities: [entity],
        facts: [{ fact: successorFact, vector: new Float32Array(16), singleValued: true }],
      },
    });

    expect(changeSet).toMatchObject({
      operation: 'succession',
      explainedBySourceId: 'source-2',
      occurredAt: now,
    });
    expect(changeSet.changes.map((change) => change.kind)).toEqual([
      'record_source',
      'create_entity',
      'record_fact',
      'invalidate_fact',
      'record_fact',
    ]);
    expect(changeSet.changes[4]).toMatchObject({ fact: { id: 'pg16' }, sourceIds: ['source-2'] });
  });
});
