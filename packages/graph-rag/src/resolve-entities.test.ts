import { createTestDeps, err, type MemoryStore, type OperationDeps, parseDateInput } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { type EntityMention, resolveEntities } from './resolve-entities.ts';

const NAMESPACE = 'shop-api';

/** Creates entities in the store, with the given identifiers. */
async function createEntities(
  store: MemoryStore,
  entities: readonly { id: string; type: string; name: string }[],
  namespace = NAMESPACE,
): Promise<void> {
  const now = parseDateInput('2026-01-01');
  if (!now.ok) throw new Error(now.error.message);
  const committed = await store.commit({
    namespace,
    operationId: `op-${entities.map((entity) => entity.id).join('-')}`,
    operation: 'remember',
    trigger: 'agent',
    reasonCode: 'stated',
    explainedBySourceId: null,
    occurredAt: now.value,
    changes: entities.map((entity) => ({
      kind: 'create_entity',
      entity: { ...entity, namespace, createdAt: now.value },
    })),
  });
  if (!committed.ok) throw new Error(committed.error.message);
}

async function resolve(deps: OperationDeps, mentions: readonly EntityMention[]) {
  const resolved = await resolveEntities(deps, { namespace: NAMESPACE, mentions });
  if (!resolved.ok) throw new Error(resolved.error.message);
  return resolved.value;
}

describe('resolveEntities', () => {
  it('reuses the only entity with that name whatever its type', async () => {
    const deps = createTestDeps();
    await createEntities(deps.store, [{ id: 'e-redis', type: 'dependency', name: 'redis' }]);

    const resolved = await resolve(deps, [{ type: 'repository', name: 'redis' }]);

    expect(resolved).toEqual({ entityIds: ['e-redis'], newEntities: [] });
  });

  it('chooses the entity of the mentioned type when several share the name', async () => {
    const deps = createTestDeps();
    await createEntities(deps.store, [
      { id: 'e-redis-dependency', type: 'dependency', name: 'redis' },
      { id: 'e-redis-repository', type: 'repository', name: 'redis' },
    ]);

    const resolved = await resolve(deps, [{ type: 'repository', name: 'redis' }]);

    expect(resolved).toEqual({ entityIds: ['e-redis-repository'], newEntities: [] });
  });

  it('plans a new entity when several share the name and none has the mentioned type', async () => {
    const deps = createTestDeps();
    await createEntities(deps.store, [
      { id: 'e-redis-dependency', type: 'dependency', name: 'redis' },
      { id: 'e-redis-repository', type: 'repository', name: 'redis' },
    ]);

    const resolved = await resolve(deps, [{ type: 'convention', name: 'redis' }]);

    expect(resolved).toEqual({
      entityIds: ['id-1'],
      newEntities: [{ id: 'id-1', type: 'convention', name: 'redis' }],
    });
  });

  it('plans a new entity when no entity has the name', async () => {
    const deps = createTestDeps();
    await createEntities(deps.store, [{ id: 'e-redis', type: 'dependency', name: 'redis' }]);

    const resolved = await resolve(deps, [{ type: 'dependency', name: 'postgres' }]);

    expect(resolved).toEqual({
      entityIds: ['id-1'],
      newEntities: [{ id: 'id-1', type: 'dependency', name: 'postgres' }],
    });
  });

  it('treats names that differ only in case and spacing as the same', async () => {
    const deps = createTestDeps();
    await createEntities(deps.store, [{ id: 'e-shop', type: 'repository', name: 'Shop API' }]);

    const resolved = await resolve(deps, [
      { type: 'repository', name: '  shop   api ' },
      { type: 'repository', name: 'SHOP API' },
    ]);

    expect(resolved).toEqual({ entityIds: ['e-shop', 'e-shop'], newEntities: [] });
  });

  it('resolves two mentions of one new name to one planned entity', async () => {
    const deps = createTestDeps();

    const resolved = await resolve(deps, [
      { type: 'dependency', name: 'Redis' },
      { type: 'repository', name: 'shop-api' },
      // The same name under another type: the one planned entity is used, whatever its type.
      { type: 'repository', name: 'redis' },
    ]);

    expect(resolved).toEqual({
      entityIds: ['id-1', 'id-2', 'id-1'],
      newEntities: [
        { id: 'id-1', type: 'dependency', name: 'Redis' },
        { id: 'id-2', type: 'repository', name: 'shop-api' },
      ],
    });
  });

  it('does not see an entity in another namespace', async () => {
    const deps = createTestDeps();
    await createEntities(deps.store, [{ id: 'e-redis', type: 'dependency', name: 'redis' }], 'billing-api');

    const resolved = await resolve(deps, [{ type: 'dependency', name: 'redis' }]);

    expect(resolved.entityIds).toEqual(['id-1']);
    expect(resolved.newEntities).toHaveLength(1);
  });

  it('writes nothing', async () => {
    const deps = createTestDeps();
    await createEntities(deps.store, [{ id: 'e-redis', type: 'dependency', name: 'redis' }]);
    const countEntities = async (): Promise<number> => {
      let count = 0;
      for (const name of ['redis', 'postgres']) {
        const found = await deps.store.findEntities({ namespace: NAMESPACE, name, type: null });
        if (!found.ok) throw new Error(found.error.message);
        count += found.value.length;
      }
      return count;
    };

    await resolve(deps, [
      { type: 'dependency', name: 'redis' },
      { type: 'dependency', name: 'postgres' },
    ]);

    expect(await countEntities()).toBe(1);
  });

  it('returns a storage failure as it is', async () => {
    const deps = createTestDeps();
    const failing: MemoryStore = {
      ...deps.store,
      findEntities: async () => err('storage_failed', 'The database is not available.'),
    };

    const resolved = await resolveEntities(
      { ...deps, store: failing },
      { namespace: NAMESPACE, mentions: [{ type: 'dependency', name: 'redis' }] },
    );

    expect(!resolved.ok && resolved.error.code).toBe('storage_failed');
  });
});
