import { createTestDeps, type MemoryStore, parseDateInput, type Timestamp } from '@kronomind/core';
import { describe, expect, it } from 'vitest';
import { recordStructuredFacts } from './record-structured-facts.ts';
import type { StructuredFactInput } from './structured-fact-input.ts';

// createTestDeps gives a scripted LLM with no responses, which throws if it is called: every
// test below therefore also shows that no LLM call is made.

const NAMESPACE = 'repo:shop-api';
const SOURCE = { kind: 'agent_note', locator: null, version: null } as const;
const SHOP = { type: 'repository', name: 'shop-api' } as const;

function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function postgres(version: string, overrides: Partial<StructuredFactInput> = {}): StructuredFactInput {
  return {
    subject: SHOP,
    predicate: 'uses_database_version',
    object: { kind: 'value', value: `postgres ${version}` },
    statement: `shop-api runs on Postgres ${version}.`,
    confidence: 1,
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

function dependsOn(name: string): StructuredFactInput {
  return {
    subject: SHOP,
    predicate: 'depends_on',
    object: { kind: 'entity', type: 'dependency', name },
    statement: `shop-api depends on ${name}.`,
    confidence: 1,
    validFrom: null,
    validTo: null,
  };
}

/** One memory that several calls share, each on its own day. */
function createMemory() {
  const first = createTestDeps({ now: '2026-01-10' });
  const record = (now: string, facts: readonly StructuredFactInput[], source = SOURCE) =>
    recordStructuredFacts(createTestDeps({ now, store: first.store, newId: first.newId }), {
      namespace: NAMESPACE,
      facts,
      source,
      trigger: 'agent',
    });
  return { store: first.store, record };
}

async function countFacts(store: MemoryStore): Promise<number> {
  const listed = await store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time: 'all',
    limit: 100,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.length;
}

async function recordedIds(result: Awaited<ReturnType<typeof recordStructuredFacts>>): Promise<string[]> {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value.facts.map((fact) => fact.fact.id);
}

describe('recordStructuredFacts', () => {
  it('records a structured fact and creates its entities', async () => {
    const memory = createMemory();

    const result = await memory.record('2026-01-10', [dependsOn('zod')]);

    if (!result.ok) throw new Error(result.error.message);
    const [fact] = result.value.facts;
    expect(fact?.outcome).toBe('recorded');
    expect(fact?.subject.name).toBe('shop-api');
    expect(fact?.objectEntity?.name).toBe('zod');
    expect(fact?.sources.map((source) => [source.kind, source.content, source.observedAt])).toEqual([
      ['agent_note', null, at('2026-01-10')],
    ]);
  });

  it('attaches the source to a live fact that is given again', async () => {
    const memory = createMemory();
    const [first] = await recordedIds(await memory.record('2026-01-10', [postgres('15')]));

    const second = await memory.record('2026-02-01', [postgres('15')]);

    if (!second.ok) throw new Error(second.error.message);
    expect(second.value.facts.map((fact) => [fact.fact.id, fact.outcome, fact.sources.length])).toEqual([
      [first, 'restated', 2],
    ]);
    expect(await countFacts(memory.store)).toBe(1);
  });

  it('returns conflict and names the stored fact when a single-valued predicate already has another value', async () => {
    const memory = createMemory();
    const [stored] = await recordedIds(await memory.record('2026-01-10', [postgres('15')]));

    const result = await memory.record('2026-02-01', [postgres('16')]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('conflict');
      expect(result.error.relatedFactIds).toEqual([stored]);
    }
  });

  it('records nothing when one of several facts conflicts', async () => {
    const memory = createMemory();
    await memory.record('2026-01-10', [postgres('15')]);

    const result = await memory.record('2026-02-01', [dependsOn('zod'), postgres('16')]);

    expect(result.ok).toBe(false);
    expect(await countFacts(memory.store)).toBe(1);
    const zod = await memory.store.findEntities({ namespace: NAMESPACE, name: 'zod', type: null });
    expect(zod.ok && zod.value).toEqual([]);
  });

  it('returns conflict when two facts in one call conflict with each other', async () => {
    const memory = createMemory();

    const result = await memory.record('2026-01-10', [postgres('15'), postgres('16')]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('conflict');
      expect(result.error.relatedFactIds).toEqual([]);
    }
    expect(await countFacts(memory.store)).toBe(0);
  });

  it('records both values of a multi-valued predicate', async () => {
    const memory = createMemory();

    const ids = await recordedIds(await memory.record('2026-01-10', [dependsOn('zod'), dependsOn('yaml')]));

    expect(ids).toHaveLength(2);
  });

  it('returns invalid_input and lists the allowed predicates for an unknown predicate', async () => {
    const memory = createMemory();

    const result = await memory.record('2026-01-10', [postgres('15', { predicate: 'runs_on' })]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_input');
      expect(result.error.message).toContain('uses_database_version, depends_on');
    }
  });

  it('returns invalid_input and lists the allowed entity types for an unknown entity type', async () => {
    const memory = createMemory();

    const result = await memory.record('2026-01-10', [
      { ...dependsOn('zod'), object: { kind: 'entity', type: 'library', name: 'zod' } },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_input');
      expect(result.error.message).toContain('repository, dependency');
    }
  });

  it('refuses an unknown entity type even when an entity with that name exists', async () => {
    const memory = createMemory();
    await memory.record('2026-01-10', [dependsOn('zod')]);

    const result = await memory.record('2026-02-01', [
      { ...dependsOn('zod'), subject: { type: 'service', name: 'shop-api' } },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
  });

  it('returns invalid_input for a confidence outside 0 to 1, or a period that ends before it starts', async () => {
    const memory = createMemory();

    const confidence = await memory.record('2026-01-10', [postgres('15', { confidence: 1.5 })]);
    const period = await memory.record('2026-01-10', [
      postgres('15', { validFrom: at('2026-02-01'), validTo: at('2026-01-01') }),
    ]);
    const empty = await memory.record('2026-01-10', []);

    for (const result of [confidence, period, empty]) {
      expect(result.ok || result.error.code).toBe('invalid_input');
    }
  });

  it('returns invalid_input when the same fact is given twice', async () => {
    const memory = createMemory();

    const result = await memory.record('2026-01-10', [dependsOn('zod'), dependsOn('Zod ')]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
    expect(await countFacts(memory.store)).toBe(0);
  });

  it('refuses a statement that contains a secret and writes nothing', async () => {
    const memory = createMemory();
    const token = ['gh', 'p_', 'a'.repeat(36)].join('');

    const result = await memory.record('2026-01-10', [
      postgres('15', { statement: `Deploy with the token ${token}.` }),
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
    expect(await countFacts(memory.store)).toBe(0);
  });

  it('writes everything in one commit', async () => {
    const memory = createMemory();
    const [stored] = await recordedIds(await memory.record('2026-01-10', [postgres('15')]));

    const result = await memory.record('2026-02-01', [postgres('15'), dependsOn('zod')]);

    if (!result.ok) throw new Error(result.error.message);
    const [restated, recorded] = result.value.facts;
    expect([restated?.outcome, recorded?.outcome]).toEqual(['restated', 'recorded']);
    const targets = [
      { targetKind: 'fact', targetId: stored ?? '', action: 'fact.source_attached' },
      { targetKind: 'fact', targetId: recorded?.fact.id ?? '', action: 'fact.recorded' },
      { targetKind: 'entity', targetId: recorded?.objectEntity?.id ?? '', action: 'entity.created' },
      { targetKind: 'source', targetId: restated?.sources[1]?.id ?? '', action: 'source.recorded' },
    ] as const;
    const operationIds = new Set<string>();
    for (const target of targets) {
      const entries = await memory.store.listAuditEntries({
        namespace: NAMESPACE,
        targetKind: target.targetKind,
        targetId: target.targetId,
      });
      if (!entries.ok) throw new Error(entries.error.message);
      const matching = entries.value.filter((entry) => entry.action === target.action);
      expect(matching, target.action).toHaveLength(1);
      for (const entry of matching) operationIds.add(entry.operationId);
    }
    expect(operationIds.size).toBe(1);
  });

  it('records with the reason restated when the call only attaches the source', async () => {
    const memory = createMemory();
    await memory.record('2026-01-10', [postgres('15')]);

    const result = await memory.record('2026-02-01', [postgres('15')]);

    if (!result.ok) throw new Error(result.error.message);
    const sourceId = result.value.facts[0]?.sources[1]?.id ?? '';
    const entries = await memory.store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'source',
      targetId: sourceId,
    });
    expect(entries.ok && entries.value.map((entry) => entry.reasonCode)).toEqual(['restated']);
  });

  it('restates a value given again with the same unit, and treats it in another unit as a different value', async () => {
    const memory = createMemory();
    const inUnit = (unit: string) => postgres('16', { object: { kind: 'value', value: '16', unit } });
    await memory.record('2026-01-10', [inUnit('major-version')]);

    const same = await memory.record('2026-01-11', [inUnit('major-version')]);
    const other = await memory.record('2026-01-12', [inUnit('minor-version')]);

    expect(same.ok && same.value.facts.map((fact) => fact.outcome)).toEqual(['restated']);
    // The predicate holds one value at a time, so a different value conflicts instead of restating.
    expect(other.ok ? null : other.error.code).toBe('conflict');
    expect(await countFacts(memory.store)).toBe(1);
  });
});
