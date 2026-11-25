// Shared by the tests of the three proposal operations (FL-043): one memory, a clock each step
// sets, identifiers that never repeat, and shop-api on PostgreSQL 14 since June 2025, recorded
// on 10 January. Imports no test framework, as the other helpers of core do.
import { createTestDeps } from '../create-test-deps.ts';
import type { FactWithSources, TimeFilter } from '../fact.ts';
import { createInMemoryStore } from '../in-memory-store.ts';
import type { MemoryStore } from '../memory-store.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { type Timestamp, toTimestamp } from '../timestamp.ts';
import type { FactDraft, NewSource } from './operation-inputs.ts';
import { recordFacts } from './record-facts.ts';

export const NAMESPACE = 'shop-api';
const SHOP_API = { id: 'entity-shop-api', type: 'repository', name: 'shop-api' };

/** Midnight UTC of a calendar date. */
export function day(date: string): Timestamp {
  return toTimestamp(new Date(`${date}T00:00:00.000Z`));
}

export function note(content: string, observedOn = '2026-04-02'): NewSource {
  return { kind: 'note', locator: null, version: null, content, observedAt: day(observedOn) };
}

/** A fact that shop-api runs a version of PostgreSQL, from a date or with no known start. */
export function postgres(version: string, validFrom: Timestamp | null = null): FactDraft {
  return {
    fact: {
      subjectEntityId: SHOP_API.id,
      predicate: 'uses_database_version',
      object: { kind: 'value', value: `postgres ${version}` },
      statement: `shop-api runs PostgreSQL ${version}`,
      confidence: 1,
      validFrom,
      validTo: null,
    },
    newEntities: [],
  };
}

/** One memory holding the stored fact, and a way to act on it on a given day. */
export async function createProposalMemory(): Promise<{
  readonly store: MemoryStore;
  readonly storedFactId: string;
  readonly on: (date: string, store?: MemoryStore) => OperationDeps;
  readonly facts: (time: TimeFilter | 'live' | 'all') => Promise<readonly FactWithSources[]>;
}> {
  const store = createInMemoryStore();
  let count = 0;
  const newId = (): string => {
    count += 1;
    return `id-${count}`;
  };
  const on = (date: string, given: MemoryStore = store): OperationDeps =>
    createTestDeps({ now: date, store: given, newId });
  const recorded = await recordFacts(on('2026-01-10'), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: note('We run PostgreSQL 14.', '2026-01-10'),
    drafts: [{ ...postgres('14', day('2025-06-01')), newEntities: [SHOP_API] }],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const storedFactId = recorded.value.factIds[0];
  if (storedFactId === undefined) throw new Error('No fact was recorded.');
  const facts = async (time: TimeFilter | 'live' | 'all') => {
    const listed = await store.listFacts({
      namespace: NAMESPACE,
      subjectEntityId: SHOP_API.id,
      predicate: null,
      touchingEntityIds: null,
      supersededByFactId: null,
      time,
      limit: 100,
    });
    if (!listed.ok) throw new Error(listed.error.message);
    return listed.value;
  };
  return { store, storedFactId, on, facts };
}
