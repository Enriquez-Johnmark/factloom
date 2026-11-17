import { describe, expect, it } from 'vitest';
import { createTestDeps, TEST_DOMAIN } from '../create-test-deps.ts';
import { createInMemoryStore } from '../in-memory-store.ts';
import type { MemoryStore } from '../memory-store.ts';
import { toTimestamp } from '../timestamp.ts';
import { archiveFacts } from './archive-facts.ts';
import { recordFacts } from './record-facts.ts';
import { unarchiveFact } from './unarchive-fact.ts';

const NAMESPACE = 'shop-api';
const requested = { namespace: NAMESPACE, trigger: 'person', reasonCode: 'requested' } as const;

/** One fact about each of two repositories, recorded on 2026-01-10. */
async function recordTwoFacts(store: MemoryStore): Promise<readonly string[]> {
  const draft = (subjectEntityId: string, name: string) => ({
    fact: {
      subjectEntityId,
      predicate: 'uses_database_version',
      object: { kind: 'value', value: 'PostgreSQL 16' } as const,
      statement: `${name} runs PostgreSQL 16`,
      confidence: 0.9,
      validFrom: null,
      validTo: null,
    },
    newEntities: [{ id: subjectEntityId, type: 'repository', name }],
  });
  const recorded = await recordFacts(createTestDeps({ now: '2026-01-10', domain: TEST_DOMAIN, store }), {
    ...requested,
    reasonCode: 'stated',
    trigger: 'agent',
    source: {
      kind: 'agent_note',
      locator: null,
      version: null,
      content: 'Notes on shop-api.',
      observedAt: toTimestamp(new Date('2026-01-10')),
    },
    drafts: [draft('entity-shop-api', 'shop-api'), draft('entity-web', 'web')],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  return recorded.value.factIds;
}

describe('archiveFacts and unarchiveFact', () => {
  it('archives several facts in one commit, one audit entry each, and unarchives one of them', async () => {
    const store = createInMemoryStore();
    const factIds = await recordTwoFacts(store);

    const archived = await archiveFacts(createTestDeps({ now: '2026-03-01', store }), {
      ...requested,
      factIds,
    });
    const unarchived = await unarchiveFact(createTestDeps({ now: '2026-03-02', store }), {
      ...requested,
      factId: factIds[0] ?? 'none',
    });

    expect(archived.ok && archived.value.archiveIds).toHaveLength(2);
    expect(unarchived).toEqual({ ok: true, value: null });
    const states = await Promise.all(
      factIds.map((factId) => store.getFact({ namespace: NAMESPACE, factId })),
    );
    expect(states.map((found) => found.ok && found.value?.archivedAt)).toEqual([
      null,
      toTimestamp(new Date('2026-03-01')),
    ]);
  });

  it('archives nothing when one of the facts cannot be archived', async () => {
    const store = createInMemoryStore();
    const factIds = await recordTwoFacts(store);

    const archived = await archiveFacts(createTestDeps({ now: '2026-03-01', store }), {
      ...requested,
      factIds: [...factIds, 'missing'],
    });

    expect(archived.ok ? null : archived.error.code).toBe('not_found');
    const states = await Promise.all(
      factIds.map((factId) => store.getFact({ namespace: NAMESPACE, factId })),
    );
    expect(states.map((found) => found.ok && found.value?.archivedAt)).toEqual([null, null]);
  });
});
