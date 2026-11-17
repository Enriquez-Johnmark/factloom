import { describe, expect, it } from 'vitest';
import { createTestDeps, TEST_DOMAIN } from '../create-test-deps.ts';
import { createInMemoryStore } from '../in-memory-store.ts';
import type { MemoryStore } from '../memory-store.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { toTimestamp } from '../timestamp.ts';
import { invalidateFact } from './invalidate-fact.ts';
import type { NewSource } from './operation-inputs.ts';
import { recordFacts } from './record-facts.ts';
import { recordFeedback } from './record-feedback.ts';

const NAMESPACE = 'shop-api';
const given = { namespace: NAMESPACE, trigger: 'agent', reasonCode: 'feedback_given' } as const;

function note(content: string): NewSource {
  return {
    kind: 'agent_note',
    locator: null,
    version: null,
    content,
    observedAt: toTimestamp(new Date('2026-03-01')),
  };
}

/** A memory holding PostgreSQL 14, with a clock that each step sets. */
async function recordDatabase() {
  const store = createInMemoryStore();
  let count = 0;
  const newId = (): string => {
    count += 1;
    return `id-${count}`;
  };
  const on = (date: string): OperationDeps =>
    createTestDeps({ now: date, domain: TEST_DOMAIN, store, newId });
  const recorded = await recordFacts(on('2026-01-10'), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: note('We run PostgreSQL 14.'),
    drafts: [
      {
        fact: {
          subjectEntityId: 'entity-shop-api',
          predicate: 'uses_database_version',
          object: { kind: 'value', value: 'PostgreSQL 14' },
          statement: 'shop-api runs PostgreSQL 14',
          confidence: 0.9,
          validFrom: null,
          validTo: null,
        },
        newEntities: [{ id: 'entity-shop-api', type: 'repository', name: 'shop-api' }],
      },
    ],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const factId = recorded.value.factIds[0];
  if (factId === undefined) throw new Error('No fact was recorded.');
  return { store, on, factId };
}

async function feedbackEntries(store: MemoryStore, feedbackId: string) {
  const listed = await store.listAuditEntries({
    namespace: NAMESPACE,
    targetKind: 'feedback',
    targetId: feedbackId,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value;
}

describe('recordFeedback', () => {
  it('records the feedback and the source that holds what was said, in one commit', async () => {
    const { store, on, factId } = await recordDatabase();

    const recorded = await recordFeedback(on('2026-03-01'), {
      ...given,
      factId,
      signal: 'outdated',
      source: note('We are on 16 now.'),
    });

    if (!recorded.ok) throw new Error(recorded.error.message);
    const [entry] = await feedbackEntries(store, recorded.value.feedbackId);
    expect(entry).toMatchObject({ action: 'feedback.recorded', operation: 'feedback', detail: { factId } });
    const source = await store.getSource({ namespace: NAMESPACE, sourceId: entry?.sourceId ?? 'none' });
    expect(source.ok && source.value?.content).toBe('We are on 16 now.');
    expect(source.ok && source.value?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records feedback with no source when nothing was said', async () => {
    const { store, on, factId } = await recordDatabase();

    const recorded = await recordFeedback(on('2026-03-01'), {
      ...given,
      factId,
      signal: 'right',
      source: null,
    });

    if (!recorded.ok) throw new Error(recorded.error.message);
    expect(await feedbackEntries(store, recorded.value.feedbackId)).toMatchObject([{ sourceId: null }]);
  });

  it('records feedback on a fact that is no longer live', async () => {
    const { on, factId } = await recordDatabase();
    await invalidateFact(on('2026-02-01'), {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'reported_wrong',
      factId,
      source: note('Wrong repository.'),
      replacement: null,
    });

    const recorded = await recordFeedback(on('2026-03-01'), {
      ...given,
      factId,
      signal: 'wrong',
      source: null,
    });

    expect(recorded.ok).toBe(true);
  });

  it('changes no fact', async () => {
    const { store, on, factId } = await recordDatabase();
    const before = await store.getFact({ namespace: NAMESPACE, factId });

    await recordFeedback(on('2026-03-01'), {
      ...given,
      factId,
      signal: 'wrong',
      source: note('This is wrong.'),
    });

    expect(await store.getFact({ namespace: NAMESPACE, factId })).toEqual(before);
  });

  it('returns not_found for a fact that does not exist', async () => {
    const { on } = await recordDatabase();

    const recorded = await recordFeedback(on('2026-03-01'), {
      ...given,
      factId: 'missing',
      signal: 'wrong',
      source: null,
    });

    expect(recorded.ok ? null : recorded.error.code).toBe('not_found');
  });
});
