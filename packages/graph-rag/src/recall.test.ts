import {
  createTestDeps,
  endFact,
  err,
  type FactDraft,
  type FactId,
  type FactObject,
  invalidateFact,
  type MemoryStore,
  type NewEntity,
  type NewSource,
  type OperationDeps,
  parseDateInput,
  purgeContent,
  recordFacts,
  type Timestamp,
} from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { type RecallInput, recall, recallWithSettings, searchFactsByGraph } from './recall.ts';

const NAMESPACE = 'shop-api';
const SHOP: NewEntity = { id: 'e-shop', type: 'repository', name: 'shop-api' };
const REDIS: NewEntity = { id: 'e-redis', type: 'dependency', name: 'redis' };
const BILLING: NewEntity = { id: 'e-billing', type: 'repository', name: 'billing-worker' };

/** The moment every recall in these tests is made, unless a test says otherwise. */
const NOW = '2026-04-01';
const QUESTION = 'What does the shop API use?';

/** Parses a calendar date or a full timestamp, for test data. */
function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

/** A note from an agent, observed on the given date. */
function note(content: string, observedAt: Timestamp): NewSource {
  return { kind: 'agent_note', locator: null, version: null, content, observedAt };
}

/** A fact draft. `object` is a literal value unless an entity is given. */
function draft(options: {
  readonly subject: NewEntity;
  readonly predicate: 'uses_database_version' | 'depends_on';
  readonly object: string | NewEntity;
  readonly statement: string;
  readonly validFrom: string | null;
  readonly validTo?: string;
  readonly newEntities?: readonly NewEntity[];
}): FactDraft {
  const object: FactObject =
    typeof options.object === 'string'
      ? { kind: 'value', value: options.object }
      : { kind: 'entity', entityId: options.object.id };
  return {
    fact: {
      subjectEntityId: options.subject.id,
      predicate: options.predicate,
      object,
      statement: options.statement,
      confidence: 0.9,
      validFrom: options.validFrom === null ? null : at(options.validFrom),
      validTo: options.validTo === undefined ? null : at(options.validTo),
    },
    newEntities: options.newEntities ?? [],
  };
}

/** Memory shared by the steps of one test, each step with its own fixed clock. */
function createMemory() {
  const first = createTestDeps({ now: '2026-01-10' });
  return {
    store: first.store,
    /** The dependencies of a step that happens on the given date. */
    on(date: string): OperationDeps {
      return createTestDeps({ now: date, store: first.store, newId: first.newId });
    },
  };
}

/** Records one fact from one note, in the given namespace, and returns its identifier. */
async function recordOne(deps: OperationDeps, fact: FactDraft, namespace = NAMESPACE): Promise<FactId> {
  const recorded = await recordFacts(deps, {
    namespace,
    trigger: 'agent',
    reasonCode: 'stated',
    source: note(fact.fact.statement, deps.now()),
    drafts: [fact],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const [factId] = recorded.value.factIds;
  if (factId === undefined) throw new Error('No fact was recorded.');
  return factId;
}

/**
 * The shop API's memory, by date:
 * - 2026-01-10: it depends on redis (no start known), on jest, and on moment from 2026-01-01
 *   until 2026-03-15; it runs on Postgres 15 since 2025-01-01.
 * - 2026-02-01: jest was wrong; it depends on vitest (no start known).
 * - 2026-03-05: Postgres 15 ended on 2026-03-01, and Postgres 16 began then.
 */
async function recordShopTimeline() {
  const memory = createMemory();
  const january = memory.on('2026-01-10');
  const redis = await recordOne(
    january,
    draft({
      subject: SHOP,
      predicate: 'depends_on',
      object: REDIS,
      statement: 'The shop API depends on redis.',
      validFrom: null,
      newEntities: [SHOP, REDIS],
    }),
  );
  const jest = await recordOne(
    january,
    draft({
      subject: SHOP,
      predicate: 'depends_on',
      object: 'jest',
      statement: 'The shop API depends on jest.',
      validFrom: null,
    }),
  );
  const moment = await recordOne(
    january,
    draft({
      subject: SHOP,
      predicate: 'depends_on',
      object: 'moment',
      statement: 'The shop API depends on moment until mid March.',
      validFrom: '2026-01-01',
      validTo: '2026-03-15',
    }),
  );
  const postgres15 = await recordOne(
    january,
    draft({
      subject: SHOP,
      predicate: 'uses_database_version',
      object: 'postgres 15',
      statement: 'The shop API uses Postgres 15.',
      validFrom: '2025-01-01',
    }),
  );

  const corrected = await invalidateFact(memory.on('2026-02-01'), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'reported_wrong',
    factId: jest,
    source: note('That was wrong: the shop API uses vitest, not jest.', at('2026-02-01')),
    replacement: draft({
      subject: SHOP,
      predicate: 'depends_on',
      object: 'vitest',
      statement: 'The shop API depends on vitest.',
      validFrom: null,
    }),
  });
  if (!corrected.ok || corrected.value.replacementFactId === null) throw new Error('The correction failed.');

  const ended = await endFact(memory.on('2026-03-05'), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'reported_ended',
    factId: postgres15,
    validTo: at('2026-03-01'),
    source: note('The shop API moved to Postgres 16 on 1 March.', at('2026-03-05')),
    successor: draft({
      subject: SHOP,
      predicate: 'uses_database_version',
      object: 'postgres 16',
      statement: 'The shop API uses Postgres 16.',
      validFrom: '2026-03-01',
    }),
  });
  if (!ended.ok || ended.value.successorFactId === null) throw new Error('The succession failed.');

  return {
    memory,
    facts: {
      redis,
      jest,
      vitest: corrected.value.replacementFactId,
      moment,
      postgres15,
      postgres15Ended: ended.value.endedFactId,
      postgres16: ended.value.successorFactId,
    },
  };
}

/** Asks a question on the given date and returns the identifiers of the facts, in any order. */
async function recallFactIds(
  deps: OperationDeps,
  dates: { readonly validAt: string | null; readonly knownAt: string | null },
  question = QUESTION,
): Promise<FactId[]> {
  const recalled = await recall(deps, {
    namespace: NAMESPACE,
    question,
    validAt: dates.validAt === null ? null : at(dates.validAt),
    knownAt: dates.knownAt === null ? null : at(dates.knownAt),
    limit: 50,
  });
  if (!recalled.ok) throw new Error(recalled.error.message);
  return recalled.value.facts.map((found) => found.fact.id).sort();
}

/** Every fact of the namespace with its sources, and every audit entry and explaining source of each. */
async function snapshotStore(store: MemoryStore): Promise<unknown> {
  const facts = await store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time: 'all',
    limit: 1000,
  });
  if (!facts.ok) throw new Error(facts.error.message);
  const audit = [];
  for (const { fact } of facts.value) {
    const entries = await store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'fact',
      targetId: fact.id,
    });
    if (!entries.ok) throw new Error(entries.error.message);
    for (const entry of entries.value) {
      const source =
        entry.sourceId === null
          ? null
          : await store.getSource({ namespace: NAMESPACE, sourceId: entry.sourceId });
      audit.push({ entry, source });
    }
  }
  return { facts: facts.value, audit };
}

describe('recall', () => {
  describe('time', () => {
    it('returns only current facts when no date is given', async () => {
      const { memory, facts } = await recordShopTimeline();

      // As-of date: now (2026-04-01). Known-at date: now.
      const found = await recallFactIds(memory.on(NOW), { validAt: null, knownAt: null });

      expect(found).toEqual([facts.redis, facts.vitest, facts.postgres16].sort());
    });

    it('does not return an invalidated fact when no date is given', async () => {
      const { memory, facts } = await recordShopTimeline();

      // As-of date: now (2026-04-01). Known-at date: now.
      const found = await recallFactIds(memory.on(NOW), { validAt: null, knownAt: null });

      expect(found).not.toContain(facts.jest);
      expect(found).not.toContain(facts.postgres15);
    });

    it('does not return an ended fact when no date is given', async () => {
      const { memory, facts } = await recordShopTimeline();

      // As-of date: now (2026-04-01). Known-at date: now.
      const found = await recallFactIds(memory.on(NOW), { validAt: null, knownAt: null });

      expect(found).not.toContain(facts.postgres15Ended);
      expect(found).not.toContain(facts.moment);
    });

    it('returns the fact that was true on the as-of date', async () => {
      const { memory, facts } = await recordShopTimeline();

      // As-of date: 2025-06-01. Known-at date: now (2026-04-01).
      const found = await recallFactIds(memory.on(NOW), { validAt: '2025-06-01', knownAt: null });

      expect(found).toContain(facts.postgres15Ended);
      expect(found).not.toContain(facts.postgres16);
      expect(found).not.toContain(facts.moment);
    });

    it('returns a fact with an unknown start for any earlier as-of date', async () => {
      const { memory, facts } = await recordShopTimeline();

      // As-of date: 1990-01-01. Known-at date: now (2026-04-01).
      const found = await recallFactIds(memory.on(NOW), { validAt: '1990-01-01', knownAt: null });

      expect(found).toEqual([facts.redis, facts.vitest].sort());
    });

    it('does not return a fact at the instant its valid time ends', async () => {
      const { memory, facts } = await recordShopTimeline();

      // As-of date: 2026-03-01T00:00:00.000Z, the end of Postgres 15. Known-at date: now (2026-04-01).
      const found = await recallFactIds(memory.on(NOW), {
        validAt: '2026-03-01T00:00:00.000Z',
        knownAt: null,
      });

      expect(found).not.toContain(facts.postgres15Ended);
      expect(found).toContain(facts.postgres16);
    });

    it('returns what was believed on the known-at date, including a fact invalidated since', async () => {
      const { memory, facts } = await recordShopTimeline();

      // As-of date: 2026-01-20, which the known-at date gives. Known-at date: 2026-01-20.
      const found = await recallFactIds(memory.on(NOW), { validAt: null, knownAt: '2026-01-20' });

      expect(found).toEqual([facts.redis, facts.jest, facts.moment, facts.postgres15].sort());
    });

    it('uses the known-at date as the as-of date when only the known-at date is given', async () => {
      const { memory, facts } = await recordShopTimeline();

      // As-of date: absent, so 2026-03-10. Known-at date: 2026-03-10. With the as-of date at
      // now (2026-04-01) instead, moment, which ended on 2026-03-15, would be left out.
      const found = await recallFactIds(memory.on(NOW), { validAt: null, knownAt: '2026-03-10' });

      expect(found).toContain(facts.moment);
      expect(found).toContain(facts.postgres16);
    });

    it('answers what was believed on one date about another date', async () => {
      const { memory, facts } = await recordShopTimeline();

      // As-of date: 2025-06-01. Known-at date: 2026-02-15, after the correction and before
      // Postgres 15 was ended.
      const found = await recallFactIds(memory.on(NOW), { validAt: '2025-06-01', knownAt: '2026-02-15' });

      expect(found).toEqual([facts.redis, facts.vitest, facts.postgres15].sort());
    });
  });

  it('returns no more facts than the limit', async () => {
    const { memory } = await recordShopTimeline();

    // As-of date: now (2026-04-01). Known-at date: now.
    const recalled = await recall(memory.on(NOW), {
      namespace: NAMESPACE,
      question: QUESTION,
      validAt: null,
      knownAt: null,
      limit: 2,
    });

    expect(recalled.ok).toBe(true);
    if (!recalled.ok) return;
    expect(recalled.value.facts).toHaveLength(2);
  });

  it('returns an empty list when nothing matches', async () => {
    const { memory } = await recordShopTimeline();

    // As-of date: now (2026-04-01). Known-at date: 2025-12-01, before anything was recorded.
    const found = await recallFactIds(memory.on(NOW), { validAt: NOW, knownAt: '2025-12-01' });

    expect(found).toEqual([]);
  });

  it('returns each fact with its sources and a score', async () => {
    const { memory, facts } = await recordShopTimeline();

    // As-of date: now (2026-04-01). Known-at date: now.
    const recalled = await recall(memory.on(NOW), {
      namespace: NAMESPACE,
      question: 'Which version of Postgres does the shop API use?',
      validAt: null,
      knownAt: null,
      limit: 10,
    });

    expect(recalled.ok).toBe(true);
    if (!recalled.ok) return;
    const postgres16 = recalled.value.facts.find((found) => found.fact.id === facts.postgres16);
    expect(postgres16?.subject.name).toBe('shop-api');
    expect(postgres16?.sources.map((source) => source.content)).toEqual([
      'The shop API moved to Postgres 16 on 1 March.',
    ]);
    for (const found of recalled.value.facts) {
      expect(found.sources.length).toBeGreaterThan(0);
      expect(found.score).toBeGreaterThan(0);
    }
  });

  it('returns a fact that only the graph lane finds', async () => {
    const memory = createMemory();
    const january = memory.on('2026-01-10');
    const shopUsesRedis = await recordOne(
      january,
      draft({
        subject: SHOP,
        predicate: 'depends_on',
        object: REDIS,
        statement: 'The shop API keeps its sessions in redis.',
        validFrom: null,
        newEntities: [SHOP, REDIS],
      }),
    );
    const redisNeedsJemalloc = await recordOne(
      january,
      draft({
        subject: REDIS,
        predicate: 'depends_on',
        object: 'jemalloc',
        statement: 'Redis is built against jemalloc.',
        validFrom: null,
      }),
    );
    const billingUsesKafka = await recordOne(
      january,
      draft({
        subject: BILLING,
        predicate: 'depends_on',
        object: 'kafka',
        statement: 'The billing worker reads its events from kafka.',
        validFrom: null,
        newEntities: [BILLING],
      }),
    );
    // As-of date: now (2026-04-01). Known-at date: now. A lane list length of 1 lets the
    // vector and keyword lanes return only the fact that repeats the question.
    const input: RecallInput = {
      namespace: NAMESPACE,
      question: 'The shop API keeps its sessions in redis.',
      validAt: null,
      knownAt: null,
      limit: 10,
    };
    const deps = memory.on(NOW);

    const withGraph = await recallWithSettings(deps, input, {
      laneWeights: { vector: 1, keyword: 1, graph: 1 },
      laneListLength: 1,
      fusionConstant: 60,
    });
    const withoutGraph = await recallWithSettings(deps, input, {
      laneWeights: { vector: 1, keyword: 1, graph: 0 },
      laneListLength: 1,
      fusionConstant: 60,
    });

    if (!withGraph.ok || !withoutGraph.ok) throw new Error('Recall failed.');
    expect(withGraph.value.facts.map((found) => found.fact.id)).toEqual([shopUsesRedis, redisNeedsJemalloc]);
    expect(withoutGraph.value.facts.map((found) => found.fact.id)).toEqual([shopUsesRedis]);
    expect(withGraph.value.facts.map((found) => found.fact.id)).not.toContain(billingUsesKafka);
  });

  it('ranks the graph lane by entities touched, then by the most recently recorded', async () => {
    const memory = createMemory();
    const shopUsesRedis = await recordOne(
      memory.on('2026-01-10'),
      draft({
        subject: SHOP,
        predicate: 'depends_on',
        object: REDIS,
        statement: 'The shop API keeps its sessions in redis.',
        validFrom: null,
        newEntities: [SHOP, REDIS],
      }),
    );
    const shopUsesVitest = await recordOne(
      memory.on('2026-01-11'),
      draft({
        subject: SHOP,
        predicate: 'depends_on',
        object: 'vitest',
        statement: 'The shop API is tested with vitest.',
        validFrom: null,
      }),
    );
    const redisNeedsJemalloc = await recordOne(
      memory.on('2026-01-12'),
      draft({
        subject: REDIS,
        predicate: 'depends_on',
        object: 'jemalloc',
        statement: 'Redis is built against jemalloc.',
        validFrom: null,
      }),
    );
    const found = await memory.store.getFact({ namespace: NAMESPACE, factId: shopUsesRedis });
    if (!found.ok || found.value === null) throw new Error('The fact is missing.');

    // As-of date: now (2026-04-01). Known-at date: now.
    const ranked = await searchFactsByGraph(
      { store: memory.store },
      { namespace: NAMESPACE, time: { validAt: at(NOW), knownAt: at(NOW) }, found: [found.value] },
    );

    expect(ranked.ok).toBe(true);
    if (!ranked.ok) return;
    expect(ranked.value.map((fact) => fact.fact.id)).toEqual([
      shopUsesRedis,
      redisNeedsJemalloc,
      shopUsesVitest,
    ]);
  });

  it('leaves a purged fact out of the graph lane, even for a known-at date before the purge', async () => {
    const memory = createMemory();
    const shopUsesRedis = await recordOne(
      memory.on('2026-01-10'),
      draft({
        subject: SHOP,
        predicate: 'depends_on',
        object: REDIS,
        statement: 'The shop API keeps its sessions in redis.',
        validFrom: null,
        newEntities: [SHOP, REDIS],
      }),
    );
    const shopUsesVitest = await recordOne(
      memory.on('2026-01-11'),
      draft({
        subject: SHOP,
        predicate: 'depends_on',
        object: 'vitest',
        statement: 'The shop API is tested with vitest.',
        validFrom: null,
      }),
    );
    const vitest = await memory.store.getFact({ namespace: NAMESPACE, factId: shopUsesVitest });
    const sourceId = vitest.ok ? vitest.value?.sources[0]?.id : undefined;
    if (sourceId === undefined) throw new Error('The source is missing.');
    const purged = await purgeContent(memory.on('2026-02-01'), {
      namespace: NAMESPACE,
      trigger: 'person',
      reasonCode: 'secret_stored',
      sourceId,
    });
    if (!purged.ok) throw new Error(purged.error.message);
    const found = await memory.store.getFact({ namespace: NAMESPACE, factId: shopUsesRedis });
    if (!found.ok || found.value === null) throw new Error('The fact is missing.');

    // As-of date: now (2026-04-01). Known-at date: 2026-01-20, when the purged fact was still believed.
    const ranked = await searchFactsByGraph(
      { store: memory.store },
      { namespace: NAMESPACE, time: { validAt: at(NOW), knownAt: at('2026-01-20') }, found: [found.value] },
    );

    expect(ranked.ok && ranked.value.map((fact) => fact.fact.id)).toEqual([shopUsesRedis]);
  });

  it('asks each lane for as many facts as the limit when the limit is larger than 50', async () => {
    const memory = createMemory();
    // Sixty facts about sixty repositories, so that no fact reaches another through the graph lane.
    const repositories = Array.from(
      { length: 60 },
      (_, index): NewEntity => ({
        id: `e-repo-${index}`,
        type: 'repository',
        name: `service-${index}`,
      }),
    );
    const recorded = await recordFacts(memory.on('2026-01-10'), {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'stated',
      source: note('An inventory of the services and their caches.', at('2026-01-10')),
      drafts: repositories.map((repository) =>
        draft({
          subject: repository,
          predicate: 'depends_on',
          object: 'redis',
          statement: `The ${repository.name} service depends on redis.`,
          validFrom: null,
          newEntities: [repository],
        }),
      ),
      restatedFactIds: [],
    });
    if (!recorded.ok) throw new Error(recorded.error.message);

    // As-of date: now (2026-04-01). Known-at date: now.
    const recalled = await recall(memory.on(NOW), {
      namespace: NAMESPACE,
      // No statement holds these words, so the keyword lane finds nothing and the vector lane
      // alone decides how many facts reach the graph lane.
      question: 'Which caches?',
      validAt: null,
      knownAt: null,
      limit: 55,
    });

    expect(recalled.ok).toBe(true);
    if (!recalled.ok) return;
    expect(recalled.value.facts).toHaveLength(55);
  });

  it('does not return a fact from another namespace', async () => {
    const { memory, facts } = await recordShopTimeline();
    const elsewhere = await recordOne(
      memory.on('2026-01-12'),
      draft({
        subject: BILLING,
        predicate: 'depends_on',
        object: 'redis',
        statement: 'The shop API depends on redis.',
        validFrom: null,
        newEntities: [BILLING],
      }),
      'billing-worker',
    );

    // As-of date: now (2026-04-01). Known-at date: now.
    const found = await recallFactIds(
      memory.on(NOW),
      { validAt: null, knownAt: null },
      'The shop API depends on redis.',
    );

    expect(found).toContain(facts.redis);
    expect(found).not.toContain(elsewhere);
  });

  it('returns invalid_input for an empty question', async () => {
    const { memory } = await recordShopTimeline();

    const recalled = await recall(memory.on(NOW), {
      namespace: NAMESPACE,
      question: '  ',
      validAt: null,
      knownAt: null,
      limit: 10,
    });

    expect(recalled.ok).toBe(false);
    if (recalled.ok) return;
    expect(recalled.error.code).toBe('invalid_input');
  });

  it('returns invalid_input for a limit below 1', async () => {
    const { memory } = await recordShopTimeline();

    const recalled = await recall(memory.on(NOW), {
      namespace: NAMESPACE,
      question: QUESTION,
      validAt: null,
      knownAt: null,
      limit: 0,
    });

    expect(recalled.ok).toBe(false);
    if (recalled.ok) return;
    expect(recalled.error.code).toBe('invalid_input');
  });

  it('returns embedding_failed when the question cannot be embedded', async () => {
    const { memory } = await recordShopTimeline();
    const deps = memory.on(NOW);
    const failingEmbedder = {
      ...deps.embedder,
      embed: () => Promise.resolve(err('embedding_failed', 'The model could not be loaded.')),
    };

    const recalled = await recall(
      { ...deps, embedder: failingEmbedder },
      { namespace: NAMESPACE, question: QUESTION, validAt: null, knownAt: null, limit: 10 },
    );

    expect(recalled.ok).toBe(false);
    if (recalled.ok) return;
    expect(recalled.error.code).toBe('embedding_failed');
  });

  it('returns a storage failure as it is', async () => {
    const { memory } = await recordShopTimeline();
    const failing = () => Promise.resolve(err('storage_failed', 'The disk is full.'));
    const failingStores: MemoryStore[] = [
      { ...memory.store, searchFactsByVector: failing },
      { ...memory.store, searchFactsByKeyword: failing },
      { ...memory.store, listFacts: failing },
    ];

    for (const failingStore of failingStores) {
      // As-of date: now (2026-04-01). Known-at date: now.
      const recalled = await recall(
        { ...memory.on(NOW), store: failingStore },
        { namespace: NAMESPACE, question: QUESTION, validAt: null, knownAt: null, limit: 10 },
      );
      expect(recalled.ok).toBe(false);
      if (recalled.ok) return;
      expect(recalled.error.code).toBe('storage_failed');
    }
  });

  it('writes nothing', async () => {
    const { memory } = await recordShopTimeline();
    const before = await snapshotStore(memory.store);

    // As-of date: 2025-06-01. Known-at date: now (2026-04-01).
    await recallFactIds(memory.on(NOW), { validAt: '2025-06-01', knownAt: null });

    expect(await snapshotStore(memory.store)).toEqual(before);
  });
});
