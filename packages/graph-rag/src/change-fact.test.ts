import {
  type AuditEntry,
  createTestDeps,
  type FactDraft,
  type FactId,
  type FactWithSources,
  type MemoryStore,
  type OperationDeps,
  parseDateInput,
  recordFacts,
  type Timestamp,
} from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { type ChangeFactInput, changeFact } from './change-fact.ts';
import type { StructuredFactInput } from './structured-fact-input.ts';

const NAMESPACE = 'shop-api';
const SHOP = { id: 'e-shop', type: 'repository', name: 'shop-api' } as const;
/** The moment of every change in these tests. */
const NOW = '2026-04-01';

/** Parses a calendar date or a full timestamp, for test data. */
function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

type Predicate = 'uses_database_version' | 'depends_on';

/** A fact about the shop repository with a literal value, as a draft for `recordFacts`. */
function draft(predicate: Predicate, value: string, period: { from?: string; to?: string } = {}): FactDraft {
  return {
    fact: {
      subjectEntityId: SHOP.id,
      predicate,
      object: { kind: 'value', value },
      statement: `The shop API ${predicate.replaceAll('_', ' ')} ${value}.`,
      confidence: 0.9,
      validFrom: period.from === undefined ? null : at(period.from),
      validTo: period.to === undefined ? null : at(period.to),
    },
    newEntities: [SHOP],
  };
}

/** The same kind of fact as a caller of `changeFact` gives it: by name. */
function structured(predicate: Predicate, value: string, period: { from?: string; to?: string } = {}) {
  const input: StructuredFactInput = {
    subject: { type: SHOP.type, name: SHOP.name },
    predicate,
    object: { kind: 'value', value },
    statement: `The shop API ${predicate.replaceAll('_', ' ')} ${value}.`,
    confidence: 0.9,
    validFrom: period.from === undefined ? null : at(period.from),
    validTo: period.to === undefined ? null : at(period.to),
  };
  return input;
}

/** Memory shared by the steps of one test, each step with its own fixed clock. */
function createMemory() {
  const first = createTestDeps({ now: '2026-01-10' });
  return {
    store: first.store,
    on(date: string): OperationDeps {
      return createTestDeps({ now: date, store: first.store, newId: first.newId });
    },
  };
}

/** Records facts on 2026-01-10 from one note and returns their identifiers. */
async function recordAll(
  memory: ReturnType<typeof createMemory>,
  drafts: readonly FactDraft[],
): Promise<FactId[]> {
  // Only the first draft creates the shop entity.
  const withEntityOnce = drafts.map((one, index) => (index === 0 ? one : { ...one, newEntities: [] }));
  const recorded = await recordFacts(memory.on('2026-01-10'), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: note('What the agent learned about the shop API.'),
    drafts: withEntityOnce,
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  return [...recorded.value.factIds];
}

function note(content: string) {
  return { kind: 'agent_note', locator: null, version: null, content, observedAt: at('2026-01-10') };
}

/** A report about one fact, with the defaults most tests use. */
function report(factId: FactId, overrides: Partial<ChangeFactInput> = {}): ChangeFactInput {
  return {
    namespace: NAMESPACE,
    factId,
    because: 'was_wrong',
    endedAt: null,
    explanation: 'The agent misread the lockfile.',
    replacement: null,
    trigger: 'agent',
    ...overrides,
  };
}

/** Applies a report on NOW and fails the test on an error. */
async function change(memory: ReturnType<typeof createMemory>, input: ChangeFactInput) {
  const changed = await changeFact(memory.on(NOW), input);
  if (!changed.ok) throw new Error(changed.error.message);
  return changed.value;
}

async function readFact(store: MemoryStore, factId: FactId): Promise<FactWithSources> {
  const found = await store.getFact({ namespace: NAMESPACE, factId });
  if (!found.ok || found.value === null) throw new Error(`No fact ${factId}.`);
  return found.value;
}

/** Every fact of the namespace, invalidated ones included. */
async function listAllFacts(store: MemoryStore): Promise<readonly FactWithSources[]> {
  const listed = await store.listFacts({
    namespace: NAMESPACE,
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

/** Every audit entry about a fact, a source or an entity of the namespace, oldest first. */
async function listAllAuditEntries(store: MemoryStore): Promise<AuditEntry[]> {
  const byId = new Map<number, AuditEntry>();
  const collect = async (targetKind: AuditEntry['targetKind'], targetId: string): Promise<void> => {
    const listed = await store.listAuditEntries({ namespace: NAMESPACE, targetKind, targetId });
    if (!listed.ok) throw new Error(listed.error.message);
    for (const entry of listed.value) byId.set(entry.id, entry);
  };
  const facts = await listAllFacts(store);
  for (const { fact, sources } of facts) {
    await collect('fact', fact.id);
    await collect('entity', fact.subjectEntityId);
    for (const source of sources) await collect('source', source.id);
  }
  for (const entry of [...byId.values()]) {
    if (entry.sourceId !== null) await collect('source', entry.sourceId);
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** The audit entries written after the given ones. */
async function listNewAuditEntries(store: MemoryStore, before: readonly AuditEntry[]): Promise<AuditEntry[]> {
  const known = new Set(before.map((entry) => entry.id));
  return (await listAllAuditEntries(store)).filter((entry) => !known.has(entry.id));
}

describe('changeFact', () => {
  it('corrects a wrong fact and links it to the replacement', async () => {
    const memory = createMemory();
    const [jest] = await recordAll(memory, [draft('depends_on', 'jest')]);
    if (jest === undefined) throw new Error('Nothing was recorded.');

    const changed = await change(memory, report(jest, { replacement: structured('depends_on', 'vitest') }));

    expect(changed.invalidatedFactId).toBe(jest);
    expect(changed.replacement?.fact.object).toEqual({ kind: 'value', value: 'vitest' });
    expect(changed.replacement?.subject.id).toBe(SHOP.id);
    const wrong = await readFact(memory.store, jest);
    expect(wrong.fact.invalidatedAt).toBe(at(NOW));
    expect(wrong.fact.supersededByFactId).toBe(changed.replacement?.fact.id);
  });

  it('gives the correction the valid period of the fact it corrects when none is given', async () => {
    const memory = createMemory();
    const [postgres] = await recordAll(memory, [
      draft('uses_database_version', 'postgres 15', { from: '2025-01-01', to: '2026-01-01' }),
    ]);
    if (postgres === undefined) throw new Error('Nothing was recorded.');

    const changed = await change(
      memory,
      report(postgres, { replacement: structured('uses_database_version', 'postgres 14') }),
    );

    expect([changed.replacement?.fact.validFrom, changed.replacement?.fact.validTo]).toEqual([
      at('2025-01-01'),
      at('2026-01-01'),
    ]);
  });

  it('keeps the valid period a correction gives', async () => {
    const memory = createMemory();
    const [postgres] = await recordAll(memory, [
      draft('uses_database_version', 'postgres 15', { from: '2025-01-01', to: '2026-01-01' }),
    ]);
    if (postgres === undefined) throw new Error('Nothing was recorded.');

    const changed = await change(
      memory,
      report(postgres, {
        replacement: structured('uses_database_version', 'postgres 14', { from: '2025-03-01' }),
      }),
    );

    expect([changed.replacement?.fact.validFrom, changed.replacement?.fact.validTo]).toEqual([
      at('2025-03-01'),
      null,
    ]);
  });

  it('retracts a wrong fact when no replacement is given', async () => {
    const memory = createMemory();
    const [lodash] = await recordAll(memory, [draft('depends_on', 'lodash')]);
    if (lodash === undefined) throw new Error('Nothing was recorded.');

    const changed = await change(memory, report(lodash));

    expect(changed).toEqual({ invalidatedFactId: lodash, replacement: null });
    const retracted = await readFact(memory.store, lodash);
    expect(retracted.fact.invalidatedAt).toBe(at(NOW));
    expect(retracted.fact.supersededByFactId).toBeNull();
    expect((await listAllFacts(memory.store)).map(({ fact }) => fact.id)).toEqual([lodash]);
  });

  it('ends a fact at the given moment and records its successor from that moment', async () => {
    const memory = createMemory();
    const [postgres15] = await recordAll(memory, [
      draft('uses_database_version', 'postgres 15', { from: '2025-01-01' }),
    ]);
    if (postgres15 === undefined) throw new Error('Nothing was recorded.');

    const changed = await change(
      memory,
      report(postgres15, {
        because: 'no_longer_true',
        endedAt: at('2026-03-01'),
        replacement: structured('uses_database_version', 'postgres 16'),
      }),
    );

    expect(changed.invalidatedFactId).toBe(postgres15);
    expect([changed.replacement?.fact.validFrom, changed.replacement?.fact.validTo]).toEqual([
      at('2026-03-01'),
      null,
    ]);
    const original = await readFact(memory.store, postgres15);
    if (original.fact.supersededByFactId === null) throw new Error('The original was not revised.');
    const endedCopy = await readFact(memory.store, original.fact.supersededByFactId);
    expect([endedCopy.fact.validFrom, endedCopy.fact.validTo]).toEqual([at('2025-01-01'), at('2026-03-01')]);
  });

  it('ends a fact now when no moment is given', async () => {
    const memory = createMemory();
    const [postgres15] = await recordAll(memory, [
      draft('uses_database_version', 'postgres 15', { from: '2025-01-01' }),
    ]);
    if (postgres15 === undefined) throw new Error('Nothing was recorded.');

    const changed = await change(
      memory,
      report(postgres15, {
        because: 'no_longer_true',
        endedAt: null,
        replacement: structured('uses_database_version', 'postgres 16'),
      }),
    );

    const original = await readFact(memory.store, postgres15);
    if (original.fact.supersededByFactId === null) throw new Error('The original was not revised.');
    const endedCopy = await readFact(memory.store, original.fact.supersededByFactId);
    expect(endedCopy.fact.validTo).toBe(at(NOW));
    expect(changed.replacement?.fact.validFrom).toBe(at(NOW));
  });

  it('ends a fact with no successor', async () => {
    const memory = createMemory();
    const [moment] = await recordAll(memory, [draft('depends_on', 'moment', { from: '2025-01-01' })]);
    if (moment === undefined) throw new Error('Nothing was recorded.');

    const changed = await change(
      memory,
      report(moment, { because: 'no_longer_true', endedAt: at('2026-03-15') }),
    );

    expect(changed).toEqual({ invalidatedFactId: moment, replacement: null });
    const live = (await listAllFacts(memory.store)).filter(({ fact }) => fact.invalidatedAt === null);
    expect(live.map(({ fact }) => [fact.object, fact.validTo])).toEqual([
      [{ kind: 'value', value: 'moment' }, at('2026-03-15')],
    ]);
  });

  it('stores the explanation as the content of a source and not in the audit log', async () => {
    const memory = createMemory();
    const [jest] = await recordAll(memory, [draft('depends_on', 'jest')]);
    if (jest === undefined) throw new Error('Nothing was recorded.');
    const before = await listAllAuditEntries(memory.store);
    const explanation = 'The package.json lists vitest; jest was never installed.';

    await change(memory, report(jest, { explanation, replacement: structured('depends_on', 'vitest') }));

    const written = await listNewAuditEntries(memory.store, before);
    expect(written.length).toBeGreaterThan(0);
    const [sourceId] = new Set(written.map((entry) => entry.sourceId));
    if (sourceId === undefined || sourceId === null) throw new Error('No source explains the change.');
    const source = await memory.store.getSource({ namespace: NAMESPACE, sourceId });
    expect(source.ok && source.value?.content).toBe(explanation);
    for (const entry of written) {
      expect(entry.reasonCode).toBe('reported_wrong');
      expect(entry.sourceId).toBe(sourceId);
      expect(JSON.stringify(entry)).not.toContain(explanation);
    }
  });

  it('makes one commit either way', async () => {
    for (const because of ['was_wrong', 'no_longer_true'] as const) {
      const memory = createMemory();
      const [postgres15] = await recordAll(memory, [
        draft('uses_database_version', 'postgres 15', { from: '2025-01-01' }),
      ]);
      if (postgres15 === undefined) throw new Error('Nothing was recorded.');
      const before = await listAllAuditEntries(memory.store);

      await change(
        memory,
        report(postgres15, {
          because,
          endedAt: because === 'no_longer_true' ? at('2026-03-01') : null,
          replacement: structured('uses_database_version', 'postgres 16', { from: '2026-03-01' }),
        }),
      );

      const written = await listNewAuditEntries(memory.store, before);
      expect(written.length, because).toBeGreaterThan(1);
      expect(new Set(written.map((entry) => entry.operationId)).size, because).toBe(1);
    }
  });

  it('never removes a fact row', async () => {
    const memory = createMemory();
    const [jest, lodash, postgres15, moment] = await recordAll(memory, [
      draft('depends_on', 'jest'),
      draft('depends_on', 'lodash'),
      draft('uses_database_version', 'postgres 15', { from: '2025-01-01' }),
      draft('depends_on', 'moment', { from: '2025-01-01' }),
    ]);
    if (jest === undefined || lodash === undefined || postgres15 === undefined || moment === undefined) {
      throw new Error('Nothing was recorded.');
    }
    const reports = [
      report(jest, { replacement: structured('depends_on', 'vitest') }),
      report(lodash),
      report(postgres15, {
        because: 'no_longer_true',
        endedAt: at('2026-03-01'),
        replacement: structured('uses_database_version', 'postgres 16'),
      }),
      report(moment, { because: 'no_longer_true', endedAt: at('2026-03-15') }),
    ];

    for (const input of reports) {
      const before = (await listAllFacts(memory.store)).map(({ fact }) => fact.id);
      await change(memory, input);
      const after = (await listAllFacts(memory.store)).map(({ fact }) => fact.id);
      expect(after).toEqual(expect.arrayContaining(before));
    }
  });

  it('returns already_invalidated with the superseding fact when the fact is no longer live', async () => {
    const memory = createMemory();
    const [jest] = await recordAll(memory, [draft('depends_on', 'jest')]);
    if (jest === undefined) throw new Error('Nothing was recorded.');
    const first = await change(memory, report(jest, { replacement: structured('depends_on', 'vitest') }));

    const again = await changeFact(memory.on(NOW), report(jest));

    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe('already_invalidated');
    expect(again.error.relatedFactIds).toEqual([first.replacement?.fact.id]);
  });

  it('returns not_found for a fact in another namespace', async () => {
    const memory = createMemory();
    const [jest] = await recordAll(memory, [draft('depends_on', 'jest')]);
    if (jest === undefined) throw new Error('Nothing was recorded.');

    const changed = await changeFact(memory.on(NOW), { ...report(jest), namespace: 'billing-worker' });

    expect(changed.ok).toBe(false);
    if (changed.ok) return;
    expect(changed.error.code).toBe('not_found');
  });

  it('returns conflict when the replacement overlaps another live fact', async () => {
    const memory = createMemory();
    const [postgres15, postgres16] = await recordAll(memory, [
      draft('uses_database_version', 'postgres 15', { from: '2025-01-01', to: '2026-01-01' }),
      draft('uses_database_version', 'postgres 16', { from: '2026-01-01' }),
    ]);
    if (postgres15 === undefined || postgres16 === undefined) throw new Error('Nothing was recorded.');

    const changed = await changeFact(
      memory.on(NOW),
      report(postgres15, {
        replacement: structured('uses_database_version', 'postgres 14', { from: '2025-01-01' }),
      }),
    );

    expect(changed.ok).toBe(false);
    if (changed.ok) return;
    expect(changed.error.code).toBe('conflict');
    expect(changed.error.relatedFactIds).toContain(postgres16);
  });

  it('returns invalid_input when an end is given for a wrong fact', async () => {
    const memory = createMemory();
    const [jest] = await recordAll(memory, [draft('depends_on', 'jest')]);
    if (jest === undefined) throw new Error('Nothing was recorded.');

    const changed = await changeFact(memory.on(NOW), report(jest, { endedAt: at('2026-03-01') }));

    expect(changed.ok).toBe(false);
    if (changed.ok) return;
    expect(changed.error.code).toBe('invalid_input');
  });

  it('returns invalid_input for an empty explanation, an unknown type or predicate, or a confidence outside 0 to 1', async () => {
    const memory = createMemory();
    const [jest] = await recordAll(memory, [draft('depends_on', 'jest')]);
    if (jest === undefined) throw new Error('Nothing was recorded.');
    const vitest = structured('depends_on', 'vitest');
    const reports = [
      report(jest, { explanation: '   ' }),
      report(jest, { replacement: { ...vitest, subject: { type: 'galaxy', name: 'shop-api' } } }),
      report(jest, {
        replacement: { ...vitest, object: { kind: 'entity', type: 'galaxy', name: 'vitest' } },
      }),
      report(jest, { replacement: { ...vitest, predicate: 'loves' } }),
      report(jest, { replacement: { ...vitest, confidence: 1.5 } }),
    ];

    for (const input of reports) {
      const changed = await changeFact(memory.on(NOW), input);
      expect(changed.ok).toBe(false);
      if (changed.ok) return;
      expect(changed.error.code).toBe('invalid_input');
    }
    expect((await readFact(memory.store, jest)).fact.invalidatedAt).toBeNull();
  });

  it('lists the allowed values when a type or predicate is unknown', async () => {
    const memory = createMemory();
    const [jest] = await recordAll(memory, [draft('depends_on', 'jest')]);
    if (jest === undefined) throw new Error('Nothing was recorded.');
    const vitest = structured('depends_on', 'vitest');

    const unknownType = await changeFact(
      memory.on(NOW),
      report(jest, { replacement: { ...vitest, subject: { type: 'galaxy', name: 'shop-api' } } }),
    );
    const unknownPredicate = await changeFact(
      memory.on(NOW),
      report(jest, { replacement: { ...vitest, predicate: 'loves' } }),
    );

    expect(unknownType.ok || unknownType.error.message).toContain('repository, dependency');
    expect(unknownPredicate.ok || unknownPredicate.error.message).toContain(
      'uses_database_version, depends_on',
    );
  });

  it('refuses an explanation that contains a secret and writes nothing', async () => {
    const memory = createMemory();
    const [jest] = await recordAll(memory, [draft('depends_on', 'jest')]);
    if (jest === undefined) throw new Error('Nothing was recorded.');
    const beforeFacts = await listAllFacts(memory.store);
    const beforeAudit = await listAllAuditEntries(memory.store);
    // Joined at run time, so that no file in the repository holds a credential format.
    const token = ['gh', 'p_', 'aB3dE5gH7jK9mN1pQ2rS4tU6vW8xY0zaB3dE5'].join('');

    const changed = await changeFact(
      memory.on(NOW),
      report(jest, { explanation: `CI failed because it used ${token} to install jest.` }),
    );

    expect(changed.ok).toBe(false);
    if (changed.ok) return;
    expect(changed.error.code).toBe('invalid_input');
    expect(changed.error.message).toContain('github_token');
    expect(await listAllFacts(memory.store)).toEqual(beforeFacts);
    expect(await listAllAuditEntries(memory.store)).toEqual(beforeAudit);
  });

  it('refuses a replacement that contains a secret', async () => {
    const memory = createMemory();
    const [jest] = await recordAll(memory, [draft('depends_on', 'jest')]);
    if (jest === undefined) throw new Error('Nothing was recorded.');
    const url = ['https://', 'deploy', ':', 'hunter2horse', '@', 'registry.example.com/vitest'].join('');

    const changed = await changeFact(
      memory.on(NOW),
      report(jest, { replacement: structured('depends_on', url) }),
    );

    expect(changed.ok).toBe(false);
    if (changed.ok) return;
    expect(changed.error.code).toBe('invalid_input');
    expect(changed.error.message).toContain('replacement.statement');
  });
});
