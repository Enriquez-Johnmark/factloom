import { describe, expect, it } from 'vitest';
import { createTestDeps, TEST_DOMAIN } from '../create-test-deps.ts';
import { createInMemoryStore } from '../in-memory-store.ts';
import { toTimestamp } from '../timestamp.ts';
import { listOrphanedFacts } from './list-orphaned-facts.ts';
import { recordFacts } from './record-facts.ts';
import { recordVerification } from './record-verification.ts';

const NAMESPACE = 'shop-api';

describe('listOrphanedFacts', () => {
  it('lists a live fact whose latest verification found its source missing', async () => {
    const store = createInMemoryStore();
    const deps = createTestDeps({ now: '2026-01-10', domain: TEST_DOMAIN, store });
    const recorded = await recordFacts(deps, {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'stated',
      source: {
        kind: 'file',
        locator: 'docs/database.md',
        version: 'abc123',
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
    const factId = recorded.value.factIds[0] ?? 'none';
    const before = await listOrphanedFacts(deps, { namespace: NAMESPACE, limit: 10 });

    await recordVerification(createTestDeps({ now: '2026-02-01', store, newId: () => 'vr-1' }), {
      namespace: NAMESPACE,
      trigger: 'maintenance',
      reasonCode: 'verification_due',
      factId,
      outcome: 'source_missing',
      method: 'deterministic',
    });
    const after = await listOrphanedFacts(deps, { namespace: NAMESPACE, limit: 10 });

    expect(before.ok && before.value).toEqual([]);
    expect(after.ok && after.value.map((found) => found.fact.id)).toEqual([factId]);
  });
});
