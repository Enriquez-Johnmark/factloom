// What every MemoryStore must do. The same cases run against the in-memory store of
// @factloom/core and against each storage adapter, so that they cannot drift apart.
// The suite calls only MemoryStore methods and builds every change set by hand.
import type {
  Change,
  ChangeSet,
  Entity,
  Fact,
  MemoryStore,
  Source,
  TimeFilter,
  Timestamp,
} from '@factloom/core';
import { parseDateInput } from '@factloom/core';
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

/** The changes of the succession commit of the fixture, in the order the change set lists them. */
const SUCCESSION_CHANGES: readonly Change[] = [
  { kind: 'record_source', source: source('s-2', '2026-04-02', 'We upgraded to PostgreSQL 16 on 15 March.') },
  recordFact(
    fact('pg14-ended', DATABASE, 'PostgreSQL 14', {
      validFrom: at('2025-06-01'),
      validTo: at('2026-03-15'),
      createdAt: at('2026-04-02'),
    }),
    {
      sourceIds: ['s-1', 's-2'],
      embedding: { copyFromFactId: 'pg14' },
    },
  ),
  { kind: 'invalidate_fact', factId: 'pg14', supersededByFactId: 'pg14-ended' },
  recordFact(
    fact('pg16', DATABASE, 'PostgreSQL 16', { validFrom: at('2026-03-15'), createdAt: at('2026-04-02') }),
    {
      sourceIds: ['s-2'],
      embedding: new Float32Array([0.9, 0.1, 0, 0]),
    },
  ),
];

/**
 * Writes the timeline every case starts from, with three commits:
 *   2026-01-10  remember:   the repository uses PostgreSQL 14 (since 2025-06-01); CI runs on Node 20
 *   2026-04-02  succession: PostgreSQL was upgraded to 16 on 2026-03-15
 *   2026-05-01  correction: CI has always run on Node 22, not Node 20
 * It leaves five facts: pg14 and node20 invalidated; pg14-ended, pg16 and node22 live.
 */
export async function writeTimeline(store: MemoryStore): Promise<void> {
  const commits: readonly ChangeSet[] = [
    changeSet(
      'op-1',
      '2026-01-10',
      [
        { kind: 'create_entity', entity: entity('e-repo', 'example') },
        {
          kind: 'record_source',
          source: source('s-1', '2026-01-10', 'We run PostgreSQL 14. CI runs on Node 20.'),
        },
        recordFact(fact('pg14', DATABASE, 'PostgreSQL 14', { validFrom: at('2025-06-01') })),
        recordFact(fact('node20', NODE, 'Node 20'), { embedding: new Float32Array([0, 1, 0, 0]) }),
      ],
      { explainedBySourceId: 's-1' },
    ),
    changeSet('op-2', '2026-04-02', SUCCESSION_CHANGES, {
      operation: 'succession',
      reasonCode: 'reported_ended',
      explainedBySourceId: 's-2',
    }),
    changeSet(
      'op-3',
      '2026-05-01',
      [
        {
          kind: 'record_source',
          source: source('s-3', '2026-05-01', 'CI has always been on Node 22, not 20.'),
        },
        recordFact(fact('node22', NODE, 'Node 22', { createdAt: at('2026-05-01') }), {
          sourceIds: ['s-3'],
          embedding: new Float32Array([0, 0.9, 0.1, 0]),
        }),
        { kind: 'invalidate_fact', factId: 'node20', supersededByFactId: 'node22' },
      ],
      { operation: 'correction', reasonCode: 'reported_wrong', explainedBySourceId: 's-3' },
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

async function auditEntries(store: MemoryStore, targetKind: 'entity' | 'source' | 'fact', targetId: string) {
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

  /** A store holding only the first commit of the timeline, to read the receipt of the second. */
  async function createStoreWithFirstCommit(): Promise<MemoryStore> {
    const fresh = await createStore();
    const first = await fresh.commit(
      changeSet('op-1', '2026-01-10', [
        { kind: 'create_entity', entity: entity('e-repo', 'example') },
        {
          kind: 'record_source',
          source: source('s-1', '2026-01-10', 'We run PostgreSQL 14. CI runs on Node 20.'),
        },
        recordFact(fact('pg14', DATABASE, 'PostgreSQL 14', { validFrom: at('2025-06-01') })),
      ]),
    );
    if (!first.ok) throw new Error(first.error.message);
    return fresh;
  }

  return registered;
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
  });
  return registered;
}
