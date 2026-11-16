import { describe, expect, it } from 'vitest';
import { createTestDeps } from '../create-test-deps.ts';
import { createInMemoryStore } from '../in-memory-store.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { type Timestamp, toTimestamp } from '../timestamp.ts';
import { endFact } from './end-fact.ts';
import { findConflictCandidates } from './find-conflict-candidates.ts';
import type { FactDraft, NewEntity, NewSource } from './operation-inputs.ts';
import { recordFacts } from './record-facts.ts';

const NAMESPACE = 'shop-api';
const stated = { namespace: NAMESPACE, trigger: 'agent', reasonCode: 'stated' } as const;
const shopApi: NewEntity = { id: 'entity-shop-api', type: 'repository', name: 'shop-api' };
const billingApi: NewEntity = { id: 'entity-billing-api', type: 'repository', name: 'billing-api' };

// The periods of spikes/fact-schema: PostgreSQL 14 from June 2025 until 15 March 2026, then 16.
const TRUE_SINCE = day('2025-06-01');
const UPGRADED_ON = day('2026-03-15');

function day(date: string): Timestamp {
  return toTimestamp(new Date(`${date}T00:00:00.000Z`));
}

function note(content: string): NewSource {
  return { kind: 'note', locator: null, version: null, content, observedAt: day('2026-01-01') };
}

function draft(
  predicate: string,
  value: string,
  period: { validFrom?: Timestamp | null; validTo?: Timestamp | null } = {},
  newEntities: readonly NewEntity[] = [],
): FactDraft {
  return {
    fact: {
      subjectEntityId: shopApi.id,
      predicate,
      object: { kind: 'value', value },
      statement: `shop-api ${predicate} ${value}`,
      confidence: 1,
      validFrom: period.validFrom ?? null,
      validTo: period.validTo ?? null,
    },
    newEntities,
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
  return { store, on: (date: string): OperationDeps => createTestDeps({ now: date, store, newId }) };
}

async function record(deps: OperationDeps, given: FactDraft): Promise<string> {
  const recorded = await recordFacts(deps, {
    ...stated,
    source: note('A note.'),
    drafts: [given],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const factId = recorded.value.factIds[0];
  if (factId === undefined) throw new Error('No fact was recorded.');
  return factId;
}

/** Records PostgreSQL 14 in January and, in April, its end on 15 March with PostgreSQL 16 after it. */
async function createUpgradedMemory() {
  const memory = createMemory();
  const originalId = await record(
    memory.on('2026-01-10'),
    draft('uses_database_version', 'PostgreSQL 14', { validFrom: TRUE_SINCE }, [shopApi]),
  );
  const ended = await endFact(memory.on('2026-04-02'), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'reported_ended',
    factId: originalId,
    validTo: UPGRADED_ON,
    source: note('We upgraded to PostgreSQL 16 on 15 March.'),
    successor: draft('uses_database_version', 'PostgreSQL 16'),
  });
  if (!ended.ok || ended.value.successorFactId === null) throw new Error('The succession failed.');
  return {
    ...memory,
    originalId,
    endedId: ended.value.endedFactId,
    successorId: ended.value.successorFactId,
  };
}

async function findIds(
  deps: OperationDeps,
  parts: Partial<Parameters<typeof findConflictCandidates>[1]> = {},
): Promise<string[]> {
  const found = await findConflictCandidates(deps, {
    namespace: NAMESPACE,
    subjectEntityId: shopApi.id,
    predicate: 'uses_database_version',
    validFrom: null,
    validTo: null,
    limit: 10,
    ...parts,
  });
  if (!found.ok) throw new Error(found.error.message);
  return found.value.map(({ fact }) => fact.id);
}

describe('findConflictCandidates', () => {
  it('returns the current fact for a new open-ended value', async () => {
    const memory = createMemory();
    const deps = memory.on('2026-01-10');
    const factId = await record(deps, draft('uses_database_version', 'PostgreSQL 14', {}, [shopApi]));

    const found = await findConflictCandidates(deps, {
      namespace: NAMESPACE,
      subjectEntityId: shopApi.id,
      predicate: 'uses_database_version',
      validFrom: day('2026-01-10'),
      validTo: null,
      limit: 10,
    });

    if (!found.ok) throw new Error(found.error.message);
    expect(found.value.map(({ fact }) => fact.id)).toEqual([factId]);
    expect(found.value[0]?.subject.name).toBe('shop-api');
    expect(found.value[0]?.sources).toHaveLength(1);
  });

  it('returns the ended fact that an older fact arriving late overlaps', async () => {
    const memory = await createUpgradedMemory();

    const candidates = await findIds(memory.on('2026-05-01'), {
      validFrom: day('2025-01-01'),
      validTo: day('2025-09-01'),
    });

    expect(candidates).toEqual([memory.endedId]);
  });

  it('returns nothing for a period that ends where the stored fact begins', async () => {
    const memory = createMemory();
    const deps = memory.on('2026-01-10');
    await record(deps, draft('uses_database_version', 'PostgreSQL 14', { validFrom: TRUE_SINCE }, [shopApi]));

    expect(await findIds(deps, { validFrom: day('2025-01-01'), validTo: TRUE_SINCE })).toEqual([]);
  });

  it('returns the open-ended fact for a period dated in the future', async () => {
    const memory = await createUpgradedMemory();

    const candidates = await findIds(memory.on('2026-05-01'), { validFrom: day('2027-01-01') });

    expect(candidates).toEqual([memory.successorId]);
  });

  it('treats an unknown start as open', async () => {
    const memory = await createUpgradedMemory();

    const candidates = await findIds(memory.on('2026-05-01'), {
      validFrom: null,
      validTo: day('2025-07-01'),
    });

    expect(candidates).toEqual([memory.endedId]);
  });

  it('leaves out invalidated facts', async () => {
    const memory = await createUpgradedMemory();

    const candidates = await findIds(memory.on('2026-05-01'));

    expect(candidates).not.toContain(memory.originalId);
    expect(candidates.sort()).toEqual([memory.endedId, memory.successorId].sort());
  });

  it('returns nothing for another predicate, another subject or another namespace', async () => {
    const memory = createMemory();
    const deps = memory.on('2026-01-10');
    await record(deps, draft('uses_database_version', 'PostgreSQL 14', {}, [shopApi, billingApi]));

    expect(await findIds(deps, { predicate: 'depends_on' })).toEqual([]);
    expect(await findIds(deps, { subjectEntityId: billingApi.id })).toEqual([]);
    expect(await findIds(deps, { namespace: 'another-repository' })).toEqual([]);
  });

  it('returns at most the limit, newest first', async () => {
    const memory = createMemory();
    const first = await record(memory.on('2026-01-10'), draft('depends_on', 'redis', {}, [shopApi]));
    const second = await record(memory.on('2026-02-10'), draft('depends_on', 'postgres'));
    const third = await record(memory.on('2026-03-10'), draft('depends_on', 'kafka'));
    const deps = memory.on('2026-05-01');

    expect(await findIds(deps, { predicate: 'depends_on', limit: 2 })).toEqual([third, second]);
    expect(await findIds(deps, { predicate: 'depends_on', limit: 10 })).toEqual([third, second, first]);
  });

  it('returns invalid_input for a limit below 1 or a reversed period', async () => {
    const deps = createTestDeps();
    const input = {
      namespace: NAMESPACE,
      subjectEntityId: shopApi.id,
      predicate: 'uses_database_version',
      validFrom: null,
      validTo: null,
      limit: 10,
    };

    const noLimit = await findConflictCandidates(deps, { ...input, limit: 0 });
    const reversed = await findConflictCandidates(deps, {
      ...input,
      validFrom: UPGRADED_ON,
      validTo: TRUE_SINCE,
    });

    expect(!noLimit.ok && noLimit.error.code).toBe('invalid_input');
    expect(!reversed.ok && reversed.error.code).toBe('invalid_input');
  });

  it('returns invalid_input for a period that ends where it starts', async () => {
    const result = await findConflictCandidates(createTestDeps(), {
      namespace: NAMESPACE,
      subjectEntityId: shopApi.id,
      predicate: 'uses_database_version',
      validFrom: UPGRADED_ON,
      validTo: UPGRADED_ON,
      limit: 10,
    });

    expect(!result.ok && result.error.code).toBe('invalid_input');
  });

  it('returns the newest candidate when the limit is 1', async () => {
    const memory = createMemory();
    await record(memory.on('2026-01-10'), draft('depends_on', 'redis', {}, [shopApi]));
    const newest = await record(memory.on('2026-02-10'), draft('depends_on', 'postgres'));

    expect(await findIds(memory.on('2026-05-01'), { predicate: 'depends_on', limit: 1 })).toEqual([newest]);
  });

  it('returns a storage failure as it is', async () => {
    const deps = createTestDeps();
    const failing: OperationDeps = {
      ...deps,
      store: {
        ...deps.store,
        listFacts: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'storage_failed', message: 'The disk is full.', relatedFactIds: [] },
          }),
      },
    };

    const result = await findConflictCandidates(failing, {
      namespace: NAMESPACE,
      subjectEntityId: shopApi.id,
      predicate: 'uses_database_version',
      validFrom: null,
      validTo: null,
      limit: 10,
    });

    expect(!result.ok && result.error.code).toBe('storage_failed');
  });

  it('writes nothing', async () => {
    const memory = await createUpgradedMemory();
    const readMemory = async () => {
      const facts = await memory.store.listFacts({
        namespace: NAMESPACE,
        subjectEntityId: null,
        predicate: null,
        touchingEntityIds: null,
        supersededByFactId: null,
        time: 'all',
        limit: 100,
      });
      const entries = [];
      for (const targetId of [memory.originalId, memory.endedId, memory.successorId]) {
        entries.push(
          await memory.store.listAuditEntries({ namespace: NAMESPACE, targetKind: 'fact', targetId }),
        );
      }
      return { facts, entries };
    };
    const before = await readMemory();

    await findIds(memory.on('2026-05-01'));

    expect(await readMemory()).toEqual(before);
  });
});
