import {
  createInMemoryStore,
  createTestDeps,
  type Domain,
  type MemoryStore,
  recordFacts,
  TEST_DOMAIN,
  toTimestamp,
} from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { archiveUnusedFacts } from './archive-unused-facts.ts';

const NAMESPACE = 'repo:shop-api';
const DAY_MS = 24 * 60 * 60 * 1000;
/** The job runs on 2026-11-01 with a period of 180 days, so "unused since" is 2026-05-05. */
const NOW = '2026-11-01';

let count = 0;
/** A counting identifier generator shared by every recording, so that no two identifiers repeat. */
const nextId = (): string => {
  count += 1;
  return `id-${count}`;
};

/** Records one `depends_on` fact on a day, optionally ending on another. */
async function recordDependency(
  store: MemoryStore,
  value: string,
  day: string,
  validTo: string | null = null,
) {
  const recorded = await recordFacts(
    createTestDeps({ now: day, domain: TEST_DOMAIN, store, newId: nextId }),
    {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'stated',
      source: {
        kind: 'agent_note',
        locator: null,
        version: null,
        content: `shop-api depends on ${value}.`,
        observedAt: toTimestamp(new Date(day)),
      },
      drafts: [
        {
          fact: {
            subjectEntityId: 'entity-shop-api',
            predicate: 'depends_on',
            object: { kind: 'value', value },
            statement: `shop-api depends on ${value}`,
            confidence: 0.9,
            validFrom: null,
            validTo: validTo === null ? null : toTimestamp(new Date(validTo)),
          },
          newEntities:
            value === 'redis' ? [{ id: 'entity-shop-api', type: 'repository', name: 'shop-api' }] : [],
        },
      ],
      restatedFactIds: [],
    },
  );
  if (!recorded.ok) throw new Error(recorded.error.message);
  return recorded.value.factIds[0] ?? 'none';
}

function recall(store: MemoryStore, factId: string, day: string) {
  return store.recordFactUsage({
    namespace: NAMESPACE,
    factIds: [factId],
    recalledAt: toTimestamp(new Date(day)),
  });
}

function run(store: MemoryStore, domain: Domain = TEST_DOMAIN) {
  const deps = createTestDeps({ now: NOW, store, domain });
  return archiveUnusedFacts({ ...deps, archivePeriodMs: 180 * DAY_MS }, { namespace: NAMESPACE });
}

async function archivedAt(store: MemoryStore, factId: string) {
  const found = await store.getFact({ namespace: NAMESPACE, factId });
  return found.ok ? found.value?.archivedAt : undefined;
}

describe('archiveUnusedFacts', () => {
  it('archives a current fact recorded 200 days ago and never recalled, and no fact recalled 10 days ago, ended, or recorded 10 days ago', async () => {
    const store = createInMemoryStore();
    const unused = await recordDependency(store, 'redis', '2026-04-15');
    const recalled = await recordDependency(store, 'vitest', '2026-04-15');
    const ended = await recordDependency(store, 'moment', '2026-04-15', '2026-06-01');
    const recent = await recordDependency(store, 'zod', '2026-10-22');
    // Usage tracking begins with this recall, on 2026-04-20, before the period started.
    await recall(store, recalled, '2026-04-20');
    await recall(store, recalled, '2026-10-22');

    const result = await run(store);

    expect(result.ok && result.value).toMatchObject({ examined: 1, changed: 1, flagged: 0, failed: 0 });
    expect(await archivedAt(store, unused)).toBe(toTimestamp(new Date(NOW)));
    for (const factId of [recalled, ended, recent]) expect(await archivedAt(store, factId)).toBeNull();
    const audit = await store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'fact',
      targetId: unused,
    });
    expect(
      audit.ok &&
        audit.value
          .filter((entry) => entry.operation === 'archive')
          .map((entry) => [entry.trigger, entry.reasonCode]),
    ).toEqual([['maintenance', 'unused']]);
  });

  it('archives nothing when usage tracking began only 30 days ago', async () => {
    const store = createInMemoryStore();
    const unused = await recordDependency(store, 'redis', '2026-04-15');
    const recalled = await recordDependency(store, 'vitest', '2026-04-15');
    await recall(store, recalled, '2026-10-02');

    const result = await run(store);

    expect(result.ok && result.value.changed).toBe(0);
    expect(await archivedAt(store, unused)).toBeNull();
  });

  it('archives nothing under human_approval, and counts the fact as flagged', async () => {
    const store = createInMemoryStore();
    const unused = await recordDependency(store, 'redis', '2026-04-15');
    const recalled = await recordDependency(store, 'vitest', '2026-04-15');
    await recall(store, recalled, '2026-04-20');
    await recall(store, recalled, '2026-10-22');

    const result = await run(store, { ...TEST_DOMAIN, correctionPolicy: 'human_approval' });

    expect(result.ok && result.value).toMatchObject({
      changed: 0,
      flagged: 1,
      flaggedItems: [{ id: unused, reason: 'unused' }],
    });
    expect(await archivedAt(store, unused)).toBeNull();
  });
});
