import { createInMemoryStore, type FactWithSources, parseDateInput } from '@kronomind/core';
import { describe, expect, it } from 'vitest';
import { buildSyntheticNamespace } from './build-synthetic-namespace.ts';

const createdAt = parseDateInput('2026-01-01');
if (!createdAt.ok) throw new Error(createdAt.error.message);

const OPTIONS = {
  namespace: 'bench:test',
  size: 100,
  seed: 20261116,
  dimensions: 384,
  createdAt: createdAt.value,
  batchSize: 30,
} as const;

async function listAll(store: ReturnType<typeof createInMemoryStore>): Promise<readonly FactWithSources[]> {
  const listed = await store.listFacts({
    namespace: OPTIONS.namespace,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time: 'all',
    limit: 1000,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value;
}

describe('buildSyntheticNamespace', () => {
  it('builds the same namespace from the same seed', async () => {
    const first = await buildSyntheticNamespace(createInMemoryStore(), OPTIONS);
    const second = await buildSyntheticNamespace(createInMemoryStore(), OPTIONS);

    if (!first.ok || !second.ok) throw new Error('The namespace was not built.');
    expect(first.value.factIds).toHaveLength(100);
    expect(second.value.factIds).toEqual(first.value.factIds);
    expect(second.value.firstVector).toEqual(first.value.firstVector);
    expect(first.value.firstVector).toHaveLength(384);
  });

  it('ends a fifth of the facts and invalidates a tenth', async () => {
    const store = createInMemoryStore();
    await buildSyntheticNamespace(store, OPTIONS);

    const facts = await listAll(store);

    expect(facts).toHaveLength(100);
    expect(facts.filter((found) => found.fact.validTo !== null)).toHaveLength(20);
    expect(facts.filter((found) => found.fact.invalidatedAt !== null)).toHaveLength(10);
  });
});
