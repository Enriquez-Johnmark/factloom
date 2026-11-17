import {
  createTestDeps,
  endFact,
  err,
  type FactDraft,
  type FactId,
  type FactWithSources,
  invalidateFact,
  type MemoryStore,
  type NewSource,
  ok,
  type OperationDeps,
  parseDateInput,
  recordFacts,
  type Timestamp,
} from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { type FactHistoryEntry, getFactHistory } from './get-fact-history.ts';

const NAMESPACE = 'shop-api';
const SHOP = { id: 'e-shop', type: 'repository', name: 'shop-api' } as const;

/** Parses a calendar date or a full timestamp, for test data. */
function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

/** A note from an agent, observed on the given date. */
function note(content: string | null, observedOn: string): NewSource {
  return { kind: 'agent_note', locator: null, version: null, content, observedAt: at(observedOn) };
}

/** A fact about the shop repository with a literal value. The first one also creates the entity. */
function draft(options: {
  readonly predicate: 'uses_database_version' | 'depends_on';
  readonly value: string;
  readonly validFrom: string | null;
  readonly validTo?: string;
  readonly createsShop?: boolean;
}): FactDraft {
  return {
    fact: {
      subjectEntityId: SHOP.id,
      predicate: options.predicate,
      object: { kind: 'value', value: options.value },
      statement: `The shop API ${options.predicate.replaceAll('_', ' ')} ${options.value}.`,
      confidence: 0.9,
      validFrom: options.validFrom === null ? null : at(options.validFrom),
      validTo: options.validTo === undefined ? null : at(options.validTo),
    },
    newEntities: options.createsShop === true ? [SHOP] : [],
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

/** Records one fact from one note and returns its identifier. */
async function recordOne(deps: OperationDeps, content: string, fact: FactDraft): Promise<FactId> {
  const recorded = await recordFacts(deps, {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: note(content, deps.now()),
    drafts: [fact],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const [factId] = recorded.value.factIds;
  if (factId === undefined) throw new Error('No fact was recorded.');
  return factId;
}

/** Reads the history of a fact and fails the test on an error. */
async function historyOf(deps: OperationDeps, factId: FactId): Promise<readonly FactHistoryEntry[]> {
  const history = await getFactHistory(deps, { namespace: NAMESPACE, factId });
  if (!history.ok) throw new Error(history.error.message);
  return history.value.entries;
}

function factIdsOf(entries: readonly FactHistoryEntry[]): FactId[] {
  return entries.map((entry) => entry.fact.id);
}

/** Finds the entry of one fact in a history. */
function entryOf(entries: readonly FactHistoryEntry[], factId: FactId): FactHistoryEntry {
  const entry = entries.find((candidate) => candidate.fact.id === factId);
  if (entry === undefined) throw new Error(`The history has no entry for ${factId}.`);
  return entry;
}

/** A succession: Postgres 15 from 2025-01-01, ended on 2026-03-01 when Postgres 16 took its place. */
async function recordSuccession(memory: ReturnType<typeof createMemory>) {
  const original = await recordOne(
    memory.on('2026-01-10'),
    'The shop API runs on Postgres 15 since January 2025.',
    draft({
      predicate: 'uses_database_version',
      value: 'postgres 15',
      validFrom: '2025-01-01',
      createsShop: true,
    }),
  );
  const ended = await endFact(memory.on('2026-03-05'), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'reported_ended',
    factId: original,
    validTo: at('2026-03-01'),
    source: note('We upgraded the shop API to Postgres 16 on 1 March.', '2026-03-05'),
    successor: draft({ predicate: 'uses_database_version', value: 'postgres 16', validFrom: '2026-03-01' }),
  });
  if (!ended.ok) throw new Error(ended.error.message);
  const { endedFactId, successorFactId } = ended.value;
  if (successorFactId === null) throw new Error('No successor was recorded.');
  return { original, endedCopy: endedFactId, successor: successorFactId };
}

/** A correction of a multi-valued fact: the shop API was said to use jest, but it uses vitest. */
async function recordCorrection(memory: ReturnType<typeof createMemory>) {
  const wrong = await recordOne(
    memory.on('2026-01-10'),
    'The shop API depends on jest.',
    draft({ predicate: 'depends_on', value: 'jest', validFrom: null, createsShop: true }),
  );
  const corrected = await invalidateFact(memory.on('2026-02-01'), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'reported_wrong',
    factId: wrong,
    source: note('That was wrong: the shop API has always used vitest, never jest.', '2026-02-01'),
    replacement: draft({ predicate: 'depends_on', value: 'vitest', validFrom: null }),
  });
  if (!corrected.ok) throw new Error(corrected.error.message);
  const { replacementFactId } = corrected.value;
  if (replacementFactId === null) throw new Error('No replacement was recorded.');
  return { wrong, replacement: replacementFactId };
}

/** A retraction: the shop API was said to depend on lodash, which is withdrawn with nothing in its place. */
async function recordRetraction(memory: ReturnType<typeof createMemory>) {
  const retracted = await recordOne(
    memory.on('2026-01-10'),
    'The shop API depends on lodash.',
    draft({ predicate: 'depends_on', value: 'lodash', validFrom: null, createsShop: true }),
  );
  const invalidated = await invalidateFact(memory.on('2026-02-01'), {
    namespace: NAMESPACE,
    trigger: 'person',
    reasonCode: 'reported_wrong',
    factId: retracted,
    source: note('Nothing in the shop API imports lodash.', '2026-02-01'),
    replacement: null,
  });
  if (!invalidated.ok) throw new Error(invalidated.error.message);
  return retracted;
}

/** Everything a history read could change: every fact, with its sources and audit entries. */
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
    audit.push(entries.value);
  }
  return { facts: facts.value, audit };
}

describe('getFactHistory', () => {
  it('returns a single fact with the audit entry of its recording', async () => {
    const memory = createMemory();
    const factId = await recordOne(
      memory.on('2026-01-10'),
      'The shop API depends on redis.',
      draft({ predicate: 'depends_on', value: 'redis', validFrom: null, createsShop: true }),
    );

    const entries = await historyOf(memory.on('2026-04-01'), factId);

    expect(factIdsOf(entries)).toEqual([factId]);
    expect(entryOf(entries, factId).auditEntries.map((entry) => [entry.operation, entry.action])).toEqual([
      ['remember', 'fact.recorded'],
    ]);
  });

  it('returns both facts of a succession in order of valid time', async () => {
    const memory = createMemory();
    const { original, endedCopy, successor } = await recordSuccession(memory);

    // As-of and known-at dates play no part: a history covers all valid and recorded time.
    const entries = await historyOf(memory.on('2026-04-01'), successor);

    expect(factIdsOf(entries)).toEqual([original, endedCopy, successor]);
    expect(entries.map((entry) => [entry.fact.validFrom, entry.fact.validTo])).toEqual([
      [at('2025-01-01'), null],
      [at('2025-01-01'), at('2026-03-01')],
      [at('2026-03-01'), null],
    ]);
  });

  it('returns the same entries whichever fact of the chain is given', async () => {
    const memory = createMemory();
    const { original, endedCopy, successor } = await recordSuccession(memory);
    const deps = memory.on('2026-04-01');

    const fromOriginal = await historyOf(deps, original);
    const fromEndedCopy = await historyOf(deps, endedCopy);
    const fromSuccessor = await historyOf(deps, successor);

    expect(fromEndedCopy).toEqual(fromOriginal);
    expect(fromSuccessor).toEqual(fromOriginal);
  });

  it('returns the wrong fact and its correction with the entry that links them', async () => {
    const memory = createMemory();
    const { wrong, replacement } = await recordCorrection(memory);

    const entries = await historyOf(memory.on('2026-04-01'), replacement);

    expect(factIdsOf(entries)).toEqual([wrong, replacement]);
    const invalidation = entryOf(entries, wrong).auditEntries.find(
      (entry) => entry.action === 'fact.invalidated',
    );
    expect(invalidation?.operation).toBe('correction');
    expect(invalidation?.detail).toEqual({ supersededByFactId: replacement });
  });

  it('returns a retracted fact with the entry of its invalidation', async () => {
    const memory = createMemory();
    const retracted = await recordRetraction(memory);

    const entries = await historyOf(memory.on('2026-04-01'), retracted);

    expect(factIdsOf(entries)).toEqual([retracted]);
    expect(entryOf(entries, retracted).auditEntries.map((entry) => [entry.operation, entry.action])).toEqual([
      ['remember', 'fact.recorded'],
      ['retraction', 'fact.invalidated'],
    ]);
  });

  it('includes a fact for the same subject and single-valued predicate that no link reaches', async () => {
    const memory = createMemory();
    const earlier = await recordOne(
      memory.on('2026-01-10'),
      'The shop API ran on Postgres 14 during 2024.',
      draft({
        predicate: 'uses_database_version',
        value: 'postgres 14',
        validFrom: '2024-01-01',
        validTo: '2025-01-01',
        createsShop: true,
      }),
    );
    const later = await recordOne(
      memory.on('2026-01-11'),
      'The shop API runs on Postgres 15 since January 2025.',
      draft({ predicate: 'uses_database_version', value: 'postgres 15', validFrom: '2025-01-01' }),
    );

    const entries = await historyOf(memory.on('2026-04-01'), earlier);

    expect(factIdsOf(entries)).toEqual([earlier, later]);
  });

  it('returns only linked facts for a multi-valued predicate', async () => {
    const memory = createMemory();
    const redis = await recordOne(
      memory.on('2026-01-10'),
      'The shop API depends on redis.',
      draft({ predicate: 'depends_on', value: 'redis', validFrom: null, createsShop: true }),
    );
    await recordOne(
      memory.on('2026-01-11'),
      'The shop API depends on vitest.',
      draft({ predicate: 'depends_on', value: 'vitest', validFrom: null }),
    );

    const entries = await historyOf(memory.on('2026-04-01'), redis);

    expect(factIdsOf(entries)).toEqual([redis]);
  });

  it('puts a fact with an unknown start first', async () => {
    const memory = createMemory();
    // Recorded first, so recorded time alone would put it first.
    const known = await recordOne(
      memory.on('2026-01-10'),
      'The shop API runs on Postgres 15 since June 2025.',
      draft({
        predicate: 'uses_database_version',
        value: 'postgres 15',
        validFrom: '2025-06-01',
        createsShop: true,
      }),
    );
    const unknownStart = await recordOne(
      memory.on('2026-01-11'),
      'Before June 2025 the shop API ran on Postgres 14.',
      draft({
        predicate: 'uses_database_version',
        value: 'postgres 14',
        validFrom: null,
        validTo: '2025-06-01',
      }),
    );

    const entries = await historyOf(memory.on('2026-04-01'), known);

    expect(factIdsOf(entries)).toEqual([unknownStart, known]);
  });

  it('returns each fact with its sources', async () => {
    const memory = createMemory();
    const factId = await recordOne(
      memory.on('2026-01-10'),
      'The shop API depends on redis.',
      draft({ predicate: 'depends_on', value: 'redis', validFrom: null, createsShop: true }),
    );
    const restated = await recordFacts(memory.on('2026-02-01'), {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'restated',
      source: note('The cache of the shop API is redis.', '2026-02-01'),
      drafts: [],
      restatedFactIds: [factId],
    });
    if (!restated.ok) throw new Error(restated.error.message);

    const entries = await historyOf(memory.on('2026-04-01'), factId);

    const entry = entryOf(entries, factId);
    expect(entry.sources.map((source) => source.content)).toEqual([
      'The shop API depends on redis.',
      'The cache of the shop API is redis.',
    ]);
    expect(entry.subject.id).toBe(SHOP.id);
    expect(entry.auditEntries.map((auditEntry) => auditEntry.action)).toEqual([
      'fact.recorded',
      'fact.source_attached',
    ]);
  });

  it('returns not_found for a fact in another namespace', async () => {
    const memory = createMemory();
    const factId = await recordOne(
      memory.on('2026-01-10'),
      'The shop API depends on redis.',
      draft({ predicate: 'depends_on', value: 'redis', validFrom: null, createsShop: true }),
    );

    const history = await getFactHistory(memory.on('2026-04-01'), { namespace: 'billing-api', factId });

    expect(history.ok).toBe(false);
    if (history.ok) return;
    expect(history.error.code).toBe('not_found');
  });

  it('returns the explanation of a correction with the entry that records it', async () => {
    const memory = createMemory();
    const { wrong, replacement } = await recordCorrection(memory);

    const entries = await historyOf(memory.on('2026-04-01'), wrong);

    const invalidation = entryOf(entries, wrong).auditEntries.find(
      (entry) => entry.action === 'fact.invalidated',
    );
    expect(invalidation?.explanation).toBe(
      'That was wrong: the shop API has always used vitest, never jest.',
    );
    expect(entryOf(entries, replacement).auditEntries.map((entry) => entry.explanation)).toEqual([
      'That was wrong: the shop API has always used vitest, never jest.',
    ]);
  });

  it('returns the explanation of a retraction although its source is linked to no fact', async () => {
    const memory = createMemory();
    const retracted = await recordRetraction(memory);

    const entries = await historyOf(memory.on('2026-04-01'), retracted);

    const entry = entryOf(entries, retracted);
    const invalidation = entry.auditEntries.find((auditEntry) => auditEntry.action === 'fact.invalidated');
    expect(invalidation?.explanation).toBe('Nothing in the shop API imports lodash.');
    expect(entry.sources.map((source) => source.id)).not.toContain(invalidation?.sourceId);
  });

  it('returns no explanation for an entry that names no source', async () => {
    const memory = createMemory();
    const { store } = memory;
    const recordedAt = at('2026-01-10');
    const committed = await store.commit({
      namespace: NAMESPACE,
      operationId: 'op-imported',
      operation: 'remember',
      trigger: 'maintenance',
      reasonCode: 'stated',
      explainedBySourceId: null,
      occurredAt: recordedAt,
      changes: [
        { kind: 'create_entity', entity: { ...SHOP, namespace: NAMESPACE, createdAt: recordedAt } },
        {
          kind: 'record_source',
          source: {
            id: 's-readme',
            namespace: NAMESPACE,
            kind: 'file',
            locator: 'README.md',
            version: null,
            content: 'The shop API depends on redis.',
            contentHash: null,
            purgedAt: null,
            observedAt: recordedAt,
            createdAt: recordedAt,
          },
        },
        {
          kind: 'record_fact',
          fact: {
            id: 'f-redis',
            namespace: NAMESPACE,
            subjectEntityId: SHOP.id,
            predicate: 'depends_on',
            object: { kind: 'value', value: 'redis' },
            statement: 'The shop API depends on redis.',
            confidence: 0.9,
            validFrom: null,
            validTo: null,
            createdAt: recordedAt,
            invalidatedAt: null,
            purgedAt: null,
            supersededByFactId: null,
          },
          sourceIds: ['s-readme'],
          embedding: new Float32Array([1, 0, 0, 0]),
          singleValued: false,
        },
      ],
    });
    if (!committed.ok) throw new Error(committed.error.message);

    const entries = await historyOf(memory.on('2026-04-01'), 'f-redis');

    expect(
      entryOf(entries, 'f-redis').auditEntries.map((entry) => [entry.sourceId, entry.explanation]),
    ).toEqual([[null, null]]);
  });

  it('returns no explanation when the explaining source has no content', async () => {
    const memory = createMemory();
    const recorded = await recordFacts(memory.on('2026-01-10'), {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'stated',
      source: note(null, '2026-01-10'),
      drafts: [draft({ predicate: 'depends_on', value: 'redis', validFrom: null, createsShop: true })],
      restatedFactIds: [],
    });
    if (!recorded.ok) throw new Error(recorded.error.message);
    const [factId] = recorded.value.factIds;
    if (factId === undefined) throw new Error('No fact was recorded.');

    const entries = await historyOf(memory.on('2026-04-01'), factId);

    const [recording] = entryOf(entries, factId).auditEntries;
    expect(recording?.sourceId).toBe(recorded.value.sourceId);
    expect(recording?.explanation).toBeNull();
  });

  it('ends when the supersession links form a cycle', async () => {
    const memory = createMemory();
    const { wrong, replacement } = await recordCorrection(memory);
    // The commit rules cannot produce a cycle, so a store that reports one stands in for damaged
    // data: the replacement also claims to be superseded by the wrong fact, in both reads.
    const replacementSupersededByWrong = async (): Promise<FactWithSources> => {
      const found = await memory.store.getFact({ namespace: NAMESPACE, factId: replacement });
      if (!found.ok || found.value === null) throw new Error('The replacement is missing.');
      return { ...found.value, fact: { ...found.value.fact, supersededByFactId: wrong } };
    };
    const cyclicStore: MemoryStore = {
      ...memory.store,
      async getFact(query) {
        if (query.factId !== replacement) return memory.store.getFact(query);
        return ok(await replacementSupersededByWrong());
      },
      async listFacts(query) {
        if (query.supersededByFactId !== wrong) return memory.store.listFacts(query);
        return ok([await replacementSupersededByWrong()]);
      },
    };

    const entries = await historyOf({ ...memory.on('2026-04-01'), store: cyclicStore }, wrong);

    expect(factIdsOf(entries)).toEqual([wrong, replacement]);
  });

  it('returns a storage failure as it is', async () => {
    const memory = createMemory();
    const { wrong } = await recordCorrection(memory);
    const failingStore: MemoryStore = {
      ...memory.store,
      listAuditEntries: () => Promise.resolve(err('storage_failed', 'The disk is full.')),
    };

    const history = await getFactHistory(
      { ...memory.on('2026-04-01'), store: failingStore },
      { namespace: NAMESPACE, factId: wrong },
    );

    expect(history.ok).toBe(false);
    if (history.ok) return;
    expect(history.error.code).toBe('storage_failed');
  });

  it('writes nothing', async () => {
    const memory = createMemory();
    const { successor } = await recordSuccession(memory);
    const before = await snapshotStore(memory.store);

    await historyOf(memory.on('2026-04-01'), successor);

    expect(await snapshotStore(memory.store)).toEqual(before);
  });
});
