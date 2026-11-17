import { describe, expect, it } from 'vitest';
import { createTestDeps, TEST_DOMAIN } from '../create-test-deps.ts';
import type { VerificationOutcome } from '../fact-verification.ts';
import { createInMemoryStore } from '../in-memory-store.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { toTimestamp } from '../timestamp.ts';
import { invalidateFact } from './invalidate-fact.ts';
import { recordFacts } from './record-facts.ts';
import { recordVerification } from './record-verification.ts';

const NAMESPACE = 'shop-api';
const checked = { namespace: NAMESPACE, trigger: 'maintenance', reasonCode: 'verification_due' } as const;

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
    source: {
      kind: 'agent_note',
      locator: null,
      version: null,
      content: 'We run PostgreSQL 14.',
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

describe('recordVerification', () => {
  it('records one audit entry on the fact, naming the verification, and changes no fact', async () => {
    const { store, on, factId } = await recordDatabase();
    const before = await store.getFact({ namespace: NAMESPACE, factId });

    const recorded = await recordVerification(on('2026-03-01'), {
      ...checked,
      factId,
      outcome: 'contradicted',
      method: 'deterministic',
    });

    if (!recorded.ok) throw new Error(recorded.error.message);
    const entries = await store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'fact',
      targetId: factId,
    });
    expect(entries.ok && entries.value.at(-1)).toMatchObject({
      operation: 'verification',
      action: 'fact.verified',
      reasonCode: 'verification_due',
      detail: { verificationId: recorded.value.verificationId },
      occurredAt: toTimestamp(new Date('2026-03-01')),
    });
    expect(await store.getFact({ namespace: NAMESPACE, factId })).toEqual(before);
  });

  it('refuses a fact that is no longer live with already_invalidated', async () => {
    const { on, factId } = await recordDatabase();
    await invalidateFact(on('2026-02-01'), {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'reported_wrong',
      factId,
      source: {
        kind: 'agent_note',
        locator: null,
        version: null,
        content: 'Wrong repository.',
        observedAt: toTimestamp(new Date('2026-02-01')),
      },
      replacement: null,
    });

    const recorded = await recordVerification(on('2026-03-01'), {
      ...checked,
      factId,
      outcome: 'confirmed',
      method: 'deterministic',
    });

    expect(recorded.ok ? null : recorded.error.code).toBe('already_invalidated');
  });

  it('refuses an outcome outside the list with invalid_input', async () => {
    const { on, factId } = await recordDatabase();
    const unknown: unknown = 'probably';

    const recorded = await recordVerification(on('2026-03-01'), {
      ...checked,
      factId,
      // A caller without types can send any word; the commit's schema refuses it.
      outcome: unknown as VerificationOutcome,
      method: 'llm',
    });

    expect(recorded.ok ? null : recorded.error.code).toBe('invalid_input');
  });
});
