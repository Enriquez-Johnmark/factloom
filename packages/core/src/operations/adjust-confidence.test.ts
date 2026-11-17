import { describe, expect, it } from 'vitest';
import { createTestDeps, TEST_DOMAIN } from '../create-test-deps.ts';
import { createInMemoryStore } from '../in-memory-store.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { toTimestamp } from '../timestamp.ts';
import { adjustConfidence } from './adjust-confidence.ts';
import { invalidateFact } from './invalidate-fact.ts';
import type { NewSource } from './operation-inputs.ts';
import { recordFacts } from './record-facts.ts';

const NAMESPACE = 'shop-api';
const lowered = { namespace: NAMESPACE, trigger: 'feedback', reasonCode: 'reported_wrong' } as const;

function note(content: string): NewSource {
  return {
    kind: 'note',
    locator: null,
    version: null,
    content,
    observedAt: toTimestamp(new Date('2026-01-10T00:00:00.000Z')),
  };
}

/** One memory with a clock that each step sets, holding PostgreSQL 14 at confidence 0.9. */
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

describe('adjustConfidence', () => {
  it('returns the fact and the confidence that held before, and reads then return the new one', async () => {
    const { store, on, factId } = await recordDatabase();

    const adjusted = await adjustConfidence(on('2026-03-01'), { ...lowered, factId, confidence: 0.4 });

    expect(adjusted).toEqual({ ok: true, value: { factId, previousConfidence: 0.9 } });
    const found = await store.getFact({ namespace: NAMESPACE, factId });
    expect(found.ok && found.value?.fact).toMatchObject({ id: factId, confidence: 0.4 });
  });

  it('returns the previous adjustment, not the confidence at recording, after a second adjustment', async () => {
    const { on, factId } = await recordDatabase();
    await adjustConfidence(on('2026-03-01'), { ...lowered, factId, confidence: 0.4 });

    const again = await adjustConfidence(on('2026-04-01'), { ...lowered, factId, confidence: 0.2 });

    expect(again.ok && again.value.previousConfidence).toBe(0.4);
  });

  it('writes one audit entry under the confidence_adjustment operation with the given trigger', async () => {
    const { store, on, factId } = await recordDatabase();

    await adjustConfidence(on('2026-03-01'), { ...lowered, factId, confidence: 0.4 });

    const entries = await store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'fact',
      targetId: factId,
    });
    const adjustments = entries.ok
      ? entries.value.filter((entry) => entry.action === 'fact.confidence_adjusted')
      : [];
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({
      operation: 'confidence_adjustment',
      trigger: 'feedback',
      reasonCode: 'reported_wrong',
      sourceId: null,
      detail: { previousConfidence: 0.9, confidence: 0.4 },
    });
  });

  it('returns invalid_input for a confidence outside 0 to 1, and records nothing', async () => {
    const { store, on, factId } = await recordDatabase();

    const results = await Promise.all(
      [1.5, -0.1, Number.NaN].map((confidence) =>
        adjustConfidence(on('2026-03-01'), { ...lowered, factId, confidence }),
      ),
    );

    expect(results.map((result) => (result.ok ? null : result.error.code))).toEqual([
      'invalid_input',
      'invalid_input',
      'invalid_input',
    ]);
    const found = await store.getFact({ namespace: NAMESPACE, factId });
    expect(found.ok && found.value?.fact.confidence).toBe(0.9);
  });

  it('returns not_found for a fact that does not exist', async () => {
    const { on } = await recordDatabase();

    const adjusted = await adjustConfidence(on('2026-03-01'), {
      ...lowered,
      factId: 'missing',
      confidence: 0.4,
    });

    expect(adjusted.ok ? null : adjusted.error.code).toBe('not_found');
  });

  it('returns already_invalidated for a fact that was retracted', async () => {
    const { on, factId } = await recordDatabase();
    const retracted = await invalidateFact(on('2026-02-01'), {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'reported_wrong',
      factId,
      source: note('That was another repository.'),
      replacement: null,
    });
    if (!retracted.ok) throw new Error(retracted.error.message);

    const adjusted = await adjustConfidence(on('2026-03-01'), { ...lowered, factId, confidence: 0.4 });

    expect(adjusted.ok ? null : adjusted.error.code).toBe('already_invalidated');
  });
});
