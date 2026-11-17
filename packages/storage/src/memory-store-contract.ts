// What every MemoryStore must do. The same cases run against the in-memory store of
// @factloom/core and against each storage adapter, so that they cannot drift apart.
// The suite calls only MemoryStore methods and builds every change set by hand, except the
// purge cases, which run purgeContent of core: what they test is what it leaves readable.
import type {
  AuditEntry,
  Change,
  ChangeSet,
  Entity,
  Fact,
  Feedback,
  MemoryStore,
  Source,
  TimeFilter,
  Timestamp,
} from '@factloom/core';
import { parseDateInput, purgeContent } from '@factloom/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** The groups of the suite. An adapter under construction turns them on one by one. */
export const CONTRACT_GROUPS = [
  'time, reads, commit and refusals',
  'single-value rule and namespaces',
  'keyword lane',
  'vector lane',
] as const;
export type ContractGroup = (typeof CONTRACT_GROUPS)[number];

export type ContractOptions = {
  /** The groups to run. Defaults to all. An adapter is complete only when it runs all four. */
  readonly groups?: readonly ContractGroup[];
  /**
   * Opens two stores on one database file. Only an adapter that keeps a file can give it;
   * the case that needs it is registered only when it is given.
   */
  readonly openTwoStoresOnOneFile?: () => Promise<readonly [MemoryStore, MemoryStore]>;
};

export const NAMESPACE = 'repo:example';
export const DATABASE = 'uses_database_version';
export const NODE = 'ci_node_version';

/** A calendar date or a full timestamp, as a timestamp. Throws on anything else: the suite's dates are fixed. */
export function at(text: string): Timestamp {
  const parsed = parseDateInput(text);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

export const NOW = at('2026-11-13');

/**
 * Passes a deliberately malformed value where the types would refuse it. The suite uses it
 * only to check that a store rejects what a caller without types could send.
 */
function malformed<T>(value: unknown): T {
  return value as T;
}

export function entity(id: string, name: string, type = 'repository', namespace = NAMESPACE): Entity {
  return { id, namespace, type, name, createdAt: at('2026-01-10') };
}

export function source(id: string, day: string, content: string, namespace = NAMESPACE): Source {
  return {
    id,
    namespace,
    kind: 'agent_note',
    locator: null,
    version: null,
    content,
    contentHash: null,
    purgedAt: null,
    observedAt: at(day),
    createdAt: at(day),
  };
}

export function fact(id: string, predicate: string, value: string, fields: Partial<Fact> = {}): Fact {
  return {
    id,
    namespace: NAMESPACE,
    subjectEntityId: 'e-repo',
    predicate,
    object: { kind: 'value', value },
    statement: `The example repository: ${predicate} is ${value}`,
    confidence: 1,
    validFrom: null,
    validTo: null,
    createdAt: at('2026-01-10'),
    invalidatedAt: null,
    purgedAt: null,
    supersededByFactId: null,
    ...fields,
  };
}

export function recordFact(
  recorded: Fact,
  options: {
    readonly sourceIds?: readonly [string, ...string[]];
    readonly embedding?: Float32Array | { readonly copyFromFactId: string };
    readonly singleValued?: boolean;
  } = {},
): Change {
  return {
    kind: 'record_fact',
    fact: recorded,
    sourceIds: options.sourceIds ?? ['s-1'],
    embedding: options.embedding ?? new Float32Array([1, 0, 0, 0]),
    singleValued: options.singleValued ?? true,
  };
}

export function changeSet(
  operationId: string,
  day: string,
  changes: readonly Change[],
  fields: Partial<ChangeSet> = {},
): ChangeSet {
  return {
    namespace: NAMESPACE,
    operationId,
    operation: 'remember',
    trigger: 'agent',
    reasonCode: 'stated',
    explainedBySourceId: null,
    occurredAt: at(day),
    changes,
    ...fields,
  };
}

/** Where a copy of the fixture is written: its namespace, and a prefix for every identifier in it. */
export type FixturePlace = { readonly namespace: string; readonly prefix: string };

const EXAMPLE_PLACE: FixturePlace = { namespace: NAMESPACE, prefix: '' };

/** The changes of the succession commit of the fixture, in the order the change set lists them. */
function successionChanges({ namespace, prefix }: FixturePlace): readonly Change[] {
  const id = (name: string): string => `${prefix}${name}`;
  return [
    {
      kind: 'record_source',
      source: source(id('s-2'), '2026-04-02', 'We upgraded to PostgreSQL 16 on 15 March.', namespace),
    },
    recordFact(
      fact(id('pg14-ended'), DATABASE, 'PostgreSQL 14', {
        namespace,
        subjectEntityId: id('e-repo'),
        validFrom: at('2025-06-01'),
        validTo: at('2026-03-15'),
        createdAt: at('2026-04-02'),
      }),
      { sourceIds: [id('s-1'), id('s-2')], embedding: { copyFromFactId: id('pg14') } },
    ),
    { kind: 'invalidate_fact', factId: id('pg14'), supersededByFactId: id('pg14-ended') },
    recordFact(
      fact(id('pg16'), DATABASE, 'PostgreSQL 16', {
        namespace,
        subjectEntityId: id('e-repo'),
        validFrom: at('2026-03-15'),
        createdAt: at('2026-04-02'),
      }),
      { sourceIds: [id('s-2')], embedding: new Float32Array([0.9, 0.1, 0, 0]) },
    ),
  ];
}

const SUCCESSION_CHANGES = successionChanges(EXAMPLE_PLACE);

/** The first commit of the fixture: the repository, a source, and the two facts first believed. */
function firstCommit({ namespace, prefix }: FixturePlace): ChangeSet {
  const id = (name: string): string => `${prefix}${name}`;
  return changeSet(
    id('op-1'),
    '2026-01-10',
    [
      { kind: 'create_entity', entity: entity(id('e-repo'), 'example', 'repository', namespace) },
      {
        kind: 'record_source',
        source: source(id('s-1'), '2026-01-10', 'We run PostgreSQL 14. CI runs on Node 20.', namespace),
      },
      recordFact(
        fact(id('pg14'), DATABASE, 'PostgreSQL 14', {
          namespace,
          subjectEntityId: id('e-repo'),
          validFrom: at('2025-06-01'),
        }),
        {
          sourceIds: [id('s-1')],
        },
      ),
      recordFact(fact(id('node20'), NODE, 'Node 20', { namespace, subjectEntityId: id('e-repo') }), {
        sourceIds: [id('s-1')],
        embedding: new Float32Array([0, 1, 0, 0]),
      }),
    ],
    { namespace, explainedBySourceId: id('s-1') },
  );
}

/**
 * Writes the timeline every case starts from, with three commits:
 *   2026-01-10  remember:   the repository uses PostgreSQL 14 (since 2025-06-01); CI runs on Node 20
 *   2026-04-02  succession: PostgreSQL was upgraded to 16 on 2026-03-15
 *   2026-05-01  correction: CI has always run on Node 22, not Node 20
 * It leaves five facts: pg14 and node20 invalidated; pg14-ended, pg16 and node22 live.
 * A second copy can be written in another namespace, with a prefix on every identifier.
 */
export async function writeTimeline(store: MemoryStore, place: FixturePlace = EXAMPLE_PLACE): Promise<void> {
  const { namespace, prefix } = place;
  const id = (name: string): string => `${prefix}${name}`;
  const commits: readonly ChangeSet[] = [
    firstCommit(place),
    changeSet(id('op-2'), '2026-04-02', successionChanges(place), {
      namespace,
      operation: 'succession',
      reasonCode: 'reported_ended',
      explainedBySourceId: id('s-2'),
    }),
    changeSet(
      id('op-3'),
      '2026-05-01',
      [
        {
          kind: 'record_source',
          source: source(id('s-3'), '2026-05-01', 'CI has always been on Node 22, not 20.', namespace),
        },
        recordFact(
          fact(id('node22'), NODE, 'Node 22', {
            namespace,
            subjectEntityId: id('e-repo'),
            createdAt: at('2026-05-01'),
          }),
          {
            sourceIds: [id('s-3')],
            embedding: new Float32Array([0, 0.9, 0.1, 0]),
          },
        ),
        { kind: 'invalidate_fact', factId: id('node20'), supersededByFactId: id('node22') },
      ],
      { namespace, operation: 'correction', reasonCode: 'reported_wrong', explainedBySourceId: id('s-3') },
    ),
  ];
  for (const commit of commits) {
    const result = await store.commit(commit);
    if (!result.ok) throw new Error(`The fixture could not be written: ${result.error.message}`);
  }
}

type ListQuery = Parameters<MemoryStore['listFacts']>[0];

/** Lists facts with every filter open unless given, and returns their identifiers in the order the store gave them. */
export async function listFactIds(
  store: MemoryStore,
  time: ListQuery['time'],
  filters: Partial<ListQuery> = {},
): Promise<string[]> {
  const listed = await store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time,
    limit: 100,
    ...filters,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.map((found) => found.fact.id);
}

async function auditEntries(store: MemoryStore, targetKind: AuditEntry['targetKind'], targetId: string) {
  const listed = await store.listAuditEntries({ namespace: NAMESPACE, targetKind, targetId });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value;
}

/** Everything a refusal must leave unchanged: every fact row, and the audit entries of the fixture's rows. */
async function snapshot(store: MemoryStore): Promise<string> {
  const facts = await store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time: 'all',
    limit: 1000,
  });
  const audit = [];
  for (const [kind, id] of [
    ['entity', 'e-repo'],
    ['source', 's-1'],
    ['fact', 'pg14'],
    ['fact', 'pg16'],
    ['fact', 'node20'],
    ['fact', 'node22'],
  ] as const) {
    audit.push(await auditEntries(store, kind, id));
  }
  return JSON.stringify([facts, audit]);
}

/** The code a commit fails with, or null when it succeeds. */
async function commitCode(store: MemoryStore, set: ChangeSet): Promise<string | null> {
  const result = await store.commit(set);
  return result.ok ? null : result.error.code;
}

function registerTimeReadsCommitAndRefusals(createStore: () => Promise<MemoryStore>): number {
  let registered = 0;
  let store: MemoryStore;
  const test = (name: string, run: () => Promise<void>): void => {
    registered += 1;
    it(name, run);
  };

  beforeEach(async () => {
    store = await createStore();
    await writeTimeline(store);
  });
  afterEach(async () => {
    await store.close();
  });

  const time = (validAt: string, knownAt: string): TimeFilter => ({
    validAt: at(validAt),
    knownAt: at(knownAt),
  });
  const sorted = async (filter: TimeFilter): Promise<string[]> => (await listFactIds(store, filter)).sort();

  // --- The time table ---
  test('T1: as of now, known at now, returns only the current facts', async () => {
    expect(await sorted({ validAt: NOW, knownAt: NOW })).toEqual(['node22', 'pg16']);
  });
  test('T2: as of 2026-02-01, known at now, returns what was true then as it is believed today', async () => {
    expect(await sorted({ validAt: at('2026-02-01'), knownAt: NOW })).toEqual(['node22', 'pg14-ended']);
  });
  test('T3: as of 2026-03-15, the day of the upgrade, known at now, a fact is not valid at its own end', async () => {
    expect(await sorted({ validAt: at('2026-03-15'), knownAt: NOW })).toEqual(['node22', 'pg16']);
  });
  test('T4: as of 2026-02-01, known at 2026-02-01, returns what was believed then', async () => {
    expect(await sorted(time('2026-02-01', '2026-02-01'))).toEqual(['node20', 'pg14']);
  });
  test('T5: as of 2026-04-01, known at 2026-04-01, the upgrade was not yet recorded', async () => {
    expect(await sorted(time('2026-04-01', '2026-04-01'))).toEqual(['node20', 'pg14']);
  });
  test('T6: as of 2026-04-10, known at 2026-04-10, the upgrade is known and the correction is not', async () => {
    expect(await sorted(time('2026-04-10', '2026-04-10'))).toEqual(['node20', 'pg16']);
  });
  test('T7: as of 2026-01-01, known at 2026-01-01, nothing had been recorded', async () => {
    expect(await sorted(time('2026-01-01', '2026-01-01'))).toEqual([]);
  });
  test('T8: as of 2026-04-02, known at the instant of the succession, a fact is believed from its recording and no longer at its invalidation', async () => {
    expect(await sorted(time('2026-04-02', '2026-04-02T00:00:00.000Z'))).toEqual(['node20', 'pg16']);
  });

  // --- Structural reads ---
  test('R1: getFact returns an invalidated fact with its supersession link', async () => {
    const found = await store.getFact({ namespace: NAMESPACE, factId: 'pg14' });
    expect(found.ok && found.value?.fact).toMatchObject({
      id: 'pg14',
      invalidatedAt: at('2026-04-02'),
      supersededByFactId: 'pg14-ended',
    });
  });
  test('R2: getFact returns a fact with its subject and all its sources', async () => {
    const found = await store.getFact({ namespace: NAMESPACE, factId: 'pg14-ended' });
    expect(found.ok && found.value?.subject).toMatchObject({
      id: 'e-repo',
      name: 'example',
      type: 'repository',
    });
    expect(found.ok && found.value?.objectEntity).toBeNull();
    expect(found.ok && found.value?.sources.map((s) => s.id).sort()).toEqual(['s-1', 's-2']);
  });
  test('R3: getFact returns null for an unknown identifier', async () => {
    expect(await store.getFact({ namespace: NAMESPACE, factId: 'unknown' })).toEqual({
      ok: true,
      value: null,
    });
  });
  test('R4: listFacts with all returns every row of a predicate, invalidated ones included', async () => {
    expect((await listFactIds(store, 'all', { predicate: DATABASE })).sort()).toEqual([
      'pg14',
      'pg14-ended',
      'pg16',
    ]);
  });
  test('R5: listFacts returns the facts that a given fact superseded', async () => {
    expect(await listFactIds(store, 'all', { supersededByFactId: 'pg14-ended' })).toEqual(['pg14']);
  });
  test('R6: listFacts with a subject and a predicate returns only facts that match both', async () => {
    expect((await listFactIds(store, 'all', { subjectEntityId: 'e-repo', predicate: NODE })).sort()).toEqual([
      'node20',
      'node22',
    ]);
    expect(await listFactIds(store, 'all', { subjectEntityId: 'e-unknown', predicate: NODE })).toEqual([]);
    expect(
      await listFactIds(store, 'all', { subjectEntityId: 'e-repo', predicate: 'unknown_predicate' }),
    ).toEqual([]);
  });
  test('R7: listFacts returns the facts that touch an entity as subject or as object', async () => {
    const added = await store.commit(
      changeSet('op-r7', '2026-06-01', [
        { kind: 'create_entity', entity: entity('e-zod', 'zod', 'dependency') },
        recordFact(
          fact('dep-zod', 'depends_on', 'zod', {
            object: { kind: 'entity', entityId: 'e-zod' },
            createdAt: at('2026-06-01'),
          }),
          { singleValued: false },
        ),
        recordFact(
          fact('zod-licence', 'has_licence', 'MIT', {
            subjectEntityId: 'e-zod',
            createdAt: at('2026-06-01'),
          }),
          { singleValued: false },
        ),
      ]),
    );
    expect(added.ok).toBe(true);
    const listed = await store.listFacts({
      namespace: NAMESPACE,
      subjectEntityId: null,
      predicate: null,
      touchingEntityIds: ['e-zod'],
      supersededByFactId: null,
      time: 'all',
      limit: 100,
    });
    expect(listed.ok && listed.value.map((found) => found.fact.id).sort()).toEqual([
      'dep-zod',
      'zod-licence',
    ]);
    const withObject = listed.ok ? listed.value.find((found) => found.fact.id === 'dep-zod') : undefined;
    expect(withObject?.objectEntity).toMatchObject({ id: 'e-zod', name: 'zod', type: 'dependency' });
  });
  test('R8: listFacts returns the newest fact first and no more than the limit', async () => {
    const all = await store.listFacts({
      namespace: NAMESPACE,
      subjectEntityId: null,
      predicate: null,
      touchingEntityIds: null,
      supersededByFactId: null,
      time: 'all',
      limit: 100,
    });
    const recordedTimes = all.ok ? all.value.map((found) => found.fact.createdAt) : [];
    expect(recordedTimes).toEqual([...recordedTimes].sort().reverse());
    const limited = await listFactIds(store, 'all', { limit: 2 });
    expect(limited).toHaveLength(2);
    expect(limited[0]).toBe('node22');
  });
  test('R9: findEntities matches the normalised name, for one type or for every type', async () => {
    const added = await store.commit(
      changeSet('op-r9', '2026-06-01', [
        { kind: 'create_entity', entity: entity('e-example-dep', 'Example', 'dependency') },
      ]),
    );
    expect(added.ok).toBe(true);
    const anyType = await store.findEntities({ namespace: NAMESPACE, name: '  EXAMPLE ', type: null });
    expect(anyType.ok && anyType.value.map((found) => found.id).sort()).toEqual(['e-example-dep', 'e-repo']);
    const oneType = await store.findEntities({
      namespace: NAMESPACE,
      name: '  EXAMPLE ',
      type: 'repository',
    });
    expect(oneType.ok && oneType.value.map((found) => found.id)).toEqual(['e-repo']);
    expect(await store.findEntities({ namespace: NAMESPACE, name: 'another', type: null })).toEqual({
      ok: true,
      value: [],
    });
  });
  test('R10: a read with a limit below 1 returns invalid_input', async () => {
    const listed = await store.listFacts({
      namespace: NAMESPACE,
      subjectEntityId: null,
      predicate: null,
      touchingEntityIds: null,
      supersededByFactId: null,
      time: 'all',
      limit: 0,
    });
    expect(listed.ok ? null : listed.error.code).toBe('invalid_input');
  });
  test('R11: listFacts with live returns every live fact at any valid time and no invalidated one', async () => {
    expect((await listFactIds(store, 'live', { predicate: DATABASE })).sort()).toEqual([
      'pg14-ended',
      'pg16',
    ]);
  });
  test('R12: getSource returns a source by its identifier with all its fields', async () => {
    expect(await store.getSource({ namespace: NAMESPACE, sourceId: 's-2' })).toEqual({
      ok: true,
      value: source('s-2', '2026-04-02', 'We upgraded to PostgreSQL 16 on 15 March.'),
    });
  });
  test('R13: getSource returns a source that no fact is linked to', async () => {
    const lone = source('s-lone', '2026-06-01', 'That fact was wrong: we never used it.');
    expect(
      (await store.commit(changeSet('op-r13', '2026-06-01', [{ kind: 'record_source', source: lone }]))).ok,
    ).toBe(true);
    expect(await store.getSource({ namespace: NAMESPACE, sourceId: 's-lone' })).toEqual({
      ok: true,
      value: lone,
    });
  });
  test('R14: getSource returns null for an unknown identifier', async () => {
    expect(await store.getSource({ namespace: NAMESPACE, sourceId: 'unknown' })).toEqual({
      ok: true,
      value: null,
    });
  });

  // --- Commit ---
  test('C1: a change set whose last change fails applies none of its changes', async () => {
    const before = await snapshot(store);
    const result = await store.commit(
      changeSet('op-c1', '2026-06-01', [
        { kind: 'create_entity', entity: entity('e-new', 'new thing', 'dependency') },
        { kind: 'record_source', source: source('s-new', '2026-06-01', 'A new note.') },
        recordFact(fact('f-new', 'depends_on', 'new thing', { createdAt: at('2026-06-01') }), {
          sourceIds: ['s-new'],
          singleValued: false,
        }),
        { kind: 'invalidate_fact', factId: 'missing', supersededByFactId: null },
      ]),
    );
    expect(result.ok ? null : result.error.code).toBe('not_found');
    expect(await snapshot(store)).toBe(before);
    expect(await store.findEntities({ namespace: NAMESPACE, name: 'new thing', type: null })).toEqual({
      ok: true,
      value: [],
    });
    expect(await store.getSource({ namespace: NAMESPACE, sourceId: 's-new' })).toEqual({
      ok: true,
      value: null,
    });
    expect(await store.getFact({ namespace: NAMESPACE, factId: 'f-new' })).toEqual({ ok: true, value: null });
    expect(await auditEntries(store, 'entity', 'e-new')).toEqual([]);
  });
  test('C2: a commit writes one audit entry per change, in order, with one operation identifier', async () => {
    const targets = [
      ['source', 's-2'],
      ['fact', 'pg14-ended'],
      ['fact', 'pg14'],
      ['fact', 'pg16'],
    ] as const;
    const written = [];
    for (const [kind, id] of targets)
      written.push(...(await auditEntries(store, kind, id)).filter((entry) => entry.operationId === 'op-2'));
    written.sort((a, b) => a.id - b.id);
    expect(written.map((entry) => `${entry.action}:${entry.targetId}`)).toEqual([
      'source.recorded:s-2',
      'fact.recorded:pg14-ended',
      'fact.invalidated:pg14',
      'fact.recorded:pg16',
    ]);
    expect(
      written.every(
        (entry) =>
          entry.operation === 'succession' &&
          entry.sourceId === 's-2' &&
          entry.occurredAt === at('2026-04-02'),
      ),
    ).toBe(true);
    const receipt = await (await createStoreWithFirstCommit()).commit(
      changeSet('op-2', '2026-04-02', SUCCESSION_CHANGES, {
        operation: 'succession',
        reasonCode: 'reported_ended',
      }),
    );
    expect(receipt).toEqual({
      ok: true,
      value: { operationId: 'op-2', auditEntryCount: SUCCESSION_CHANGES.length },
    });
  });
  test('C3: listAuditEntries returns the entries of one fact in the order they were written', async () => {
    const entries = await auditEntries(store, 'fact', 'pg14');
    expect(entries.map((entry) => [entry.action, entry.operation])).toEqual([
      ['fact.recorded', 'remember'],
      ['fact.invalidated', 'succession'],
    ]);
    expect(entries[1]?.detail).toEqual({ supersededByFactId: 'pg14-ended' });
    expect(entries[1]?.reasonCode).toBe('reported_ended');
  });
  test('C4: attaching a source to a live fact writes no fact and one audit entry', async () => {
    const before = await listFactIds(store, 'all');
    const result = await store.commit(
      changeSet('op-c4', '2026-06-01', [{ kind: 'attach_source', factId: 'pg16', sourceId: 's-1' }], {
        reasonCode: 'restated',
      }),
    );
    expect(result).toEqual({ ok: true, value: { operationId: 'op-c4', auditEntryCount: 1 } });
    expect(await listFactIds(store, 'all')).toEqual(before);
    const found = await store.getFact({ namespace: NAMESPACE, factId: 'pg16' });
    expect(found.ok && found.value?.sources.map((s) => s.id).sort()).toEqual(['s-1', 's-2']);
    expect(
      (await auditEntries(store, 'fact', 'pg16')).filter((entry) => entry.action === 'fact.source_attached'),
    ).toHaveLength(1);
  });
  test('C5: a fact recorded with a copied vector can be read, and copying from a missing fact returns not_found', async () => {
    const copied = recordFact(
      fact('pg16-note', 'has_note', 'upgraded in March', { createdAt: at('2026-06-01') }),
      {
        sourceIds: ['s-2'],
        embedding: { copyFromFactId: 'pg16' },
        singleValued: false,
      },
    );
    expect((await store.commit(changeSet('op-c5', '2026-06-01', [copied]))).ok).toBe(true);
    const found = await store.getFact({ namespace: NAMESPACE, factId: 'pg16-note' });
    expect(found.ok && found.value?.fact.id).toBe('pg16-note');
    const fromMissing = recordFact(fact('f-x', 'has_note', 'x', { createdAt: at('2026-06-01') }), {
      embedding: { copyFromFactId: 'missing' },
      singleValued: false,
    });
    expect(await commitCode(store, changeSet('op-c5b', '2026-06-01', [fromMissing]))).toBe('not_found');
  });
  test('C6: no commit ever reduces the number of facts', async () => {
    const count = async (): Promise<number> => (await listFactIds(store, 'all')).length;
    expect(await count()).toBe(5);
    await store.commit(
      changeSet(
        'op-c6a',
        '2026-06-01',
        [{ kind: 'invalidate_fact', factId: 'pg16', supersededByFactId: null }],
        { operation: 'retraction', reasonCode: 'reported_wrong' },
      ),
    );
    expect(await count()).toBe(5);
    await store.commit(
      changeSet('op-c6b', '2026-06-02', [
        recordFact(
          fact('pg17', DATABASE, 'PostgreSQL 17', {
            validFrom: at('2026-06-01'),
            createdAt: at('2026-06-02'),
          }),
          { sourceIds: ['s-2'] },
        ),
      ]),
    );
    expect(await count()).toBe(6);
    await store.commit(
      changeSet('op-c6c', '2026-06-03', [
        { kind: 'invalidate_fact', factId: 'missing', supersededByFactId: null },
      ]),
    );
    expect(await count()).toBe(6);
  });
  test('C7: the detail of an audit entry is the one fixed for its action', async () => {
    const detail = async (kind: 'entity' | 'source' | 'fact', id: string, action: string) =>
      (await auditEntries(store, kind, id)).find((entry) => entry.action === action)?.detail;
    expect(await detail('fact', 'pg14-ended', 'fact.recorded')).toEqual({ revisesFactId: 'pg14' });
    expect(await detail('fact', 'pg16', 'fact.recorded')).toBeNull();
    expect(await detail('fact', 'node22', 'fact.recorded')).toBeNull();
    expect(await detail('entity', 'e-repo', 'entity.created')).toBeNull();
    expect(await detail('source', 's-1', 'source.recorded')).toBeNull();
    expect(await detail('fact', 'node20', 'fact.invalidated')).toEqual({ supersededByFactId: 'node22' });
    await store.commit(
      changeSet('op-c7', '2026-06-01', [{ kind: 'attach_source', factId: 'pg16', sourceId: 's-3' }], {
        reasonCode: 'restated',
      }),
    );
    expect(await detail('fact', 'pg16', 'fact.source_attached')).toEqual({ sourceId: 's-3' });
  });
  test('C8: changes apply in the order given, so a fact listed before its entity is refused', async () => {
    const set = changeSet('op-c8', '2026-06-01', [
      recordFact(
        fact('f-early', 'has_note', 'x', { subjectEntityId: 'e-late', createdAt: at('2026-06-01') }),
        { singleValued: false },
      ),
      { kind: 'create_entity', entity: entity('e-late', 'late', 'dependency') },
    ]);
    expect(await commitCode(store, set)).toBe('not_found');
    expect(await store.findEntities({ namespace: NAMESPACE, name: 'late', type: null })).toEqual({
      ok: true,
      value: [],
    });
  });
  test('C9: an ended copy of a fact whose object is an entity names the fact it revises', async () => {
    const usesRedis = fact('uses-redis', 'depends_on', '', {
      object: { kind: 'entity', entityId: 'e-redis' },
      createdAt: at('2026-06-01'),
    });
    const recorded = await store.commit(
      changeSet('op-c9a', '2026-06-01', [
        { kind: 'create_entity', entity: entity('e-redis', 'redis', 'dependency') },
        recordFact(usesRedis, { singleValued: false }),
      ]),
    );
    const revised = await store.commit(
      changeSet(
        'op-c9b',
        '2026-06-02',
        [
          recordFact(
            { ...usesRedis, id: 'uses-redis-ended', validTo: at('2026-06-01'), createdAt: at('2026-06-02') },
            { embedding: { copyFromFactId: 'uses-redis' }, singleValued: false },
          ),
          { kind: 'invalidate_fact', factId: 'uses-redis', supersededByFactId: 'uses-redis-ended' },
        ],
        { operation: 'revision', reasonCode: 'reported_ended' },
      ),
    );
    expect([recorded.ok, revised.ok]).toEqual([true, true]);
    const [entry] = (await auditEntries(store, 'fact', 'uses-redis-ended')).filter(
      (one) => one.action === 'fact.recorded',
    );
    expect(entry?.detail).toEqual({ revisesFactId: 'uses-redis' });
  });
  test('C10: a replacement with another object, object kind, subject or predicate names no revised fact', async () => {
    // Each wrong fact is replaced by one that keeps as much of it as possible and differs in
    // one part, so that only a copy with the same subject, predicate and object counts as a revision.
    const depends = (id: string, value: string, fields: Partial<Fact> = {}) =>
      fact(id, 'depends_on', value, { createdAt: at('2026-06-01'), ...fields });
    const replacements: readonly { readonly wrong: Fact; readonly right: Fact }[] = [
      {
        wrong: depends('dep-keydb', '', { object: { kind: 'entity', entityId: 'e-keydb' } }),
        right: depends('dep-valkey', '', { object: { kind: 'entity', entityId: 'e-valkey' } }),
      },
      {
        wrong: depends('dep-jest', 'vitest'),
        right: depends('dep-vitest', '', { object: { kind: 'entity', entityId: 'e-vitest' } }),
      },
      {
        wrong: depends('dep-lodash', 'lodash'),
        right: depends('dep-lodash-other', 'lodash', { subjectEntityId: 'e-other' }),
      },
      {
        wrong: depends('dep-moment', 'moment'),
        right: fact('note-moment', 'has_note', 'moment', { createdAt: at('2026-06-01') }),
      },
    ];
    const created = await store.commit(
      changeSet('op-c10', '2026-06-01', [
        { kind: 'create_entity', entity: entity('e-vitest', 'vitest', 'dependency') },
        { kind: 'create_entity', entity: entity('e-other', 'other') },
        { kind: 'create_entity', entity: entity('e-keydb', 'keydb', 'dependency') },
        { kind: 'create_entity', entity: entity('e-valkey', 'valkey', 'dependency') },
        ...replacements.map(({ wrong }) => recordFact(wrong, { singleValued: false })),
      ]),
    );
    expect(created.ok).toBe(true);

    for (const [index, { wrong, right }] of replacements.entries()) {
      const corrected = await store.commit(
        changeSet(
          `op-c10-${index}`,
          '2026-06-02',
          [
            recordFact({ ...right, createdAt: at('2026-06-02') }, { singleValued: false }),
            { kind: 'invalidate_fact', factId: wrong.id, supersededByFactId: right.id },
          ],
          { operation: 'correction', reasonCode: 'reported_wrong' },
        ),
      );
      expect(corrected.ok, right.id).toBe(true);
      const [entry] = (await auditEntries(store, 'fact', right.id)).filter(
        (one) => one.action === 'fact.recorded',
      );
      expect(entry?.detail, right.id).toBeNull();
    }
  });

  // --- Refusals: each leaves memory unchanged ---
  const refuses = (
    name: string,
    expected: string,
    build: () => ChangeSet,
    check?: (relatedFactIds: readonly string[]) => void,
  ): void => {
    test(name, async () => {
      const before = await snapshot(store);
      const result = await store.commit(build());
      expect(result.ok ? null : result.error.code).toBe(expected);
      if (!result.ok) check?.(result.error.relatedFactIds);
      expect(await snapshot(store)).toBe(before);
    });
  };
  const later = { occurredAt: at('2026-06-01') };
  const note = (id: string, fields: Partial<Fact> = {}) =>
    fact(id, 'has_note', 'x', { createdAt: at('2026-06-01'), ...fields });

  refuses('F1: invalidating a missing fact returns not_found', 'not_found', () =>
    changeSet('op-f1', '2026-06-01', [
      { kind: 'invalidate_fact', factId: 'missing', supersededByFactId: null },
    ]),
  );
  refuses(
    'F2: invalidating a fact twice returns already_invalidated and names the superseding fact',
    'already_invalidated',
    () =>
      changeSet('op-f2', '2026-06-01', [
        { kind: 'invalidate_fact', factId: 'pg14', supersededByFactId: null },
      ]),
    (relatedFactIds) => expect(relatedFactIds).toEqual(['pg14-ended']),
  );
  refuses(
    'F3: attaching a source to a fact that is no longer live returns already_invalidated',
    'already_invalidated',
    () => changeSet('op-f3', '2026-06-01', [{ kind: 'attach_source', factId: 'node20', sourceId: 's-3' }]),
  );
  refuses('F4: a fact with no source returns invalid_input', 'invalid_input', () =>
    changeSet('op-f4', '2026-06-01', [
      malformed<Change>({ ...recordFact(note('f-x'), { singleValued: false }), sourceIds: [] }),
    ]),
  );
  refuses('F5: a fact whose valid period is reversed or empty returns invalid_input', 'invalid_input', () =>
    changeSet('op-f5', '2026-06-01', [
      recordFact(note('f-x', { validFrom: at('2026-03-01'), validTo: at('2026-03-01') }), {
        singleValued: false,
      }),
    ]),
  );
  refuses('F5b: a fact whose valid period ends before it starts returns invalid_input', 'invalid_input', () =>
    changeSet('op-f5b', '2026-06-01', [
      recordFact(note('f-x', { validFrom: at('2026-03-01'), validTo: at('2026-02-01') }), {
        singleValued: false,
      }),
    ]),
  );
  refuses(
    'F6: a row that carries another namespace than its change set returns invalid_input',
    'invalid_input',
    () =>
      changeSet('op-f6', '2026-06-01', [
        recordFact(note('f-x', { namespace: 'repo:other' }), { singleValued: false }),
      ]),
  );
  refuses(
    'F7: a second entity with the same type and normalised name returns already_exists',
    'already_exists',
    () =>
      changeSet('op-f7', '2026-06-01', [{ kind: 'create_entity', entity: entity('e-repo-2', '  EXAMPLE ') }]),
  );
  refuses('F8: a fact whose identifier is already used returns already_exists', 'already_exists', () =>
    changeSet('op-f8', '2026-06-01', [recordFact(note('pg16'), { singleValued: false })]),
  );
  refuses('F9: a fact whose subject entity does not exist returns not_found', 'not_found', () =>
    changeSet('op-f9', '2026-06-01', [
      recordFact(note('f-x', { subjectEntityId: 'e-missing' }), { singleValued: false }),
    ]),
  );
  refuses('F10: a fact whose source does not exist returns not_found', 'not_found', () =>
    changeSet(
      'op-f10',
      '2026-06-01',
      [recordFact(note('f-x'), { sourceIds: ['s-missing'], singleValued: false })],
      later,
    ),
  );

  // --- Confidence history (FL-045) ---
  // A cache recorded at 0.9 on 2026-06-01 and adjusted to 0.4 on 2026-07-01.
  const RECORDED = '2026-06-01';
  const ADJUSTED = '2026-07-01';
  const adjust = (factId: string, confidence: number): Change => ({
    kind: 'adjust_confidence',
    factId,
    confidence,
  });
  const adjusted = { operation: 'confidence_adjustment', reasonCode: 'stated' } as const;
  const recordCache = async (): Promise<void> => {
    const recorded = await store.commit(
      changeSet('op-cache', RECORDED, [
        recordFact(fact('redis', 'uses_cache', 'Redis', { createdAt: at(RECORDED), confidence: 0.9 }), {
          singleValued: false,
          embedding: new Float32Array([0, 0, 1, 0]),
        }),
      ]),
    );
    if (!recorded.ok) throw new Error(recorded.error.message);
  };
  const adjustCache = async (): Promise<void> => {
    const result = await store.commit(changeSet('op-adjust', ADJUSTED, [adjust('redis', 0.4)], adjusted));
    if (!result.ok) throw new Error(result.error.message);
  };
  const confidenceOf = async (time: TimeFilter | 'live' | 'all'): Promise<number | undefined> => {
    const listed = await store.listFacts({
      namespace: NAMESPACE,
      subjectEntityId: null,
      predicate: 'uses_cache',
      touchingEntityIds: null,
      supersededByFactId: null,
      time,
      limit: 10,
    });
    if (!listed.ok) throw new Error(listed.error.message);
    return listed.value[0]?.fact.confidence;
  };

  test('Q1: a read returns the confidence that held at its known-at date', async () => {
    await recordCache();
    await adjustCache();

    expect(await confidenceOf({ validAt: NOW, knownAt: at('2026-06-15') })).toBe(0.9);
    expect(await confidenceOf({ validAt: NOW, knownAt: at(ADJUSTED) })).toBe(0.4);
    expect(await confidenceOf({ validAt: NOW, knownAt: NOW })).toBe(0.4);
  });
  test('Q2: getFact, and listFacts with live or all, return the latest confidence', async () => {
    await recordCache();
    await adjustCache();

    const found = await store.getFact({ namespace: NAMESPACE, factId: 'redis' });
    expect(found.ok && found.value?.fact.confidence).toBe(0.4);
    expect(await confidenceOf('live')).toBe(0.4);
    expect(await confidenceOf('all')).toBe(0.4);
  });
  test('Q3: as of now, known at now, both search lanes return the adjusted confidence', async () => {
    await recordCache();
    await adjustCache();
    const now = { validAt: NOW, knownAt: NOW };

    const byKeyword = await store.searchFactsByKeyword({
      namespace: NAMESPACE,
      text: 'Redis',
      time: now,
      limit: 5,
    });
    const byVector = await store.searchFactsByVector({
      namespace: NAMESPACE,
      vector: new Float32Array([0, 0, 1, 0]),
      time: now,
      limit: 1,
    });

    expect(byKeyword.ok && byKeyword.value.map(({ fact }) => [fact.id, fact.confidence])).toEqual([
      ['redis', 0.4],
    ]);
    expect(byVector.ok && byVector.value.map(({ fact }) => [fact.id, fact.confidence])).toEqual([
      ['redis', 0.4],
    ]);
  });
  test('Q4: an adjustment leaves the fact identifier, its recorded time and the number of facts unchanged', async () => {
    await recordCache();
    const before = await listFactIds(store, 'all');

    await adjustCache();

    expect(await listFactIds(store, 'all')).toEqual(before);
    const found = await store.getFact({ namespace: NAMESPACE, factId: 'redis' });
    expect(found.ok && found.value?.fact).toMatchObject({
      id: 'redis',
      createdAt: at(RECORDED),
      invalidatedAt: null,
      purgedAt: null,
    });
  });
  test('Q5: each adjustment writes one audit entry with the previous and the new confidence', async () => {
    await recordCache();
    await adjustCache();

    const entries = (await auditEntries(store, 'fact', 'redis')).filter(
      (entry) => entry.action === 'fact.confidence_adjusted',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      operation: 'confidence_adjustment',
      detail: { previousConfidence: 0.9, confidence: 0.4 },
      occurredAt: at(ADJUSTED),
    });
  });
  test('Q6: of two adjustments at the same time, the later one recorded wins', async () => {
    await recordCache();

    const result = await store.commit(
      changeSet('op-adjust', ADJUSTED, [adjust('redis', 0.4), adjust('redis', 0.7)], adjusted),
    );

    expect(result.ok).toBe(true);
    expect(await confidenceOf({ validAt: NOW, knownAt: at(ADJUSTED) })).toBe(0.7);
    const entries = (await auditEntries(store, 'fact', 'redis')).filter(
      (entry) => entry.action === 'fact.confidence_adjusted',
    );
    expect(entries.map((entry) => entry.detail)).toEqual([
      { previousConfidence: 0.9, confidence: 0.4 },
      { previousConfidence: 0.4, confidence: 0.7 },
    ]);
  });
  refuses('Q7: a confidence above 1 returns invalid_input', 'invalid_input', () =>
    changeSet('op-q7', '2026-06-01', [adjust('pg16', 1.5)], adjusted),
  );
  refuses('Q8: adjusting a missing fact returns not_found', 'not_found', () =>
    changeSet('op-q8', '2026-06-01', [adjust('missing', 0.4)], adjusted),
  );
  refuses(
    'Q9: adjusting an invalidated fact returns already_invalidated and names the superseding fact',
    'already_invalidated',
    () => changeSet('op-q9', '2026-06-01', [adjust('pg14', 0.4)], adjusted),
    (related) => expect(related).toEqual(['pg14-ended']),
  );

  // --- Feedback (FL-046) ---
  const feedbackOn = (factId: string, fields: Partial<Feedback> = {}): Change => ({
    kind: 'record_feedback',
    feedback: {
      id: 'fb-1',
      namespace: NAMESPACE,
      factId,
      signal: 'wrong',
      trigger: 'agent',
      sourceId: null,
      recordedAt: at('2026-06-01'),
      ...fields,
    },
  });
  const given = { operation: 'feedback', reasonCode: 'feedback_given' } as const;

  test('G1: feedback writes one audit entry about the feedback, and changes no fact', async () => {
    const before = await snapshot(store);

    const result = await store.commit(changeSet('op-g1', '2026-06-01', [feedbackOn('pg16')], given));

    expect(result.ok).toBe(true);
    expect(await auditEntries(store, 'feedback', 'fb-1')).toMatchObject([
      {
        action: 'feedback.recorded',
        operation: 'feedback',
        reasonCode: 'feedback_given',
        detail: { factId: 'pg16' },
      },
    ]);
    expect(await snapshot(store)).toBe(before);
  });
  test('G2: feedback with a source records the source and the feedback in one commit', async () => {
    const result = await store.commit(
      changeSet(
        'op-g2',
        '2026-06-01',
        [
          {
            kind: 'record_source',
            source: source('s-feedback', '2026-06-01', 'That is no longer the version.'),
          },
          feedbackOn('pg16', { signal: 'outdated', sourceId: 's-feedback' }),
        ],
        { ...given, explainedBySourceId: 's-feedback' },
      ),
    );

    expect(result.ok).toBe(true);
    const entries = [
      ...(await auditEntries(store, 'source', 's-feedback')),
      ...(await auditEntries(store, 'feedback', 'fb-1')),
    ];
    expect(entries.map((entry) => [entry.action, entry.operationId, entry.sourceId])).toEqual([
      ['source.recorded', 'op-g2', 's-feedback'],
      ['feedback.recorded', 'op-g2', 's-feedback'],
    ]);
  });
  test('G3: feedback on an invalidated fact is recorded', async () => {
    const result = await store.commit(changeSet('op-g3', '2026-06-01', [feedbackOn('pg14')], given));

    expect(result.ok).toBe(true);
    expect(await auditEntries(store, 'feedback', 'fb-1')).toHaveLength(1);
  });
  refuses('G4: feedback on a missing fact returns not_found', 'not_found', () =>
    changeSet('op-g4', '2026-06-01', [feedbackOn('missing')], given),
  );
  refuses('G5: feedback that names a missing source returns not_found', 'not_found', () =>
    changeSet('op-g5', '2026-06-01', [feedbackOn('pg16', { sourceId: 's-missing' })], given),
  );
  refuses('G6: a second feedback with the same identifier returns already_exists', 'already_exists', () =>
    changeSet('op-g6', '2026-06-01', [feedbackOn('pg16'), feedbackOn('node22')], given),
  );

  // --- Purge (FL-061) ---
  // k-1 recorded from s-key, whose text and locator hold the marker; k-1 ended as k-1e with
  // the note s-rotated; k-1e corrected by k-2 from s-fix, which quotes the marker. The
  // fixture's facts and sources are the unrelated ones.
  const MARKER = 'ZEBRA7731';
  const DEPLOY_KEY = 'has_deploy_key';
  const keySource = (id: string, day: string, content: string, contentHash: string | null): Change => ({
    kind: 'record_source',
    source: {
      ...source(id, day, content),
      contentHash,
      locator: id === 's-key' ? `notes/${MARKER}.md` : null,
    },
  });
  const keyFact = (id: string, value: string, day: string, validTo: string | null) =>
    fact(id, DEPLOY_KEY, value, {
      statement: `The deploy key is ${value}`,
      createdAt: at(day),
      validTo: validTo === null ? null : at(validTo),
    });
  const buildSecret = async (): Promise<void> => {
    const commits = [
      changeSet('op-key-1', '2026-05-01', [
        keySource('s-key', '2026-05-01', `The deploy key is ${MARKER}.`, 'h-key'),
        recordFact(keyFact('k-1', MARKER, '2026-05-01', null), {
          sourceIds: ['s-key'],
          embedding: new Float32Array([0, 0, 0, 1]),
        }),
      ]),
      changeSet(
        'op-key-2',
        '2026-05-10',
        [
          keySource('s-rotated', '2026-05-10', 'The key was rotated on 1 May.', null),
          recordFact(keyFact('k-1e', MARKER, '2026-05-10', '2026-05-01'), {
            sourceIds: ['s-key', 's-rotated'],
            embedding: { copyFromFactId: 'k-1' },
          }),
          { kind: 'invalidate_fact', factId: 'k-1', supersededByFactId: 'k-1e' },
        ],
        { operation: 'revision', reasonCode: 'reported_ended', explainedBySourceId: 's-rotated' },
      ),
      changeSet(
        'op-key-3',
        '2026-05-20',
        [
          keySource('s-fix', '2026-05-20', `Correction: it was never ${MARKER}; it is KEY-B.`, 'h-fix'),
          recordFact(keyFact('k-2', 'KEY-B', '2026-05-20', '2026-05-01'), {
            sourceIds: ['s-fix'],
            embedding: new Float32Array([0, 0, 1, 1]),
          }),
          { kind: 'invalidate_fact', factId: 'k-1e', supersededByFactId: 'k-2' },
        ],
        { operation: 'correction', reasonCode: 'reported_wrong', explainedBySourceId: 's-fix' },
      ),
    ];
    for (const commit of commits) {
      const result = await store.commit(commit);
      if (!result.ok) throw new Error(result.error.message);
    }
  };
  const purgeKey = (date = '2026-06-01', namespace = NAMESPACE) => {
    let count = 0;
    const newId = (): string => {
      count += 1;
      return `purge-${date}-${count}`;
    };
    return purgeContent(
      { store, now: () => at(date), newId },
      { namespace, trigger: 'person', reasonCode: 'secret_stored', sourceId: 's-key' },
    );
  };
  const FACT_IDS = ['k-1', 'k-1e', 'k-2', 'pg14', 'pg14-ended', 'pg16', 'node20', 'node22'];
  const SOURCE_IDS = ['s-key', 's-rotated', 's-fix', 's-1', 's-2', 's-3'];
  /** Every read method of the store, called for every identifier the case involves. */
  const readEverything = async (): Promise<unknown[]> => {
    const now = { validAt: NOW, knownAt: NOW };
    const results: unknown[] = [];
    for (const factId of FACT_IDS) {
      results.push(await store.getFact({ namespace: NAMESPACE, factId }));
      results.push(
        await store.listAuditEntries({ namespace: NAMESPACE, targetKind: 'fact', targetId: factId }),
      );
      results.push(await store.listFeedback({ namespace: NAMESPACE, factId }));
      for (const time of ['all', 'live', now] as const) {
        results.push(
          await store.listFacts({
            namespace: NAMESPACE,
            subjectEntityId: null,
            predicate: null,
            touchingEntityIds: null,
            supersededByFactId: factId,
            time,
            limit: 100,
          }),
        );
      }
    }
    for (const sourceId of SOURCE_IDS) {
      results.push(await store.getSource({ namespace: NAMESPACE, sourceId }));
      results.push(
        await store.listAuditEntries({ namespace: NAMESPACE, targetKind: 'source', targetId: sourceId }),
      );
    }
    for (const time of [
      'all',
      'live',
      now,
      { validAt: at('2026-04-01'), knownAt: at('2026-05-15') },
    ] as const) {
      results.push(await listFactIds(store, time));
      results.push(
        await store.listFacts({
          namespace: NAMESPACE,
          subjectEntityId: 'e-repo',
          predicate: DEPLOY_KEY,
          touchingEntityIds: ['e-repo'],
          supersededByFactId: null,
          time,
          limit: 100,
        }),
      );
    }
    results.push(await store.findEntities({ namespace: NAMESPACE, name: 'example', type: null }));
    results.push(await store.listFactsOfSources({ namespace: NAMESPACE, sourceIds: SOURCE_IDS }));
    results.push(await store.findSourcesByContentHash({ namespace: NAMESPACE, contentHash: 'h-key' }));
    for (const time of [now, { validAt: at('2026-04-01'), knownAt: at('2026-05-15') }]) {
      results.push(await store.searchFactsByKeyword({ namespace: NAMESPACE, text: MARKER, time, limit: 10 }));
      results.push(
        await store.searchFactsByVector({
          namespace: NAMESPACE,
          vector: new Float32Array([0, 0, 0, 1]),
          time,
          limit: 10,
        }),
      );
    }
    return results;
  };
  const containsMarker = (value: unknown): boolean =>
    JSON.stringify(value).toLowerCase().includes(MARKER.toLowerCase());

  test('U1: after a purge, no read method returns the purged text for any identifier involved', async () => {
    await buildSecret();
    expect(containsMarker(await readEverything())).toBe(true);

    const purged = await purgeKey();

    expect(purged.ok).toBe(true);
    expect(containsMarker(await readEverything())).toBe(false);
  });
  test('U2: after a purge, neither lane returns a purged fact for a question made of the text', async () => {
    await buildSecret();
    const before = { validAt: at('2026-05-05'), knownAt: at('2026-05-05') };

    await purgeKey();

    const byKeyword = await store.searchFactsByKeyword({
      namespace: NAMESPACE,
      text: MARKER,
      time: before,
      limit: 10,
    });
    const byVector = await store.searchFactsByVector({
      namespace: NAMESPACE,
      vector: new Float32Array([0, 0, 0, 1]),
      time: before,
      limit: 10,
    });
    expect(byKeyword.ok && byKeyword.value).toEqual([]);
    expect(byVector.ok && byVector.value.map(({ fact }) => fact.id)).not.toContain('k-1');
  });
  test('U3: a purge leaves the unrelated facts and sources unchanged, removes no row, and audits each purged row once', async () => {
    await buildSecret();
    const unrelated = async () =>
      JSON.stringify([
        await store.getFact({ namespace: NAMESPACE, factId: 'pg16' }),
        await store.getFact({ namespace: NAMESPACE, factId: 'node22' }),
        await store.getSource({ namespace: NAMESPACE, sourceId: 's-1' }),
      ]);
    const before = await unrelated();
    const factRows = (await listFactIds(store, 'all')).length;

    const purged = await purgeKey();

    expect(await unrelated()).toBe(before);
    expect((await listFactIds(store, 'all')).length).toBe(factRows);
    if (!purged.ok) throw new Error(purged.error.message);
    const purgeActions = [];
    for (const factId of purged.value.purgedFactIds) {
      purgeActions.push(
        ...(await auditEntries(store, 'fact', factId)).filter((entry) => entry.action === 'fact.purged'),
      );
    }
    for (const sourceId of purged.value.purgedSourceIds) {
      purgeActions.push(
        ...(await auditEntries(store, 'source', sourceId)).filter(
          (entry) => entry.action === 'source.purged',
        ),
      );
    }
    expect([...purged.value.purgedFactIds].sort()).toEqual(['k-1', 'k-1e']);
    expect([...purged.value.purgedSourceIds].sort()).toEqual(['s-fix', 's-key', 's-rotated']);
    expect(purgeActions).toHaveLength(5);
    expect(new Set(purgeActions.map((entry) => entry.operation))).toEqual(new Set(['purge']));
    for (const sourceId of SOURCE_IDS) {
      const found = await store.getSource({ namespace: NAMESPACE, sourceId });
      expect(found.ok && found.value !== null, sourceId).toBe(true);
    }
  });
  test('U4: purging an already purged source succeeds and writes no further audit entry', async () => {
    await buildSecret();
    await purgeKey();
    const before = await auditEntries(store, 'source', 's-key');

    const again = await purgeKey('2026-07-01');

    expect(again.ok).toBe(true);
    expect(await auditEntries(store, 'source', 's-key')).toEqual(before);
  });
  test('U5: purging a source of another namespace returns not_found', async () => {
    await buildSecret();

    const result = await purgeKey('2026-06-01', 'repo:other');

    expect(result.ok ? null : result.error.code).toBe('not_found');
  });

  /** A store holding only the first commit of the timeline, to read the receipt of the second. */
  async function createStoreWithFirstCommit(): Promise<MemoryStore> {
    const fresh = await createStore();
    const first = await fresh.commit(firstCommit(EXAMPLE_PLACE));
    if (!first.ok) throw new Error(first.error.message);
    return fresh;
  }

  return registered;
}

const OTHER_PLACE: FixturePlace = { namespace: 'repo:other', prefix: 'other-' };

/** Registers cases that all start from the fixture, and counts them. */
function startCases(createStore: () => Promise<MemoryStore>, alsoWriteOtherNamespace: boolean) {
  const state: { store: MemoryStore | null; registered: number } = { store: null, registered: 0 };
  beforeEach(async () => {
    state.store = await createStore();
    await writeTimeline(state.store);
    if (alsoWriteOtherNamespace) await writeTimeline(state.store, OTHER_PLACE);
  });
  afterEach(async () => {
    await state.store?.close();
  });
  return {
    /** The store of the running case. */
    store(): MemoryStore {
      if (state.store === null) throw new Error('No store: a case ran outside its setup.');
      return state.store;
    },
    test(name: string, run: () => Promise<void>): void {
      state.registered += 1;
      it(name, run);
    },
    count: (): number => state.registered,
  };
}

/** A fact for the database predicate of the example repository, with the given valid period. */
function databaseFact(id: string, value: string, validFrom: string | null, validTo: string | null): Fact {
  return fact(id, DATABASE, value, {
    validFrom: validFrom === null ? null : at(validFrom),
    validTo: validTo === null ? null : at(validTo),
    createdAt: at('2026-06-01'),
  });
}

function registerSingleValueRuleAndNamespaces(
  createStore: () => Promise<MemoryStore>,
  openTwoStoresOnOneFile: ContractOptions['openTwoStoresOnOneFile'],
): number {
  const cases = startCases(createStore, true);
  const commit = (changes: readonly Change[], fields: Partial<ChangeSet> = {}) =>
    cases.store().commit(changeSet('op-rule', '2026-06-01', changes, fields));

  // --- The single-value rule refuses ---
  const conflicts = (
    name: string,
    changes: () => readonly Change[],
    overlapping: readonly string[],
  ): void => {
    cases.test(name, async () => {
      const before = await listFactIds(cases.store(), 'all');
      const result = await commit(changes());
      expect(result.ok ? null : result.error.code).toBe('conflict');
      if (!result.ok) expect([...result.error.relatedFactIds].sort()).toEqual([...overlapping].sort());
      expect(await listFactIds(cases.store(), 'all')).toEqual(before);
    });
  };
  conflicts(
    'S1: a second open-ended value overlaps the current one',
    () => [recordFact(databaseFact('pg17', 'PostgreSQL 17', '2026-06-01', null))],
    ['pg16'],
  );
  conflicts(
    'S2: an older fact arriving late overlaps the ended fact it would contradict',
    () => [recordFact(databaseFact('pg13', 'PostgreSQL 13', '2024-01-01', '2025-09-01'))],
    ['pg14-ended'],
  );
  conflicts(
    'S3: a fact dated in the future overlaps the open-ended current one',
    () => [recordFact(databaseFact('pg18', 'PostgreSQL 18', '2027-01-01', null))],
    ['pg16'],
  );
  conflicts(
    'S4: an unknown start overlaps everything before its end',
    () => [recordFact(databaseFact('pg12', 'PostgreSQL 12', null, '2025-07-01'))],
    ['pg14-ended'],
  );
  conflicts(
    'S5: the same value again overlaps too, because the store does not compare objects',
    () => [recordFact(databaseFact('pg16-again', 'PostgreSQL 16', '2026-03-15', null))],
    ['pg16'],
  );
  cases.test('S6: two overlapping facts recorded in one change set are refused', async () => {
    const before = await listFactIds(cases.store(), 'all');
    const result = await commit([
      recordFact(fact('port-a', 'listens_on_port', '5432', { createdAt: at('2026-06-01') })),
      recordFact(fact('port-b', 'listens_on_port', '5433', { createdAt: at('2026-06-01') })),
    ]);
    expect(result.ok ? null : result.error.code).toBe('conflict');
    expect(await listFactIds(cases.store(), 'all')).toEqual(before);
  });

  // --- The single-value rule allows ---
  cases.test('A1: a period that ends where another starts is accepted', async () => {
    expect(
      (await commit([recordFact(databaseFact('pg13', 'PostgreSQL 13', '2024-01-01', '2025-06-01'))])).ok,
    ).toBe(true);
    expect((await listFactIds(cases.store(), 'live', { predicate: DATABASE })).sort()).toEqual([
      'pg13',
      'pg14-ended',
      'pg16',
    ]);
  });
  cases.test('A2: two open-ended facts for a multi-valued predicate are both accepted', async () => {
    const depends = (id: string, value: string) =>
      recordFact(fact(id, 'depends_on', value, { createdAt: at('2026-06-01') }), { singleValued: false });
    expect((await commit([depends('dep-zod', 'zod'), depends('dep-vitest', 'vitest')])).ok).toBe(true);
    expect((await listFactIds(cases.store(), 'live', { predicate: 'depends_on' })).sort()).toEqual([
      'dep-vitest',
      'dep-zod',
    ]);
  });
  cases.test('A3: a change set that invalidates a fact and records its replacement is accepted', async () => {
    const result = await commit(
      [
        recordFact(databaseFact('pg16-corrected', 'PostgreSQL 16.1', '2026-03-15', null)),
        { kind: 'invalidate_fact', factId: 'pg16', supersededByFactId: 'pg16-corrected' },
      ],
      { operation: 'correction', reasonCode: 'reported_wrong' },
    );
    expect(result.ok).toBe(true);
    expect(await listFactIds(cases.store(), { validAt: NOW, knownAt: NOW }, { predicate: DATABASE })).toEqual(
      ['pg16-corrected'],
    );
  });
  cases.test(
    'A5: a fact that its own change set records and invalidates is not held to the rule',
    async () => {
      const result = await commit(
        [
          recordFact(databaseFact('pg17', 'PostgreSQL 17', '2026-06-01', null)),
          { kind: 'invalidate_fact', factId: 'pg17', supersededByFactId: null },
        ],
        { operation: 'retraction', reasonCode: 'reported_wrong' },
      );
      expect(result.ok).toBe(true);
      expect((await listFactIds(cases.store(), 'live', { predicate: DATABASE })).sort()).toEqual([
        'pg14-ended',
        'pg16',
      ]);
    },
  );
  cases.test('A4: an open-ended fact for the same subject and another predicate is accepted', async () => {
    expect(
      (await commit([recordFact(fact('port', 'listens_on_port', '5432', { createdAt: at('2026-06-01') }))]))
        .ok,
    ).toBe(true);
  });

  // The change set of reviseValidTime (FL-044): the upgrade moved from 15 March to 1 March.
  const movedBoundary = {
    endedCopy: recordFact(databaseFact('pg14-revised', 'PostgreSQL 14', '2025-06-01', '2026-03-01'), {
      embedding: { copyFromFactId: 'pg14-ended' },
    }),
    endedInvalidated: { kind: 'invalidate_fact', factId: 'pg14-ended', supersededByFactId: 'pg14-revised' },
    successorCopy: recordFact(databaseFact('pg16-revised', 'PostgreSQL 16', '2026-03-01', null), {
      embedding: { copyFromFactId: 'pg16' },
    }),
    successorInvalidated: { kind: 'invalidate_fact', factId: 'pg16', supersededByFactId: 'pg16-revised' },
  } as const;
  cases.test(
    'A6: a change set that moves the boundary between two neighbouring facts is accepted, and half of it is refused',
    async () => {
      const revision = { operation: 'revision', reasonCode: 'period_corrected' } as const;
      const before = await listFactIds(cases.store(), 'all');
      const half = await commit([movedBoundary.successorCopy, movedBoundary.successorInvalidated], revision);
      expect(half.ok ? null : half.error.code).toBe('conflict');
      if (!half.ok) expect(half.error.relatedFactIds).toEqual(['pg14-ended']);
      expect(await listFactIds(cases.store(), 'all')).toEqual(before);

      const whole = await commit(
        [
          movedBoundary.endedCopy,
          movedBoundary.endedInvalidated,
          movedBoundary.successorCopy,
          movedBoundary.successorInvalidated,
        ],
        revision,
      );
      expect(whole.ok).toBe(true);
      expect((await listFactIds(cases.store(), 'live', { predicate: DATABASE })).sort()).toEqual([
        'pg14-revised',
        'pg16-revised',
      ]);
      expect(
        await listFactIds(
          cases.store(),
          { validAt: at('2026-03-10'), knownAt: NOW },
          { predicate: DATABASE },
        ),
      ).toEqual(['pg16-revised']);
    },
  );

  // --- Namespaces ---
  const OTHER = OTHER_PLACE.namespace;
  cases.test('N1: no read in one namespace returns a row of the other', async () => {
    const store = cases.store();
    expect((await listFactIds(store, 'all')).every((id) => !id.startsWith('other-'))).toBe(true);
    expect(
      (await listFactIds(store, 'all', { namespace: OTHER })).every((id) => id.startsWith('other-')),
    ).toBe(true);
    expect(await listFactIds(store, 'all', { namespace: OTHER })).toHaveLength(5);
    expect(await store.getFact({ namespace: NAMESPACE, factId: 'other-pg16' })).toEqual({
      ok: true,
      value: null,
    });
    expect(await store.getFact({ namespace: OTHER, factId: 'pg16' })).toEqual({ ok: true, value: null });
    const found = await store.findEntities({ namespace: NAMESPACE, name: 'example', type: null });
    expect(found.ok && found.value.map((e) => e.id)).toEqual(['e-repo']);
    expect(await store.getSource({ namespace: NAMESPACE, sourceId: 'other-s-1' })).toEqual({
      ok: true,
      value: null,
    });
    expect(
      await store.listAuditEntries({ namespace: NAMESPACE, targetKind: 'fact', targetId: 'other-pg14' }),
    ).toEqual({ ok: true, value: [] });
    const otherAudit = await store.listAuditEntries({
      namespace: OTHER,
      targetKind: 'fact',
      targetId: 'other-pg14',
    });
    expect(otherAudit.ok && otherAudit.value).toHaveLength(2);
  });
  cases.test('N2: invalidating a fact of the other namespace returns not_found', async () => {
    const result = await commit([
      { kind: 'invalidate_fact', factId: 'other-pg16', supersededByFactId: null },
    ]);
    expect(result.ok ? null : result.error.code).toBe('not_found');
    expect(await listFactIds(cases.store(), 'live', { namespace: OTHER, predicate: DATABASE })).toContain(
      'other-pg16',
    );
  });
  cases.test(
    'N3: a fact whose subject, object or source belongs to the other namespace returns not_found',
    async () => {
      const note = (fields: Partial<Fact>) =>
        fact('f-x', 'has_note', 'x', { createdAt: at('2026-06-01'), ...fields });
      const code = async (change: Change) => {
        const result = await commit([change]);
        return result.ok ? null : result.error.code;
      };
      expect(await code(recordFact(note({ subjectEntityId: 'other-e-repo' }), { singleValued: false }))).toBe(
        'not_found',
      );
      expect(
        await code(
          recordFact(note({ object: { kind: 'entity', entityId: 'other-e-repo' } }), { singleValued: false }),
        ),
      ).toBe('not_found');
      expect(await code(recordFact(note({}), { sourceIds: ['other-s-1'], singleValued: false }))).toBe(
        'not_found',
      );
      expect(
        await code(
          recordFact(note({}), { embedding: { copyFromFactId: 'other-pg16' }, singleValued: false }),
        ),
      ).toBe('not_found');
    },
  );
  cases.test('N6: adjusting the confidence of a fact of the other namespace returns not_found', async () => {
    const before = await listFactIds(cases.store(), 'all', { namespace: OTHER });
    const result = await commit([{ kind: 'adjust_confidence', factId: 'other-pg16', confidence: 0.4 }], {
      operation: 'confidence_adjustment',
    });
    expect(result.ok ? null : result.error.code).toBe('not_found');
    const found = await cases.store().getFact({ namespace: OTHER, factId: 'other-pg16' });
    expect(found.ok && found.value?.fact.confidence).toBe(1);
    expect(await listFactIds(cases.store(), 'all', { namespace: OTHER })).toEqual(before);
  });
  cases.test('N7: feedback on a fact of the other namespace returns not_found', async () => {
    const result = await commit(
      [
        {
          kind: 'record_feedback',
          feedback: {
            id: 'fb-other',
            namespace: NAMESPACE,
            factId: 'other-pg16',
            signal: 'wrong',
            trigger: 'agent',
            sourceId: null,
            recordedAt: at('2026-06-01'),
          },
        },
      ],
      { operation: 'feedback', reasonCode: 'feedback_given' },
    );
    expect(result.ok ? null : result.error.code).toBe('not_found');
    const entries = await cases
      .store()
      .listAuditEntries({ namespace: NAMESPACE, targetKind: 'feedback', targetId: 'fb-other' });
    expect(entries.ok && entries.value).toEqual([]);
  });
  cases.test('N4: a supersession link to a fact of the other namespace returns not_found', async () => {
    const result = await commit([
      { kind: 'invalidate_fact', factId: 'pg16', supersededByFactId: 'other-pg16' },
    ]);
    expect(result.ok ? null : result.error.code).toBe('not_found');
    expect(await listFactIds(cases.store(), 'live', { predicate: DATABASE })).toContain('pg16');
  });
  cases.test(
    'N5: the same entity in two namespaces is accepted, and the single-value rule does not cross them',
    async () => {
      // The fixture already holds the entity "example" in both namespaces.
      const ended = await commit(
        [
          recordFact(
            fact('pg16-ended', DATABASE, 'PostgreSQL 16', {
              validFrom: at('2026-03-15'),
              validTo: at('2026-06-01'),
              createdAt: at('2026-06-01'),
            }),
            {
              sourceIds: ['s-2'],
              embedding: { copyFromFactId: 'pg16' },
            },
          ),
          { kind: 'invalidate_fact', factId: 'pg16', supersededByFactId: 'pg16-ended' },
          recordFact(databaseFact('pg17', 'PostgreSQL 17', '2026-06-01', null)),
        ],
        { operation: 'succession', reasonCode: 'reported_ended' },
      );
      // The other namespace still has an open-ended PostgreSQL 16; it does not stand in the way.
      expect(ended.ok).toBe(true);
      expect(
        await listFactIds(
          cases.store(),
          { validAt: NOW, knownAt: NOW },
          { namespace: OTHER, predicate: DATABASE },
        ),
      ).toEqual(['other-pg16']);
    },
  );

  // --- Two stores on one file ---
  if (openTwoStoresOnOneFile !== undefined) {
    cases.test(
      'P1: of two stores on one file that each commit a different current value, exactly one succeeds',
      async () => {
        const [first, second] = await openTwoStoresOnOneFile();
        try {
          const seeded = await first.commit(firstCommit({ namespace: 'repo:shared', prefix: 'shared-' }));
          expect(seeded.ok).toBe(true);
          const port = (id: string, value: string) =>
            changeSet(
              `op-${id}`,
              '2026-06-01',
              [
                recordFact(
                  fact(id, 'listens_on_port', value, {
                    namespace: 'repo:shared',
                    subjectEntityId: 'shared-e-repo',
                    createdAt: at('2026-06-01'),
                  }),
                  {
                    sourceIds: ['shared-s-1'],
                  },
                ),
              ],
              { namespace: 'repo:shared' },
            );
          const results = [
            await first.commit(port('port-a', '5432')),
            await second.commit(port('port-b', '5433')),
          ];
          expect(results.filter((result) => result.ok)).toHaveLength(1);
          expect(
            results.map((result) => (result.ok ? null : result.error.code)).filter((code) => code !== null),
          ).toEqual(['conflict']);
        } finally {
          await first.close();
          await second.close();
        }
      },
    );
  }
  return cases.count();
}

function registerKeywordLane(createStore: () => Promise<MemoryStore>): number {
  const cases = startCases(createStore, true);
  const search = async (text: string, time: TimeFilter, namespace = NAMESPACE): Promise<string[]> => {
    const found = await cases.store().searchFactsByKeyword({ namespace, text, time, limit: 10 });
    if (!found.ok) throw new Error(found.error.message);
    return found.value.map((result) => result.fact.id);
  };
  cases.test(
    'K1: as of now, known at now, the keyword lane returns only the current fact that matches',
    async () => {
      expect(await search('postgresql', { validAt: NOW, knownAt: NOW })).toEqual(['pg16']);
    },
  );
  cases.test('K2: as of 2026-02-01, known at now, the keyword lane returns the ended fact', async () => {
    expect(await search('postgresql', { validAt: at('2026-02-01'), knownAt: NOW })).toEqual(['pg14-ended']);
  });
  cases.test(
    'K3: as of 2026-02-01, known at 2026-02-01, the keyword lane returns what was believed then',
    async () => {
      expect(await search('postgresql', { validAt: at('2026-02-01'), knownAt: at('2026-02-01') })).toEqual([
        'pg14',
      ]);
    },
  );
  cases.test('K4: a text that matches nothing returns an empty list', async () => {
    expect(await search('kubernetes', { validAt: NOW, knownAt: NOW })).toEqual([]);
  });
  cases.test('K5: the keyword lane returns nothing from the other namespace', async () => {
    expect(await search('postgresql', { validAt: NOW, knownAt: NOW }, OTHER_PLACE.namespace)).toEqual([
      'other-pg16',
    ]);
    expect(
      (await search('postgresql', { validAt: NOW, knownAt: NOW })).every((id) => !id.startsWith('other-')),
    ).toBe(true);
  });
  return cases.count();
}

function registerVectorLane(createStore: () => Promise<MemoryStore>): number {
  const cases = startCases(createStore, true);
  const PG14_VECTOR = new Float32Array([1, 0, 0, 0]);
  const search = async (time: TimeFilter, limit: number, namespace = NAMESPACE): Promise<string[]> => {
    const found = await cases.store().searchFactsByVector({ namespace, vector: PG14_VECTOR, time, limit });
    if (!found.ok) throw new Error(found.error.message);
    return found.value.map((result) => result.fact.id);
  };
  cases.test(
    'V1: as of now, known at now, with a limit of 1, the time filter is applied before the limit',
    async () => {
      expect(await search({ validAt: NOW, knownAt: NOW }, 1)).toEqual(['pg16']);
    },
  );
  cases.test(
    'V2: as of 2026-02-01, known at now, with a limit of 1, the vector lane returns the ended fact',
    async () => {
      expect(await search({ validAt: at('2026-02-01'), knownAt: NOW }, 1)).toEqual(['pg14-ended']);
    },
  );
  cases.test('V3: as of now, known at now, the nearer fact comes first', async () => {
    expect(await search({ validAt: NOW, knownAt: NOW }, 10)).toEqual(['pg16', 'node22']);
  });
  cases.test('V4: the vector lane returns nothing from the other namespace', async () => {
    expect(await search({ validAt: NOW, knownAt: NOW }, 10, OTHER_PLACE.namespace)).toEqual([
      'other-pg16',
      'other-node22',
    ]);
    expect((await search({ validAt: NOW, knownAt: NOW }, 10)).every((id) => !id.startsWith('other-'))).toBe(
      true,
    );
  });
  cases.test('V5: a query vector of the wrong size returns invalid_input', async () => {
    const found = await cases.store().searchFactsByVector({
      namespace: NAMESPACE,
      vector: new Float32Array([1, 0]),
      time: { validAt: NOW, knownAt: NOW },
      limit: 5,
    });
    expect(found.ok ? null : found.error.code).toBe('invalid_input');
  });
  cases.test(
    'V6: a commit with a vector of another size returns embedding_model_mismatch and changes nothing',
    async () => {
      const before = await listFactIds(cases.store(), 'all');
      const result = await cases.store().commit(
        changeSet('op-v6', '2026-06-01', [
          recordFact(fact('f-x', 'has_note', 'x', { createdAt: at('2026-06-01') }), {
            embedding: new Float32Array([1, 0]),
            singleValued: false,
          }),
        ]),
      );
      expect(result.ok ? null : result.error.code).toBe('embedding_model_mismatch');
      expect(await listFactIds(cases.store(), 'all')).toEqual(before);
    },
  );
  return cases.count();
}

/**
 * Registers the contract cases for one MemoryStore. `createStore` returns a new, empty store;
 * each case gets its own and closes it. Returns how many cases each group registered, so a
 * test can show that a group left out of the options registers none.
 */
export function describeMemoryStoreContract(
  name: string,
  createStore: () => Promise<MemoryStore>,
  options: ContractOptions = {},
): Readonly<Record<ContractGroup, number>> {
  const groups = options.groups ?? CONTRACT_GROUPS;
  const registered: Record<ContractGroup, number> = {
    'time, reads, commit and refusals': 0,
    'single-value rule and namespaces': 0,
    'keyword lane': 0,
    'vector lane': 0,
  };
  // A describe block with no test in it is an error, so nothing is registered for no groups.
  if (groups.length === 0) return registered;
  describe(`MemoryStore contract: ${name}`, () => {
    if (groups.includes('time, reads, commit and refusals')) {
      describe('time, reads, commit and refusals', () => {
        registered['time, reads, commit and refusals'] = registerTimeReadsCommitAndRefusals(createStore);
      });
    }
    if (groups.includes('single-value rule and namespaces')) {
      describe('single-value rule and namespaces', () => {
        registered['single-value rule and namespaces'] = registerSingleValueRuleAndNamespaces(
          createStore,
          options.openTwoStoresOnOneFile,
        );
      });
    }
    if (groups.includes('keyword lane')) {
      describe('keyword lane', () => {
        registered['keyword lane'] = registerKeywordLane(createStore);
      });
    }
    if (groups.includes('vector lane')) {
      describe('vector lane', () => {
        registered['vector lane'] = registerVectorLane(createStore);
      });
    }
  });
  return registered;
}
