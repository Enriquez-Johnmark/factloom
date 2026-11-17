import { describe, expect, it } from 'vitest';
import { createTestDeps, TEST_DOMAIN } from '../create-test-deps.ts';
import type { Embedder } from '../embedder.ts';
import type { FactWithSources, TimeFilter } from '../fact.ts';
import { createInMemoryStore } from '../in-memory-store.ts';
import type { MemoryStore } from '../memory-store.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { type Timestamp, toTimestamp } from '../timestamp.ts';
import { endFact } from './end-fact.ts';
import type { FactDraft, NewEntity, NewSource } from './operation-inputs.ts';
import { recordFacts } from './record-facts.ts';
import { reviseValidTime } from './revise-valid-time.ts';

const NAMESPACE = 'shop-api';
const DATABASE = 'uses_database_version';
const stated = { namespace: NAMESPACE, trigger: 'agent', reasonCode: 'stated' } as const;
const corrected = { namespace: NAMESPACE, trigger: 'maintenance', reasonCode: 'period_corrected' } as const;
const shopApi: NewEntity = { id: 'entity-shop-api', type: 'repository', name: 'shop-api' };

// PostgreSQL 14 since June 2025, recorded in January. In April the upgrade to 16 was recorded
// as on 15 March. In May it was found to have happened on 1 March.
const RECORDED_ON = '2026-01-10';
const LEARNED_ON = '2026-04-02';
const REVISED_ON = '2026-05-04';
const TRUE_SINCE = day('2025-06-01');
const OLD_BOUNDARY = day('2026-03-15');
const NEW_BOUNDARY = day('2026-03-01');

function day(date: string): Timestamp {
  return toTimestamp(new Date(`${date}T00:00:00.000Z`));
}

function note(content: string): NewSource {
  return { kind: 'note', locator: null, version: null, content, observedAt: day('2026-01-01') };
}

function draft(value: string, validFrom: Timestamp | null, validTo: Timestamp | null = null): FactDraft {
  return {
    fact: {
      subjectEntityId: shopApi.id,
      predicate: DATABASE,
      object: { kind: 'value', value },
      statement: `shop-api runs ${value}`,
      confidence: 0.8,
      validFrom,
      validTo,
    },
    newEntities: [],
  };
}

/** One memory with a clock that each step sets, and identifiers that never repeat. */
function createMemory() {
  const store = createInMemoryStore();
  let count = 0;
  const newId = (): string => {
    count += 1;
    return `id-${count}`;
  };
  return {
    store,
    on: (date: string): OperationDeps => createTestDeps({ now: date, domain: TEST_DOMAIN, store, newId }),
  };
}

async function list(
  store: MemoryStore,
  time: TimeFilter | 'live' | 'all',
): Promise<readonly FactWithSources[]> {
  const listed = await store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: shopApi.id,
    predicate: DATABASE,
    touchingEntityIds: null,
    supersededByFactId: null,
    time,
    limit: 100,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value;
}

/** The values true on a date, as believed on another. */
async function valuesAt(store: MemoryStore, validAt: Timestamp, knownAt: Timestamp): Promise<string[]> {
  return (await list(store, { validAt, knownAt })).map(({ fact }) =>
    fact.object.kind === 'value' ? fact.object.value : fact.object.entityId,
  );
}

/** PostgreSQL 14 recorded in January; in April, its end on 15 March with PostgreSQL 16 after it. */
async function upgradeDatabase() {
  const memory = createMemory();
  const recorded = await recordFacts(memory.on(RECORDED_ON), {
    ...stated,
    source: note('We run PostgreSQL 14.'),
    drafts: [{ ...draft('PostgreSQL 14', TRUE_SINCE), newEntities: [shopApi] }],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const ended = await endFact(memory.on(LEARNED_ON), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'reported_ended',
    factId: recorded.value.factIds[0] ?? 'missing',
    validTo: OLD_BOUNDARY,
    source: note('We upgraded to PostgreSQL 16 on 15 March.'),
    successor: draft('PostgreSQL 16', null),
  });
  if (!ended.ok) throw new Error(ended.error.message);
  const { endedFactId, successorFactId } = ended.value;
  if (successorFactId === null) throw new Error('No successor was recorded.');
  return { memory, endedFactId, successorFactId };
}

/** Moves the boundary of the upgrade from 15 March to 1 March, in one call. */
async function moveBoundary(
  memory: ReturnType<typeof createMemory>,
  endedFactId: string,
  successorFactId: string,
) {
  return reviseValidTime(memory.on(REVISED_ON), {
    ...corrected,
    source: note('The upgrade happened on 1 March, not 15 March.'),
    revisions: [
      { factId: endedFactId, validFrom: TRUE_SINCE, validTo: NEW_BOUNDARY },
      { factId: successorFactId, validFrom: NEW_BOUNDARY, validTo: null },
    ],
  });
}

describe('reviseValidTime', () => {
  it('moves the date of a succession by revising both neighbours, so each date has exactly one value', async () => {
    const { memory, endedFactId, successorFactId } = await upgradeDatabase();

    const revised = await moveBoundary(memory, endedFactId, successorFactId);

    expect(revised.ok).toBe(true);
    const knownAt = day('2026-06-01');
    expect(await valuesAt(memory.store, day('2026-02-28'), knownAt)).toEqual(['PostgreSQL 14']);
    expect(await valuesAt(memory.store, NEW_BOUNDARY, knownAt)).toEqual(['PostgreSQL 16']);
    expect(await valuesAt(memory.store, day('2026-03-10'), knownAt)).toEqual(['PostgreSQL 16']);
    expect(await valuesAt(memory.store, OLD_BOUNDARY, knownAt)).toEqual(['PostgreSQL 16']);
    expect(await valuesAt(memory.store, day('2026-03-20'), knownAt)).toEqual(['PostgreSQL 16']);
  });

  it('still returns the old periods when asked with a known-at date before the revision', async () => {
    const { memory, endedFactId, successorFactId } = await upgradeDatabase();
    await moveBoundary(memory, endedFactId, successorFactId);

    const knownAt = day('2026-04-15');

    expect(await valuesAt(memory.store, day('2026-02-28'), knownAt)).toEqual(['PostgreSQL 14']);
    expect(await valuesAt(memory.store, day('2026-03-10'), knownAt)).toEqual(['PostgreSQL 14']);
    expect(await valuesAt(memory.store, OLD_BOUNDARY, knownAt)).toEqual(['PostgreSQL 16']);
  });

  it('refuses to move only one neighbour across the boundary, which would overlap the other', async () => {
    const { memory, endedFactId, successorFactId } = await upgradeDatabase();

    const revised = await reviseValidTime(memory.on(REVISED_ON), {
      ...corrected,
      source: note('PostgreSQL 16 since 1 March.'),
      revisions: [{ factId: successorFactId, validFrom: NEW_BOUNDARY, validTo: null }],
    });

    expect(revised.ok ? null : revised.error.code).toBe('conflict');
    if (!revised.ok) expect(revised.error.relatedFactIds).toEqual([endedFactId]);
  });

  it('returns conflict naming a third live fact that a revised period overlaps, and writes nothing', async () => {
    const { memory, endedFactId } = await upgradeDatabase();
    const earlier = await recordFacts(memory.on(LEARNED_ON), {
      ...stated,
      source: note('Before June 2025 we ran PostgreSQL 13.'),
      drafts: [draft('PostgreSQL 13', day('2024-01-01'), TRUE_SINCE)],
      restatedFactIds: [],
    });
    if (!earlier.ok) throw new Error(earlier.error.message);
    const before = await list(memory.store, 'all');

    const revised = await reviseValidTime(memory.on(REVISED_ON), {
      ...corrected,
      source: note('PostgreSQL 14 since January 2025.'),
      revisions: [{ factId: endedFactId, validFrom: day('2025-01-01'), validTo: OLD_BOUNDARY }],
    });

    expect(revised.ok ? null : revised.error.code).toBe('conflict');
    if (!revised.ok) expect(revised.error.relatedFactIds).toEqual(earlier.value.factIds);
    expect(await list(memory.store, 'all')).toEqual(before);
  });

  it('keeps each fact’s object, statement and confidence, and gives each copy its sources and the new one', async () => {
    const { memory, endedFactId, successorFactId } = await upgradeDatabase();

    const revised = await moveBoundary(memory, endedFactId, successorFactId);

    if (!revised.ok) throw new Error(revised.error.message);
    const live = await list(memory.store, 'live');
    const byId = new Map(live.map((found) => [found.fact.id, found]));
    const [endedCopyId, successorCopyId] = revised.value.revisedFactIds;
    const endedCopy = byId.get(endedCopyId ?? '');
    const successorCopy = byId.get(successorCopyId ?? '');
    expect(endedCopy?.fact).toMatchObject({
      subjectEntityId: shopApi.id,
      predicate: DATABASE,
      object: { kind: 'value', value: 'PostgreSQL 14' },
      statement: 'shop-api runs PostgreSQL 14',
      confidence: 0.8,
      validFrom: TRUE_SINCE,
      validTo: NEW_BOUNDARY,
    });
    expect(successorCopy?.fact).toMatchObject({
      object: { kind: 'value', value: 'PostgreSQL 16' },
      validFrom: NEW_BOUNDARY,
      validTo: null,
    });
    expect(endedCopy?.sources.map((found) => found.content).sort()).toEqual([
      'The upgrade happened on 1 March, not 15 March.',
      'We run PostgreSQL 14.',
      'We upgraded to PostgreSQL 16 on 15 March.',
    ]);
    expect(successorCopy?.sources.map((found) => found.content).sort()).toEqual([
      'The upgrade happened on 1 March, not 15 March.',
      'We upgraded to PostgreSQL 16 on 15 March.',
    ]);
  });

  it('lists the copies in the order of the input, and links each original to its copy', async () => {
    const { memory, endedFactId, successorFactId } = await upgradeDatabase();

    const revised = await reviseValidTime(memory.on(REVISED_ON), {
      ...corrected,
      source: note('The upgrade happened on 1 March, not 15 March.'),
      revisions: [
        { factId: successorFactId, validFrom: NEW_BOUNDARY, validTo: null },
        { factId: endedFactId, validFrom: TRUE_SINCE, validTo: NEW_BOUNDARY },
      ],
    });

    if (!revised.ok) throw new Error(revised.error.message);
    const links = await Promise.all(
      [successorFactId, endedFactId].map(async (factId) => {
        const found = await memory.store.getFact({ namespace: NAMESPACE, factId });
        return found.ok ? found.value?.fact.supersededByFactId : null;
      }),
    );
    expect(links).toEqual(revised.value.revisedFactIds);
  });

  it('revises without calling the embedder', async () => {
    const { memory, endedFactId, successorFactId } = await upgradeDatabase();
    const embedderThatMustNotRun: Embedder = {
      model: 'fake-embedder',
      dimensions: 16,
      embed: () => {
        throw new Error('The embedder was called.');
      },
    };

    const revised = await reviseValidTime(
      { ...memory.on(REVISED_ON), embedder: embedderThatMustNotRun },
      {
        ...corrected,
        source: note('The upgrade happened on 1 March.'),
        revisions: [
          { factId: endedFactId, validFrom: TRUE_SINCE, validTo: NEW_BOUNDARY },
          { factId: successorFactId, validFrom: NEW_BOUNDARY, validTo: null },
        ],
      },
    );

    expect(revised.ok).toBe(true);
  });

  it('writes 2n + 1 audit entries for n revisions, under one operation identifier and the revision operation', async () => {
    const { memory, endedFactId, successorFactId } = await upgradeDatabase();

    const revised = await moveBoundary(memory, endedFactId, successorFactId);

    if (!revised.ok) throw new Error(revised.error.message);
    const targets = [
      ...revised.value.revisedFactIds.map((id) => ({ targetKind: 'fact' as const, targetId: id })),
      { targetKind: 'fact' as const, targetId: endedFactId },
      { targetKind: 'fact' as const, targetId: successorFactId },
    ];
    const entries = [];
    for (const target of targets) {
      const listed = await memory.store.listAuditEntries({ namespace: NAMESPACE, ...target });
      if (!listed.ok) throw new Error(listed.error.message);
      entries.push(...listed.value.filter((entry) => entry.occurredAt === day(REVISED_ON)));
    }
    const sourceId = entries[0]?.sourceId ?? 'missing';
    const sourceEntries = await memory.store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'source',
      targetId: sourceId,
    });
    if (!sourceEntries.ok) throw new Error(sourceEntries.error.message);
    const all = [...sourceEntries.value, ...entries];
    expect(all.map((entry) => entry.action).sort()).toEqual([
      'fact.invalidated',
      'fact.invalidated',
      'fact.recorded',
      'fact.recorded',
      'source.recorded',
    ]);
    expect(new Set(all.map((entry) => entry.operationId)).size).toBe(1);
    expect(new Set(all.map((entry) => entry.operation))).toEqual(new Set(['revision']));
    expect(new Set(all.map((entry) => entry.reasonCode))).toEqual(new Set(['period_corrected']));
  });

  it('returns invalid_input for an empty list of revisions', async () => {
    const { memory } = await upgradeDatabase();

    const revised = await reviseValidTime(memory.on(REVISED_ON), {
      ...corrected,
      source: note('Nothing.'),
      revisions: [],
    });

    expect(revised.ok ? null : revised.error.code).toBe('invalid_input');
  });

  it('returns invalid_input for a fact listed twice', async () => {
    const { memory, successorFactId } = await upgradeDatabase();

    const revised = await reviseValidTime(memory.on(REVISED_ON), {
      ...corrected,
      source: note('Twice.'),
      revisions: [
        { factId: successorFactId, validFrom: NEW_BOUNDARY, validTo: null },
        { factId: successorFactId, validFrom: OLD_BOUNDARY, validTo: null },
      ],
    });

    expect(revised.ok ? null : revised.error.code).toBe('invalid_input');
  });

  it('returns invalid_input for a period whose start is not before its end', async () => {
    const { memory, endedFactId } = await upgradeDatabase();

    const revised = await reviseValidTime(memory.on(REVISED_ON), {
      ...corrected,
      source: note('Backwards.'),
      revisions: [{ factId: endedFactId, validFrom: NEW_BOUNDARY, validTo: NEW_BOUNDARY }],
    });

    expect(revised.ok ? null : revised.error.code).toBe('invalid_input');
  });

  it('returns not_found for a fact that does not exist', async () => {
    const { memory } = await upgradeDatabase();

    const revised = await reviseValidTime(memory.on(REVISED_ON), {
      ...corrected,
      source: note('Missing.'),
      revisions: [{ factId: 'no-such-fact', validFrom: null, validTo: null }],
    });

    expect(revised.ok ? null : revised.error.code).toBe('not_found');
  });

  it('returns already_invalidated with the superseding fact for a fact that was replaced', async () => {
    const { memory, endedFactId, successorFactId } = await upgradeDatabase();
    const revised = await moveBoundary(memory, endedFactId, successorFactId);
    if (!revised.ok) throw new Error(revised.error.message);

    const again = await reviseValidTime(memory.on(REVISED_ON), {
      ...corrected,
      source: note('Again.'),
      revisions: [{ factId: endedFactId, validFrom: TRUE_SINCE, validTo: OLD_BOUNDARY }],
    });

    expect(again.ok ? null : again.error.code).toBe('already_invalidated');
    if (!again.ok) expect(again.error.relatedFactIds).toEqual([revised.value.revisedFactIds[0]]);
  });

  it('changes nothing when a later revision in the list refers to a missing fact', async () => {
    const { memory, endedFactId } = await upgradeDatabase();
    const before = await list(memory.store, 'all');

    const revised = await reviseValidTime(memory.on(REVISED_ON), {
      ...corrected,
      source: note('One good, one missing.'),
      revisions: [
        { factId: endedFactId, validFrom: TRUE_SINCE, validTo: NEW_BOUNDARY },
        { factId: 'no-such-fact', validFrom: null, validTo: null },
      ],
    });

    expect(revised.ok ? null : revised.error.code).toBe('not_found');
    expect(await list(memory.store, 'all')).toEqual(before);
  });
});
