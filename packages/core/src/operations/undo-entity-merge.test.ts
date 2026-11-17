import { describe, expect, it } from 'vitest';
import { createTestDeps, TEST_DOMAIN } from '../create-test-deps.ts';
import { createInMemoryStore } from '../in-memory-store.ts';
import { toTimestamp } from '../timestamp.ts';
import { mergeEntities } from './merge-entities.ts';
import { undoEntityMerge } from './undo-entity-merge.ts';

const NAMESPACE = 'repo:example';
const sameEntity = { namespace: NAMESPACE, trigger: 'person', reasonCode: 'same_entity' } as const;
const at = toTimestamp(new Date('2026-01-10T00:00:00.000Z'));

/** Two repository entities, merged on 2026-06-01. */
async function mergedPair() {
  const store = createInMemoryStore();
  const created = await store.commit({
    namespace: NAMESPACE,
    operationId: 'op-1',
    operation: 'remember',
    trigger: 'agent',
    reasonCode: 'stated',
    explainedBySourceId: null,
    occurredAt: at,
    changes: [
      {
        kind: 'create_entity',
        entity: { id: 'e-a', namespace: NAMESPACE, type: 'repository', name: 'shop-api', createdAt: at },
      },
      {
        kind: 'create_entity',
        entity: { id: 'e-b', namespace: NAMESPACE, type: 'repository', name: 'shop api', createdAt: at },
      },
    ],
  });
  if (!created.ok) throw new Error(created.error.message);
  const merged = await mergeEntities(createTestDeps({ now: '2026-06-01', domain: TEST_DOMAIN, store }), {
    ...sameEntity,
    fromEntityId: 'e-b',
    intoEntityId: 'e-a',
  });
  if (!merged.ok) throw new Error(merged.error.message);
  return {
    store,
    mergeId: merged.value.mergeId,
    deps: createTestDeps({ now: '2026-06-02', domain: TEST_DOMAIN, store }),
  };
}

describe('undoEntityMerge', () => {
  it('sets the time of the undo on the merge, once', async () => {
    const { store, mergeId, deps } = await mergedPair();

    const undone = await undoEntityMerge(deps, { ...sameEntity, mergeId });

    expect(undone).toEqual({ ok: true, value: { mergeId } });
    const merges = await store.listEntityMerges({ namespace: NAMESPACE });
    expect(merges.ok && merges.value.map(({ undoneAt }) => undoneAt)).toEqual(['2026-06-02T00:00:00.000Z']);
  });

  it('returns already_exists for a merge already undone', async () => {
    const { mergeId, deps } = await mergedPair();
    await undoEntityMerge(deps, { ...sameEntity, mergeId });

    const again = await undoEntityMerge(deps, { ...sameEntity, mergeId });

    expect(again.ok ? null : again.error.code).toBe('already_exists');
  });

  it('returns not_found for an unknown merge', async () => {
    const { deps } = await mergedPair();

    const undone = await undoEntityMerge(deps, { ...sameEntity, mergeId: 'm-missing' });

    expect(undone.ok ? null : undone.error.code).toBe('not_found');
  });
});
