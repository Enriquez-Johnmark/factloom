import { describe, expect, it } from 'vitest';
import { createTestDeps, TEST_DOMAIN } from '../create-test-deps.ts';
import type { Domain } from '../domain.ts';
import type { FactWithSources, TimeFilter } from '../fact.ts';
import { createInMemoryStore } from '../in-memory-store.ts';
import type { MemoryStore } from '../memory-store.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { type Timestamp, toTimestamp } from '../timestamp.ts';
import { buildInvalidateFactChangeSet, invalidateFact } from './invalidate-fact.ts';
import type { FactDraft, NewEntity, NewSource } from './operation-inputs.ts';
import { recordFacts } from './record-facts.ts';

const NAMESPACE = 'shop-api';
const stated = { namespace: NAMESPACE, trigger: 'agent', reasonCode: 'stated' } as const;
const reportedWrong = { namespace: NAMESPACE, trigger: 'person', reasonCode: 'reported_wrong' } as const;
const shopApi: NewEntity = { id: 'entity-shop-api', type: 'repository', name: 'shop-api' };

/** The spike's case: continuous integration was recorded as running Node 20, and ran Node 22. */
const DOMAIN: Domain = {
  ...TEST_DOMAIN,
  predicates: [
    ...TEST_DOMAIN.predicates,
    { name: 'runs_ci_on', description: 'What continuous integration runs on.', cardinality: 'single' },
  ],
};

const RECORDED_ON = '2026-03-01';
const CORRECTED_ON = '2026-04-10';
const BEFORE_CORRECTION = day('2026-04-01');
const AFTER_CORRECTION = day('2026-05-01');

function day(date: string): Timestamp {
  return toTimestamp(new Date(`${date}T00:00:00.000Z`));
}

function note(content: string): NewSource {
  return { kind: 'note', locator: null, version: null, content, observedAt: day('2026-01-01') };
}

function draft(
  predicate: string,
  value: string,
  period: { validFrom: Timestamp | null; validTo: Timestamp | null } = { validFrom: null, validTo: null },
): FactDraft {
  return {
    fact: {
      subjectEntityId: shopApi.id,
      predicate,
      object: { kind: 'value', value },
      statement: `shop-api ${predicate} ${value}`,
      confidence: 1,
      ...period,
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

/** Records one fact about `shop-api` on the recording date, creating the entity if asked. */
async function record(deps: OperationDeps, given: FactDraft, isFirst = true): Promise<string> {
  const recorded = await recordFacts(deps, {
    ...stated,
    source: note('A note.'),
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
): Promise<readonly FactWithSources[]> {
  const listed = await store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: shopApi.id,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time,
    limit: 100,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value;
}

async function listValues(store: MemoryStore, time: TimeFilter | 'live' | 'all'): Promise<string[]> {
  const facts = await list(store, time);
  return facts.map(({ fact }) => (fact.object.kind === 'value' ? fact.object.value : fact.object.entityId));
}

describe('invalidateFact', () => {
  it('retracts a fact with no replacement', async () => {
    const memory = createMemory();
    const factId = await record(memory.on(RECORDED_ON), draft('runs_ci_on', 'Node 20'));

    const retracted = await invalidateFact(memory.on(CORRECTED_ON), {
      ...reportedWrong,
      factId,
      source: note('We never ran CI on Node 20.'),
      replacement: null,
    });

    expect(retracted).toEqual({ ok: true, value: { invalidatedFactId: factId, replacementFactId: null } });
    // As of after the retraction, known after the retraction: nothing.
    expect(await listValues(memory.store, { validAt: AFTER_CORRECTION, knownAt: AFTER_CORRECTION })).toEqual(
      [],
    );
    // As of after the retraction, known before it: the fact was still believed.
    expect(await listValues(memory.store, { validAt: AFTER_CORRECTION, knownAt: BEFORE_CORRECTION })).toEqual(
      ['Node 20'],
    );
    const found = await memory.store.getFact({ namespace: NAMESPACE, factId });
    expect(found.ok && found.value?.fact.supersededByFactId).toBeNull();
    expect(found.ok && found.value?.fact.invalidatedAt).toBe(day(CORRECTED_ON));
  });

  it('corrects a fact and links it to the replacement', async () => {
    const memory = createMemory();
    const factId = await record(memory.on(RECORDED_ON), draft('runs_ci_on', 'Node 20'));

    const corrected = await invalidateFact(memory.on(CORRECTED_ON), {
      ...reportedWrong,
      factId,
      source: note('CI was on Node 22, not Node 20.'),
      replacement: draft('runs_ci_on', 'Node 22'),
    });

    if (!corrected.ok) throw new Error(corrected.error.message);
    // Known after the correction, as of a date before it and as of a date after it: only Node 22.
    for (const validAt of [day('2026-02-01'), BEFORE_CORRECTION, AFTER_CORRECTION]) {
      expect(await listValues(memory.store, { validAt, knownAt: AFTER_CORRECTION })).toEqual(['Node 22']);
    }
    // Known before the correction, as of the same date: only Node 20.
    expect(
      await listValues(memory.store, { validAt: BEFORE_CORRECTION, knownAt: BEFORE_CORRECTION }),
    ).toEqual(['Node 20']);
    const wrong = await memory.store.getFact({ namespace: NAMESPACE, factId });
    expect(wrong.ok && wrong.value?.fact.supersededByFactId).toBe(corrected.value.replacementFactId);
  });

  it('gives the replacement the valid period of the fact it corrects when none is given', async () => {
    const memory = createMemory();
    const period = { validFrom: day('2026-01-15'), validTo: day('2026-03-20') };
    const factId = await record(memory.on(RECORDED_ON), draft('runs_ci_on', 'Node 20', period));

    await invalidateFact(memory.on(CORRECTED_ON), {
      ...reportedWrong,
      factId,
      source: note('CI was on Node 22, not Node 20.'),
      replacement: draft('runs_ci_on', 'Node 22'),
    });

    const [replacement] = await list(memory.store, 'live');
    expect(replacement?.fact).toMatchObject(period);
  });

  it("keeps the replacement's own valid period when one is given", async () => {
    const memory = createMemory();
    const factId = await record(
      memory.on(RECORDED_ON),
      draft('runs_ci_on', 'Node 20', { validFrom: day('2026-01-15'), validTo: day('2026-03-20') }),
    );
    const own = { validFrom: day('2026-02-01'), validTo: null };

    await invalidateFact(memory.on(CORRECTED_ON), {
      ...reportedWrong,
      factId,
      source: note('CI has been on Node 22 since February.'),
      replacement: draft('runs_ci_on', 'Node 22', own),
    });

    const [replacement] = await list(memory.store, 'live');
    expect(replacement?.fact).toMatchObject(own);
  });

  it('writes a correction as one operation with three audit entries after the source', async () => {
    const memory = createMemory();
    const factId = await record(memory.on(RECORDED_ON), draft('runs_ci_on', 'Node 20'));

    const corrected = await invalidateFact(memory.on(CORRECTED_ON), {
      ...reportedWrong,
      factId,
      source: note('CI was on Node 22, not Node 20.'),
      replacement: draft('runs_ci_on', 'Node 22'),
    });

    if (!corrected.ok || corrected.value.replacementFactId === null) throw new Error('Not corrected.');
    const [replacement] = await list(memory.store, 'live');
    const sourceId = replacement?.sources[0]?.id ?? '';
    const targets = [
      { targetKind: 'source', targetId: sourceId },
      { targetKind: 'fact', targetId: corrected.value.replacementFactId },
      { targetKind: 'fact', targetId: factId },
    ] as const;
    const entries = [];
    for (const target of targets) {
      const listed = await memory.store.listAuditEntries({ namespace: NAMESPACE, ...target });
      if (!listed.ok) throw new Error(listed.error.message);
      entries.push(...listed.value.filter((entry) => entry.operation === 'correction'));
    }
    expect(entries.map((entry) => entry.action)).toEqual([
      'source.recorded',
      'fact.recorded',
      'fact.invalidated',
    ]);
    expect(new Set(entries.map((entry) => entry.operationId)).size).toBe(1);
    expect(entries.map((entry) => entry.sourceId)).toEqual([sourceId, sourceId, sourceId]);
    expect(entries.map((entry) => entry.reasonCode)).toEqual([
      'reported_wrong',
      'reported_wrong',
      'reported_wrong',
    ]);
  });

  it('returns already_invalidated with the superseding fact', async () => {
    const memory = createMemory();
    const factId = await record(memory.on(RECORDED_ON), draft('runs_ci_on', 'Node 20'));
    const input = {
      ...reportedWrong,
      factId,
      source: note('CI was on Node 22, not Node 20.'),
      replacement: draft('runs_ci_on', 'Node 22'),
    };
    const corrected = await invalidateFact(memory.on(CORRECTED_ON), input);
    if (!corrected.ok) throw new Error(corrected.error.message);

    const again = await invalidateFact(memory.on('2026-04-11'), input);

    expect(!again.ok && again.error.code).toBe('already_invalidated');
    expect(!again.ok && again.error.relatedFactIds).toEqual([corrected.value.replacementFactId]);
    expect(await list(memory.store, 'all')).toHaveLength(2);
  });

  it('returns not_found for a fact in another namespace', async () => {
    const memory = createMemory();
    const factId = await record(memory.on(RECORDED_ON), draft('runs_ci_on', 'Node 20'));

    const result = await invalidateFact(memory.on(CORRECTED_ON), {
      ...reportedWrong,
      namespace: 'another-repository',
      factId,
      source: note('Wrong.'),
      replacement: null,
    });

    expect(!result.ok && result.error.code).toBe('not_found');
    expect(await listValues(memory.store, 'live')).toEqual(['Node 20']);
  });

  it('keeps the end a replacement gives when it gives no start', async () => {
    const memory = createMemory();
    const factId = await record(
      memory.on(RECORDED_ON),
      draft('runs_ci_on', 'Node 20', { validFrom: day('2026-01-15'), validTo: day('2026-03-20') }),
    );
    const own = { validFrom: null, validTo: day('2026-02-01') };

    await invalidateFact(memory.on(CORRECTED_ON), {
      ...reportedWrong,
      factId,
      source: note('CI ran on Node 22 until February.'),
      replacement: draft('runs_ci_on', 'Node 22', own),
    });

    const [replacement] = await list(memory.store, 'live');
    expect(replacement?.fact).toMatchObject(own);
  });

  it('returns already_invalidated with no related fact for a fact that was retracted', async () => {
    const memory = createMemory();
    const factId = await record(memory.on(RECORDED_ON), draft('runs_ci_on', 'Node 20'));
    const input = {
      ...reportedWrong,
      factId,
      source: note('CI does not run on Node 20.'),
      replacement: null,
    };
    const retracted = await invalidateFact(memory.on(CORRECTED_ON), input);
    if (!retracted.ok) throw new Error(retracted.error.message);

    const again = await invalidateFact(memory.on('2026-04-11'), input);

    expect(!again.ok && again.error.code).toBe('already_invalidated');
    expect(!again.ok && again.error.relatedFactIds).toEqual([]);
  });

  it('returns a storage failure as it is', async () => {
    const memory = createMemory();
    const factId = await record(memory.on(RECORDED_ON), draft('runs_ci_on', 'Node 20'));
    const failingStore: MemoryStore = {
      ...memory.store,
      getFact: () =>
        Promise.resolve({
          ok: false,
          error: { code: 'storage_failed', message: 'The disk is full.', relatedFactIds: [] },
        }),
    };

    const result = await invalidateFact(
      { ...memory.on(CORRECTED_ON), store: failingStore },
      { ...reportedWrong, factId, source: note('Wrong.'), replacement: null },
    );

    expect(!result.ok && result.error.code).toBe('storage_failed');
    expect(await listValues(memory.store, 'live')).toEqual(['Node 20']);
  });

  it('changes nothing when the replacement conflicts with another live fact', async () => {
    const memory = createMemory();
    const deps = memory.on(RECORDED_ON);
    await record(deps, draft('uses_database_version', '16'));
    const factId = await record(deps, draft('runs_ci_on', 'Node 20'), false);

    const result = await invalidateFact(memory.on(CORRECTED_ON), {
      ...reportedWrong,
      factId,
      source: note('That note was about the database.'),
      replacement: draft('uses_database_version', '17'),
    });

    expect(!result.ok && result.error.code).toBe('conflict');
    expect((await listValues(memory.store, 'live')).sort()).toEqual(['16', 'Node 20']);
    expect(await list(memory.store, 'all')).toHaveLength(2);
  });

  it('returns invalid_input for a replacement whose predicate the domain does not have', async () => {
    const memory = createMemory();
    const factId = await record(memory.on(RECORDED_ON), draft('runs_ci_on', 'Node 20'));

    const result = await invalidateFact(memory.on(CORRECTED_ON), {
      ...reportedWrong,
      factId,
      source: note('Wrong.'),
      replacement: draft('has_mascot', 'a fox'),
    });

    expect(!result.ok && result.error.code).toBe('invalid_input');
    expect(await listValues(memory.store, 'live')).toEqual(['Node 20']);
  });

  it('retracts without calling the embedder', async () => {
    const memory = createMemory();
    const factId = await record(memory.on(RECORDED_ON), draft('runs_ci_on', 'Node 20'));
    const embedderThatMustNotRun = {
      model: 'fake-embedder',
      dimensions: 16,
      embed: () => {
        throw new Error('The embedder was called.');
      },
    };

    const retracted = await invalidateFact(
      { ...memory.on(CORRECTED_ON), embedder: embedderThatMustNotRun },
      { ...reportedWrong, factId, source: note('Wrong.'), replacement: null },
    );

    expect(retracted.ok).toBe(true);
  });

  it('never reduces the number of facts', async () => {
    const memory = createMemory();
    const first = await record(memory.on(RECORDED_ON), draft('runs_ci_on', 'Node 20'));

    const corrected = await invalidateFact(memory.on(CORRECTED_ON), {
      ...reportedWrong,
      factId: first,
      source: note('CI was on Node 22, not Node 20.'),
      replacement: draft('runs_ci_on', 'Node 22'),
    });
    const afterCorrection = (await list(memory.store, 'all')).length;
    if (!corrected.ok || corrected.value.replacementFactId === null) throw new Error('Not corrected.');
    await invalidateFact(memory.on('2026-04-12'), {
      ...reportedWrong,
      factId: corrected.value.replacementFactId,
      source: note('We do not run CI at all.'),
      replacement: null,
    });

    expect(afterCorrection).toBe(2);
    expect(await list(memory.store, 'all')).toHaveLength(2);
    expect(await list(memory.store, 'live')).toHaveLength(0);
  });
});

describe('buildInvalidateFactChangeSet', () => {
  const now = day(CORRECTED_ON);
  const source = {
    ...note('Wrong.'),
    id: 'source-1',
    namespace: NAMESPACE,
    contentHash: null,
    purgedAt: null,
    createdAt: now,
  };
  const shared = {
    context: reportedWrong,
    operationId: 'operation-1',
    occurredAt: now,
    source,
    factId: 'fact-1',
  };

  it('builds a retraction from the source and one invalidation with no link', () => {
    const changeSet = buildInvalidateFactChangeSet({ ...shared, replacement: null });

    expect(changeSet).toMatchObject({
      operation: 'retraction',
      explainedBySourceId: 'source-1',
      occurredAt: now,
    });
    expect(changeSet.changes).toEqual([
      { kind: 'record_source', source },
      { kind: 'invalidate_fact', factId: 'fact-1', supersededByFactId: null },
    ]);
  });

  it('builds a correction that records the replacement before the invalidation linked to it', () => {
    const fact = {
      ...draft('runs_ci_on', 'Node 22').fact,
      id: 'fact-2',
      namespace: NAMESPACE,
      createdAt: now,
      invalidatedAt: null,
      purgedAt: null,
      supersededByFactId: null,
    };

    const changeSet = buildInvalidateFactChangeSet({
      ...shared,
      replacement: { newEntities: [], facts: [{ fact, vector: new Float32Array(16), singleValued: true }] },
    });

    expect(changeSet.operation).toBe('correction');
    expect(changeSet.changes.map((change) => change.kind)).toEqual([
      'record_source',
      'record_fact',
      'invalidate_fact',
    ]);
    expect(changeSet.changes[2]).toEqual({
      kind: 'invalidate_fact',
      factId: 'fact-1',
      supersededByFactId: 'fact-2',
    });
  });
});
