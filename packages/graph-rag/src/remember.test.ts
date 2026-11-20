import {
  type ConflictJudge,
  createTestDeps,
  type Domain,
  err,
  type FactWithSources,
  type LlmClient,
  type MemoryStore,
  parseDateInput,
  TEST_DOMAIN,
  type Timestamp,
} from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { type RememberResult, remember } from './remember.ts';

const NAMESPACE = 'repo:shop-api';
const SOURCE = { kind: 'agent_note', locator: null, version: null } as const;
const SHOP = { type: 'repository', name: 'shop-api' } as const;

function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

/** A fact as the extraction step's model returns it. */
function extracted(fact: {
  predicate: string;
  object: { type: string; name: string } | { value: string };
  subject?: { type: string; name: string };
  valid_from?: string | null;
  valid_to?: string | null;
}) {
  const objectText = 'value' in fact.object ? fact.object.value : fact.object.name;
  return {
    subject: SHOP,
    statement: `shop-api ${fact.predicate.replaceAll('_', ' ')} ${objectText}.`,
    confidence: 0.9,
    valid_from: null,
    valid_to: null,
    ...fact,
  };
}

const postgres = (version: string, from: string | null = null, to: string | null = null) =>
  extracted({
    predicate: 'uses_database_version',
    object: { value: `postgres ${version}` },
    valid_from: from,
    valid_to: to,
  });
const dependsOn = (name: string) =>
  extracted({ predicate: 'depends_on', object: { type: 'dependency', name } });

/** One memory that several calls share, each on its own day with its own scripted answer. */
function createMemory() {
  const first = createTestDeps({ now: '2026-01-10' });
  const run = async (options: { now: string; text: string; facts: readonly unknown[] }) => {
    const deps = createTestDeps({
      now: options.now,
      store: first.store,
      newId: first.newId,
      llmResponses: [{ facts: options.facts }],
    });
    const result = await remember(deps, {
      namespace: NAMESPACE,
      text: options.text,
      source: SOURCE,
      trigger: 'agent',
    });
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    return result.value;
  };
  return { store: first.store, newId: first.newId, run };
}

async function listAll(store: MemoryStore): Promise<readonly FactWithSources[]> {
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
  return listed.value;
}

function onlyFact(result: RememberResult) {
  const [fact] = result.facts;
  if (fact === undefined || result.facts.length !== 1)
    throw new Error(`Expected one fact, got ${result.facts.length}.`);
  return fact;
}

describe('remember', () => {
  it('records a new fact with the text as its source', async () => {
    const memory = createMemory();

    const result = await memory.run({
      now: '2026-01-10',
      text: 'We run Postgres 15.',
      facts: [postgres('15')],
    });

    const fact = onlyFact(result);
    expect(fact.outcome).toBe('recorded');
    expect(fact.fact.object).toEqual({ kind: 'value', value: 'postgres 15' });
    expect(fact.sources.map((source) => [source.kind, source.content, source.observedAt])).toEqual([
      ['agent_note', 'We run Postgres 15.', at('2026-01-10')],
    ]);
    expect(result.skipped).toEqual([]);
  });

  it('attaches the source to a live fact that is stated again and records no second fact', async () => {
    const memory = createMemory();
    const first = await memory.run({
      now: '2026-01-10',
      text: 'We run Postgres 15.',
      facts: [postgres('15')],
    });

    const second = await memory.run({
      now: '2026-02-01',
      text: 'Still on Postgres 15.',
      facts: [postgres('15')],
    });

    const fact = onlyFact(second);
    expect(fact.outcome).toBe('restated');
    expect(fact.fact.id).toBe(onlyFact(first).fact.id);
    expect(fact.sources.map((source) => source.content)).toEqual([
      'We run Postgres 15.',
      'Still on Postgres 15.',
    ]);
    expect(await listAll(memory.store)).toHaveLength(1);
  });

  it('skips a fact that conflicts with a stored fact and names the fact in the way', async () => {
    const memory = createMemory();
    const first = await memory.run({
      now: '2026-01-10',
      text: 'We run Postgres 15.',
      facts: [postgres('15')],
    });

    const second = await memory.run({
      now: '2026-02-01',
      text: 'We run Postgres 16.',
      facts: [postgres('16')],
    });

    expect(second.facts).toEqual([]);
    expect(second.skipped).toEqual([
      {
        statement: 'shop-api uses database version postgres 16.',
        reason: 'conflicts_with_stored_fact',
        conflictingFactIds: [onlyFact(first).fact.id],
      },
    ]);
    expect(await listAll(memory.store)).toHaveLength(1);
  });

  it('skips both facts when two facts in one text conflict with each other', async () => {
    const memory = createMemory();

    const result = await memory.run({
      now: '2026-01-10',
      text: 'We run Postgres 15. We run Postgres 16.',
      facts: [postgres('15'), postgres('16')],
    });

    expect(result.facts).toEqual([]);
    expect(result.skipped.map((skipped) => [skipped.reason, skipped.conflictingFactIds])).toEqual([
      ['conflicts_within_text', []],
      ['conflicts_within_text', []],
    ]);
  });

  it('records both values of a multi-valued predicate', async () => {
    const memory = createMemory();

    const result = await memory.run({
      now: '2026-01-10',
      text: 'shop-api depends on zod and yaml.',
      facts: [dependsOn('zod'), dependsOn('yaml')],
    });

    expect(result.facts.map((fact) => fact.outcome)).toEqual(['recorded', 'recorded']);
    expect(await listAll(memory.store)).toHaveLength(2);
  });

  it('does not skip an unrelated fact about the same subject', async () => {
    const memory = createMemory();
    await memory.run({ now: '2026-01-10', text: 'We run Postgres 15.', facts: [postgres('15')] });

    const result = await memory.run({
      now: '2026-02-01',
      text: 'shop-api depends on zod.',
      facts: [dependsOn('zod')],
    });

    expect(onlyFact(result).outcome).toBe('recorded');
    expect(result.skipped).toEqual([]);
  });

  it('records an older fact whose valid period ends before the current one starts', async () => {
    const memory = createMemory();
    await memory.run({
      now: '2026-03-05',
      text: 'We run Postgres 16 since 1 March.',
      facts: [postgres('16', '2026-03-01')],
    });

    const result = await memory.run({
      now: '2026-03-06',
      text: 'Before March we ran Postgres 15, from the start of 2025.',
      facts: [postgres('15', '2025-01-01', '2026-03-01')],
    });

    expect(onlyFact(result).outcome).toBe('recorded');
    expect(await listAll(memory.store)).toHaveLength(2);
  });

  it('records one fact when the text states it twice', async () => {
    const memory = createMemory();

    const result = await memory.run({
      now: '2026-01-10',
      text: 'We run Postgres 15. Yes, Postgres 15.',
      facts: [postgres('15'), postgres('15')],
    });

    expect(onlyFact(result).outcome).toBe('recorded');
    expect(await listAll(memory.store)).toHaveLength(1);
  });

  it('returns two empty lists and writes nothing when nothing is extracted', async () => {
    const memory = createMemory();

    const result = await memory.run({ now: '2026-01-10', text: 'Thanks, that worked.', facts: [] });

    expect(result).toEqual({ facts: [], skipped: [] });
    expect(await listAll(memory.store)).toEqual([]);
  });

  it('writes nothing when every fact is skipped', async () => {
    const memory = createMemory();
    await memory.run({ now: '2026-01-10', text: 'We run Postgres 15.', facts: [postgres('15')] });

    await memory.run({ now: '2026-02-01', text: 'We run Postgres 16.', facts: [postgres('16')] });

    const sources = (await listAll(memory.store)).flatMap((fact) => fact.sources);
    expect(sources.map((source) => source.content)).toEqual(['We run Postgres 15.']);
  });

  it('creates no entity that only a skipped fact uses', async () => {
    const memory = createMemory();
    const database = (name: string) =>
      extracted({ predicate: 'uses_database_version', object: { type: 'dependency', name } });
    await memory.run({
      now: '2026-01-10',
      text: 'shop-api uses PostgreSQL.',
      facts: [database('PostgreSQL')],
    });

    const result = await memory.run({
      now: '2026-02-01',
      text: 'shop-api uses MySQL, and depends on zod.',
      facts: [database('MySQL'), dependsOn('zod')],
    });

    expect(result.skipped.map((skipped) => skipped.reason)).toEqual(['conflicts_with_stored_fact']);
    expect(onlyFact(result).outcome).toBe('recorded');
    const mysql = await memory.store.findEntities({ namespace: NAMESPACE, name: 'MySQL', type: null });
    const zod = await memory.store.findEntities({ namespace: NAMESPACE, name: 'zod', type: null });
    expect(mysql.ok && mysql.value).toEqual([]);
    expect(zod.ok && zod.value).toHaveLength(1);
  });

  it('reuses an existing entity of another type when it is the only one with that name', async () => {
    const memory = createMemory();
    await memory.run({
      now: '2026-01-10',
      text: 'The zod repository depends on vitest.',
      facts: [
        extracted({
          subject: { type: 'repository', name: 'zod' },
          predicate: 'depends_on',
          object: { type: 'dependency', name: 'vitest' },
        }),
      ],
    });
    const before = await memory.store.findEntities({ namespace: NAMESPACE, name: 'zod', type: null });
    if (!before.ok) throw new Error(before.error.message);
    const [zodRepository] = before.value;

    const result = await memory.run({
      now: '2026-02-01',
      text: 'shop-api depends on Zod.',
      facts: [dependsOn('Zod')],
    });

    expect(onlyFact(result).fact.object).toEqual({ kind: 'entity', entityId: zodRepository?.id });
    const after = await memory.store.findEntities({ namespace: NAMESPACE, name: 'zod', type: null });
    expect(after.ok && after.value.map((entity) => entity.type)).toEqual(['repository']);
  });

  it('writes everything but the corrections in one commit', async () => {
    const memory = createMemory();
    const first = await memory.run({
      now: '2026-01-10',
      text: 'We run Postgres 15.',
      facts: [postgres('15')],
    });

    const second = await memory.run({
      now: '2026-02-01',
      text: 'Still Postgres 15, and shop-api depends on zod.',
      facts: [postgres('15'), dependsOn('zod')],
    });

    const [restated, recorded] = second.facts;
    expect([restated?.outcome, recorded?.outcome]).toEqual(['restated', 'recorded']);
    const newSourceId = restated?.sources[1]?.id ?? '';
    const targets = [
      { targetKind: 'fact', targetId: onlyFact(first).fact.id, action: 'fact.source_attached' },
      { targetKind: 'fact', targetId: recorded?.fact.id ?? '', action: 'fact.recorded' },
      { targetKind: 'source', targetId: newSourceId, action: 'source.recorded' },
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

  it('records with the reason stated when a fact is new, and restated when it only attaches the source', async () => {
    const memory = createMemory();
    const first = await memory.run({
      now: '2026-01-10',
      text: 'We run Postgres 15.',
      facts: [postgres('15')],
    });
    const second = await memory.run({
      now: '2026-02-01',
      text: 'Still Postgres 15.',
      facts: [postgres('15')],
    });

    const reasons = async (targetKind: 'fact' | 'source', targetId: string) => {
      const entries = await memory.store.listAuditEntries({ namespace: NAMESPACE, targetKind, targetId });
      if (!entries.ok) throw new Error(entries.error.message);
      return entries.value.map((entry) => [entry.action, entry.reasonCode, entry.trigger]);
    };

    expect(await reasons('fact', onlyFact(first).fact.id)).toEqual([
      ['fact.recorded', 'stated', 'agent'],
      ['fact.source_attached', 'restated', 'agent'],
    ]);
    expect(await reasons('source', onlyFact(second).sources[1]?.id ?? '')).toEqual([
      ['source.recorded', 'restated', 'agent'],
    ]);
  });

  it('refuses a text that contains a secret before calling the LLM', async () => {
    const deps = { ...createTestDeps({ now: '2026-01-10' }), llm: UNREACHABLE_LLM };
    const token = ['gh', 'p_', 'a'.repeat(36)].join('');

    const result = await remember(deps, {
      namespace: NAMESPACE,
      text: `Deploy with the token ${token}.`,
      source: SOURCE,
      trigger: 'agent',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
    expect(await listAll(deps.store)).toEqual([]);
  });

  it('refuses a source locator that contains a secret', async () => {
    const deps = { ...createTestDeps({ now: '2026-01-10' }), llm: UNREACHABLE_LLM };
    const locator = ['https://', 'deploy', ':', 'hunter2horse', '@', 'git.example.com/shop.git'].join('');

    const result = await remember(deps, {
      namespace: NAMESPACE,
      text: 'We run Postgres 15.',
      source: { ...SOURCE, locator },
      trigger: 'agent',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
  });

  it('refuses an empty text or an empty source kind', async () => {
    const deps = { ...createTestDeps({ now: '2026-01-10' }), llm: UNREACHABLE_LLM };

    const emptyText = await remember(deps, {
      namespace: NAMESPACE,
      text: '  ',
      source: SOURCE,
      trigger: 'agent',
    });
    const emptyKind = await remember(deps, {
      namespace: NAMESPACE,
      text: 'We run Postgres 15.',
      source: { ...SOURCE, kind: '' },
      trigger: 'agent',
    });

    expect(emptyText.ok || emptyText.error.code).toBe('invalid_input');
    expect(emptyKind.ok || emptyKind.error.code).toBe('invalid_input');
  });

  it('returns llm_failed and writes nothing when extraction fails', async () => {
    const deps = createTestDeps({ now: '2026-01-10', llmResponses: [{ facts: 'not a list' }] });

    const result = await remember(deps, {
      namespace: NAMESPACE,
      text: 'We run Postgres 15.',
      source: SOURCE,
      trigger: 'agent',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('llm_failed');
    expect(await listAll(deps.store)).toEqual([]);
  });
});

/** An LLM client that fails the test if it is called. */
const UNREACHABLE_LLM: LlmClient = {
  generateObject() {
    throw new Error('The LLM was called.');
  },
};

describe('remember with a conflict judge', () => {
  type Verdicts = Awaited<ReturnType<ConflictJudge>>;

  /** A judge that answers the same for every call, and counts its calls. */
  function scriptedJudge(answer: Verdicts) {
    const calls: unknown[] = [];
    const judge: ConflictJudge = (input) => {
      calls.push(input);
      return Promise.resolve(answer);
    };
    return { judge, calls };
  }

  /** Postgres 15 recorded on 10 January; then a second text is remembered with the judge given. */
  async function rememberAfterPostgres15(options: {
    readonly judge: ConflictJudge;
    readonly facts: readonly unknown[];
    readonly domain?: Domain;
    readonly wrapStore?: (store: MemoryStore) => MemoryStore;
  }) {
    const first = createTestDeps({ now: '2026-01-10', llmResponses: [{ facts: [postgres('15')] }] });
    const stored = await remember(first, {
      namespace: NAMESPACE,
      text: 'We run Postgres 15.',
      source: SOURCE,
      trigger: 'agent',
    });
    if (!stored.ok) throw new Error(stored.error.message);
    const storedFact = onlyFact(stored.value);
    const second = createTestDeps({
      now: '2026-04-02',
      store: options.wrapStore === undefined ? first.store : options.wrapStore(first.store),
      newId: first.newId,
      llmResponses: [{ facts: options.facts }],
      ...(options.domain === undefined ? {} : { domain: options.domain }),
    });
    const result = await remember(
      { ...second, judge: options.judge },
      {
        namespace: NAMESPACE,
        text: 'We moved to Postgres 16 on 20 March.',
        source: SOURCE,
        trigger: 'agent',
      },
    );
    return { result, storedFact, store: first.store };
  }

  async function readFact(store: MemoryStore, factId: string) {
    const read = await store.getFact({ namespace: NAMESPACE, factId });
    if (!read.ok || read.value === null) throw new Error(`No fact ${factId}.`);
    return read.value;
  }

  async function reasonCodesOf(store: MemoryStore, factId: string) {
    const entries = await store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'fact',
      targetId: factId,
    });
    if (!entries.ok) throw new Error(entries.error.message);
    return entries.value.map((entry) => [entry.operation, entry.action, entry.reasonCode]);
  }

  it('ends the stored fact at the moment of change and records the new one as its successor', async () => {
    const { judge } = scriptedJudge({
      ok: true,
      value: [{ kind: 'succession', changedAt: at('2026-03-20') }],
    });

    const { result, storedFact, store } = await rememberAfterPostgres15({
      judge,
      facts: [postgres('16', '2026-03-20')],
    });

    if (!result.ok) throw new Error(result.error.message);
    const successor = onlyFact(result.value);
    expect(successor.fact.object).toEqual({ kind: 'value', value: 'postgres 16' });
    expect(successor.supersedes).toEqual({ factId: storedFact.fact.id, kind: 'succession' });
    expect((await readFact(store, storedFact.fact.id)).fact.invalidatedAt).toBe(at('2026-04-02'));
    const live = (await listAll(store)).filter((fact) => fact.fact.invalidatedAt === null);
    expect(live.map((fact) => [fact.fact.object, fact.fact.validFrom, fact.fact.validTo])).toEqual(
      expect.arrayContaining([
        [{ kind: 'value', value: 'postgres 15' }, null, at('2026-03-20')],
        [{ kind: 'value', value: 'postgres 16' }, at('2026-03-20'), null],
      ]),
    );
    expect(result.value.skipped).toEqual([]);
  });

  it('marks the changes of a succession it made with judged_ended', async () => {
    const { judge } = scriptedJudge({
      ok: true,
      value: [{ kind: 'succession', changedAt: at('2026-03-20') }],
    });

    const { result, storedFact, store } = await rememberAfterPostgres15({
      judge,
      facts: [postgres('16', '2026-03-20')],
    });

    if (!result.ok) throw new Error(result.error.message);
    expect(await reasonCodesOf(store, storedFact.fact.id)).toContainEqual([
      'succession',
      'fact.invalidated',
      'judged_ended',
    ]);
    expect(await reasonCodesOf(store, onlyFact(result.value).fact.id)).toEqual([
      ['succession', 'fact.recorded', 'judged_ended'],
    ]);
  });

  it('invalidates a stored fact judged wrong, marked judged_wrong, with the new fact as its replacement', async () => {
    const { judge } = scriptedJudge({ ok: true, value: [{ kind: 'correction' }] });

    const { result, storedFact, store } = await rememberAfterPostgres15({ judge, facts: [postgres('16')] });

    if (!result.ok) throw new Error(result.error.message);
    const replacement = onlyFact(result.value);
    expect(replacement.supersedes).toEqual({ factId: storedFact.fact.id, kind: 'correction' });
    const wrong = await readFact(store, storedFact.fact.id);
    expect(wrong.fact.supersededByFactId).toBe(replacement.fact.id);
    expect(await reasonCodesOf(store, storedFact.fact.id)).toContainEqual([
      'correction',
      'fact.invalidated',
      'judged_wrong',
    ]);
  });

  it('leaves the stored fact live and skips the new fact when the judge fails', async () => {
    const { judge } = scriptedJudge(err('llm_failed', 'The judge could not decide.'));

    const { result, storedFact, store } = await rememberAfterPostgres15({ judge, facts: [postgres('16')] });

    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.facts).toEqual([]);
    expect(result.value.skipped).toMatchObject([
      { reason: 'conflicts_with_stored_fact', conflictingFactIds: [storedFact.fact.id] },
    ]);
    expect((await readFact(store, storedFact.fact.id)).fact.invalidatedAt).toBeNull();
  });

  it('changes no stored fact under the correction policy human_approval, and does not ask the judge', async () => {
    const { judge, calls } = scriptedJudge({ ok: true, value: [{ kind: 'correction' }] });

    const { result, storedFact, store } = await rememberAfterPostgres15({
      judge,
      facts: [postgres('16')],
      domain: { ...TEST_DOMAIN, correctionPolicy: 'human_approval' },
    });

    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.skipped).toHaveLength(1);
    expect((await readFact(store, storedFact.fact.id)).fact.invalidatedAt).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('skips the new fact when the judge finds the stored fact unrelated but the two still overlap', async () => {
    const { judge } = scriptedJudge({ ok: true, value: [{ kind: 'unrelated' }] });

    const { result, storedFact, store } = await rememberAfterPostgres15({ judge, facts: [postgres('16')] });

    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.skipped).toHaveLength(1);
    expect((await readFact(store, storedFact.fact.id)).fact.invalidatedAt).toBeNull();
  });

  it('attaches the source to a stored fact the judge finds the same, and records nothing new', async () => {
    const { judge } = scriptedJudge({ ok: true, value: [{ kind: 'duplicate' }] });

    const { result, storedFact, store } = await rememberAfterPostgres15({ judge, facts: [postgres('15.0')] });

    if (!result.ok) throw new Error(result.error.message);
    expect(onlyFact(result.value)).toMatchObject({ outcome: 'restated', supersedes: null });
    expect((await readFact(store, storedFact.fact.id)).sources).toHaveLength(2);
    expect(await listAll(store)).toHaveLength(1);
  });

  it('skips a succession whose moment of change is not after the stored fact began', async () => {
    const first = createTestDeps({
      now: '2026-01-10',
      llmResponses: [{ facts: [postgres('15', '2026-02-01')] }],
    });
    const stored = await remember(first, {
      namespace: NAMESPACE,
      text: 'Postgres 15 since February.',
      source: SOURCE,
      trigger: 'agent',
    });
    if (!stored.ok) throw new Error(stored.error.message);
    const { judge } = scriptedJudge({
      ok: true,
      value: [{ kind: 'succession', changedAt: at('2026-01-15') }],
    });
    const second = createTestDeps({
      now: '2026-04-02',
      store: first.store,
      newId: first.newId,
      llmResponses: [{ facts: [postgres('16', '2026-01-15')] }],
    });

    const result = await remember(
      { ...second, judge },
      { namespace: NAMESPACE, text: 'Postgres 16 from 15 January.', source: SOURCE, trigger: 'agent' },
    );

    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.skipped).toHaveLength(1);
    expect((await listAll(first.store)).every((fact) => fact.fact.invalidatedAt === null)).toBe(true);
  });

  it('keeps the facts of the first commit and skips the new fact when the commit of a succession fails with conflict', async () => {
    const { judge } = scriptedJudge({
      ok: true,
      value: [{ kind: 'succession', changedAt: at('2026-03-20') }],
    });
    // Every commit after the first of this call fails, as when another process changed memory in between.
    let commits = 0;
    const failingAfterFirst = (store: MemoryStore): MemoryStore => ({
      ...store,
      commit: (changeSet) => {
        commits += 1;
        return commits === 1
          ? store.commit(changeSet)
          : Promise.resolve(err('conflict', 'Another process got there first.'));
      },
    });

    const { result, storedFact, store } = await rememberAfterPostgres15({
      judge,
      facts: [postgres('16', '2026-03-20'), dependsOn('express')],
      wrapStore: failingAfterFirst,
    });

    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.facts.map((fact) => fact.fact.predicate)).toEqual(['depends_on']);
    expect(result.value.skipped).toMatchObject([{ conflictingFactIds: [storedFact.fact.id] }]);
    expect((await readFact(store, storedFact.fact.id)).fact.invalidatedAt).toBeNull();
  });
});
