import { describe, expect, it } from 'vitest';
import { createTestDeps, TEST_DOMAIN } from '../create-test-deps.ts';
import { createInMemoryStore } from '../in-memory-store.ts';
import { toTimestamp } from '../timestamp.ts';
import { mergeEntities } from './merge-entities.ts';

const NAMESPACE = 'repo:example';
const sameEntity = { namespace: NAMESPACE, trigger: 'maintenance', reasonCode: 'same_entity' } as const;
const at = toTimestamp(new Date('2026-01-10T00:00:00.000Z'));

/** A memory with two repository entities and no facts. */
async function twoEntities() {
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
  return { store, deps: createTestDeps({ now: '2026-06-01', domain: TEST_DOMAIN, store }) };
}

describe('mergeEntities', () => {
  it('records the merge and returns its identifier', async () => {
    const { store, deps } = await twoEntities();

    const merged = await mergeEntities(deps, { ...sameEntity, fromEntityId: 'e-b', intoEntityId: 'e-a' });

    if (!merged.ok) throw new Error(merged.error.message);
    expect(await store.listEntityMerges({ namespace: NAMESPACE })).toEqual({
      ok: true,
      value: [
        {
          id: merged.value.mergeId,
          namespace: NAMESPACE,
          fromEntityId: 'e-b',
          intoEntityId: 'e-a',
          mergedAt: '2026-06-01T00:00:00.000Z',
          undoneAt: null,
        },
      ],
    });
  });

  it('audits the merge with the trigger and reason code of the call', async () => {
    const { store, deps } = await twoEntities();

    await mergeEntities(deps, { ...sameEntity, fromEntityId: 'e-b', intoEntityId: 'e-a' });

    const entries = await store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'entity',
      targetId: 'e-b',
    });
    expect(entries.ok && entries.value.filter(({ action }) => action === 'entity.merged')).toMatchObject([
      { operation: 'merge', trigger: 'maintenance', reasonCode: 'same_entity' },
    ]);
  });

  it('returns invalid_input for an entity merged with itself, and records nothing', async () => {
    const { store, deps } = await twoEntities();

    const merged = await mergeEntities(deps, { ...sameEntity, fromEntityId: 'e-a', intoEntityId: 'e-a' });

    expect(merged.ok ? null : merged.error.code).toBe('invalid_input');
    expect(await store.listEntityMerges({ namespace: NAMESPACE })).toEqual({ ok: true, value: [] });
  });

  it('returns not_found for an entity that does not exist', async () => {
    const { deps } = await twoEntities();

    const merged = await mergeEntities(deps, {
      ...sameEntity,
      fromEntityId: 'e-missing',
      intoEntityId: 'e-a',
    });

    expect(merged.ok ? null : merged.error.code).toBe('not_found');
  });
});
