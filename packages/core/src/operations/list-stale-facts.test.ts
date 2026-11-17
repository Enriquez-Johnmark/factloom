import { describe, expect, it } from 'vitest';
import { createTestDeps, TEST_DOMAIN } from '../create-test-deps.ts';
import { createInMemoryStore } from '../in-memory-store.ts';
import type { MemoryStore } from '../memory-store.ts';
import { toTimestamp } from '../timestamp.ts';
import { listStaleFacts } from './list-stale-facts.ts';
import { recordFacts } from './record-facts.ts';

const NAMESPACE = 'shop-api';

/** PostgreSQL 14, recorded on 2026-01-10 and true until 2026-03-01. */
async function recordEndingFact(store: MemoryStore): Promise<string> {
  const recorded = await recordFacts(createTestDeps({ now: '2026-01-10', domain: TEST_DOMAIN, store }), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: {
      kind: 'agent_note',
      locator: null,
      version: null,
      content: 'We run PostgreSQL 14 until March.',
      observedAt: toTimestamp(new Date('2026-01-10')),
    },
    drafts: [
      {
        fact: {
          subjectEntityId: 'entity-shop-api',
          predicate: 'uses_database_version',
          object: { kind: 'value', value: 'PostgreSQL 14' },
          statement: 'shop-api runs PostgreSQL 14',
          confidence: 0.9,
          validFrom: null,
          validTo: toTimestamp(new Date('2026-03-01')),
        },
        newEntities: [{ id: 'entity-shop-api', type: 'repository', name: 'shop-api' }],
      },
    ],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const factId = recorded.value.factIds[0];
  if (factId === undefined) throw new Error('No fact was recorded.');
  return factId;
}

describe('listStaleFacts', () => {
  it('lists the facts current at the clock’s now: a fact before its end, and not after it', async () => {
    const store = createInMemoryStore();
    const factId = await recordEndingFact(store);
    const input = {
      namespace: NAMESPACE,
      notVerifiedSince: toTimestamp(new Date('2026-02-01')),
      confidenceBelow: null,
      limit: 10,
    };

    const beforeEnd = await listStaleFacts(createTestDeps({ now: '2026-02-01', store }), input);
    const afterEnd = await listStaleFacts(createTestDeps({ now: '2026-04-01', store }), input);

    expect(beforeEnd.ok && beforeEnd.value.map((found) => found.fact.id)).toEqual([factId]);
    expect(afterEnd.ok && afterEnd.value).toEqual([]);
  });

  it('refuses a confidenceBelow outside 0 to 1 with invalid_input', async () => {
    const listed = await listStaleFacts(createTestDeps({ now: '2026-02-01' }), {
      namespace: NAMESPACE,
      notVerifiedSince: toTimestamp(new Date('2026-02-01')),
      confidenceBelow: 1.5,
      limit: 10,
    });

    expect(listed.ok ? null : listed.error.code).toBe('invalid_input');
  });
});
