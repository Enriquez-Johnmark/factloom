import { describe, expect, it } from 'vitest';
import type { Change, ChangeSet } from './change-set.ts';
import type { Entity, Fact, Source } from './fact.ts';
import { createInMemoryStore } from './in-memory-store.ts';
import type { MemoryStore } from './memory-store.ts';
import type { ErrorCode } from './result.ts';
import { parseDateInput, type Timestamp } from './timestamp.ts';

const NAMESPACE = 'repo:example';
const OTHER_NAMESPACE = 'repo:other';

function day(text: string): Timestamp {
  const parsed = parseDateInput(text);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

const NOW = day('2026-11-13');

function entity(id: string, name: string, namespace = NAMESPACE, type = 'repository'): Entity {
  return { id, namespace, type, name, createdAt: day('2026-01-10') };
}

function source(
  id: string,
  namespace = NAMESPACE,
  content: string | null = 'A note from the agent.',
): Source {
  return {
    id,
    namespace,
    kind: 'agent_note',
    locator: null,
    version: null,
    content,
    contentHash: null,
    observedAt: day('2026-01-10'),
    createdAt: day('2026-01-10'),
  };
}

function fact(id: string, fields: Partial<Fact> = {}): Fact {
  return {
    id,
    namespace: NAMESPACE,
    subjectEntityId: 'e-repo',
    predicate: 'uses_database_version',
    object: { kind: 'value', value: 'PostgreSQL 14' },
    statement: 'The example repository uses PostgreSQL 14',
    confidence: 1,
    validFrom: null,
    validTo: null,
    createdAt: day('2026-01-10'),
    invalidatedAt: null,
    supersededByFactId: null,
    ...fields,
  };
}

function recordFact(
  recorded: Fact,
  options: {
    sourceIds?: readonly [string, ...string[]];
    singleValued?: boolean;
    embedding?: Float32Array | { copyFromFactId: string };
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

let nextOperation = 0;

function changeSet(changes: readonly Change[], fields: Partial<ChangeSet> = {}): ChangeSet {
  nextOperation += 1;
  return {
    namespace: NAMESPACE,
    operationId: `op-${nextOperation}`,
    operation: 'remember',
    trigger: 'agent',
    reasonCode: 'stated',
    explainedBySourceId: null,
    occurredAt: day('2026-01-10'),
    changes,
    ...fields,
  };
}

/** A store that already holds the example repository, one source and the fact that it uses PostgreSQL 14. */
async function createSeededStore(): Promise<MemoryStore> {
  const store = createInMemoryStore();
  const seeded = await store.commit(
    changeSet([
      { kind: 'create_entity', entity: entity('e-repo', 'Example Repo') },
      { kind: 'record_source', source: source('s-1') },
      recordFact(fact('pg14', { validFrom: day('2025-06-01') })),
    ]),
  );
  if (!seeded.ok) throw new Error(seeded.error.message);
  return store;
}

async function listFactIds(
  store: MemoryStore,
  time: Parameters<MemoryStore['listFacts']>[0]['time'],
  namespace = NAMESPACE,
): Promise<string[]> {
  const listed = await store.listFacts({
    namespace,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time,
    limit: 100,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.map((found) => found.fact.id);
}

async function commitError(
  store: MemoryStore,
  changes: readonly Change[],
  fields: Partial<ChangeSet> = {},
): Promise<{ code: ErrorCode; relatedFactIds: readonly string[] } | null> {
  const result = await store.commit(changeSet(changes, fields));
  return result.ok ? null : { code: result.error.code, relatedFactIds: result.error.relatedFactIds };
}

describe('commit', () => {
  it('applies none of a change set when its last change fails', async () => {
    const store = createInMemoryStore();
    const result = await store.commit(
      changeSet([
        { kind: 'create_entity', entity: entity('e-repo', 'Example Repo') },
        { kind: 'record_source', source: source('s-1') },
        recordFact(fact('pg14')),
        { kind: 'invalidate_fact', factId: 'missing', supersededByFactId: null },
      ]),
    );
    expect(result.ok).toBe(false);
    expect(await store.findEntities({ namespace: NAMESPACE, name: 'Example Repo', type: null })).toEqual({
      ok: true,
      value: [],
    });
    expect(await listFactIds(store, 'all')).toEqual([]);
    expect(
      await store.listAuditEntries({ namespace: NAMESPACE, targetKind: 'entity', targetId: 'e-repo' }),
    ).toEqual({ ok: true, value: [] });
    expect(await store.getSource({ namespace: NAMESPACE, sourceId: 's-1' })).toEqual({
      ok: true,
      value: null,
    });
  });

  it('writes one audit entry per change with one operation identifier', async () => {
    const store = createInMemoryStore();
    const result = await store.commit(
      changeSet(
        [
          { kind: 'create_entity', entity: entity('e-repo', 'Example Repo') },
          { kind: 'record_source', source: source('s-1') },
          recordFact(fact('pg14')),
        ],
        { operationId: 'op-seed', explainedBySourceId: 's-1' },
      ),
    );
    expect(result).toEqual({ ok: true, value: { operationId: 'op-seed', auditEntryCount: 3 } });
    const entries = await Promise.all(
      (['entity', 'source', 'fact'] as const).map((targetKind, index) =>
        store.listAuditEntries({
          namespace: NAMESPACE,
          targetKind,
          targetId: ['e-repo', 's-1', 'pg14'][index] ?? '',
        }),
      ),
    );
    const all = entries.flatMap((listed) => (listed.ok ? listed.value : []));
    expect(all).toHaveLength(3);
    expect(new Set(all.map((entry) => entry.operationId))).toEqual(new Set(['op-seed']));
    expect(
      all.every(
        (entry) =>
          entry.operation === 'remember' &&
          entry.trigger === 'agent' &&
          entry.reasonCode === 'stated' &&
          entry.sourceId === 's-1',
      ),
    ).toBe(true);
    expect(all.map((entry) => entry.id)).toEqual([1, 2, 3]);
  });

  it('applies changes in the order given', async () => {
    const store = createInMemoryStore();
    const ordered = await store.commit(
      changeSet([
        { kind: 'record_source', source: source('s-1') },
        { kind: 'create_entity', entity: entity('e-repo', 'Example Repo') },
        recordFact(fact('pg14')),
      ]),
    );
    expect(ordered.ok).toBe(true);
    const actions: string[] = [];
    for (const [targetKind, targetId] of [
      ['source', 's-1'],
      ['entity', 'e-repo'],
      ['fact', 'pg14'],
    ] as const) {
      const listed = await store.listAuditEntries({ namespace: NAMESPACE, targetKind, targetId });
      if (listed.ok) for (const entry of listed.value) actions[entry.id - 1] = entry.action;
    }
    expect(actions).toEqual(['source.recorded', 'entity.created', 'fact.recorded']);

    const factBeforeItsEntity = await commitError(createInMemoryStore(), [
      { kind: 'record_source', source: source('s-1') },
      recordFact(fact('pg14')),
      { kind: 'create_entity', entity: entity('e-repo', 'Example Repo') },
    ]);
    expect(factBeforeItsEntity?.code).toBe('not_found');
  });

  it('writes the detail fixed for each action', async () => {
    const store = await createSeededStore();
    const detailOf = async (targetKind: 'entity' | 'source' | 'fact', targetId: string, action: string) => {
      const listed = await store.listAuditEntries({ namespace: NAMESPACE, targetKind, targetId });
      if (!listed.ok) throw new Error(listed.error.message);
      return listed.value.find((entry) => entry.action === action)?.detail;
    };
    expect(await detailOf('entity', 'e-repo', 'entity.created')).toBeNull();
    expect(await detailOf('source', 's-1', 'source.recorded')).toBeNull();
    expect(await detailOf('fact', 'pg14', 'fact.recorded')).toBeNull();

    // A succession: the old fact is revised to end, and the new fact is recorded.
    const succession = await store.commit(
      changeSet(
        [
          { kind: 'record_source', source: source('s-2') },
          recordFact(
            fact('pg14-ended', {
              validFrom: day('2025-06-01'),
              validTo: day('2026-03-15'),
              createdAt: day('2026-04-02'),
            }),
            {
              sourceIds: ['s-1', 's-2'],
              embedding: { copyFromFactId: 'pg14' },
            },
          ),
          { kind: 'invalidate_fact', factId: 'pg14', supersededByFactId: 'pg14-ended' },
          recordFact(
            fact('pg16', {
              object: { kind: 'value', value: 'PostgreSQL 16' },
              statement: 'The example repository uses PostgreSQL 16',
              validFrom: day('2026-03-15'),
              createdAt: day('2026-04-02'),
            }),
            { sourceIds: ['s-2'] },
          ),
        ],
        {
          operation: 'succession',
          reasonCode: 'reported_ended',
          explainedBySourceId: 's-2',
          occurredAt: day('2026-04-02'),
        },
      ),
    );
    expect(succession.ok).toBe(true);
    expect(await detailOf('fact', 'pg14-ended', 'fact.recorded')).toEqual({ revisesFactId: 'pg14' });
    expect(await detailOf('fact', 'pg16', 'fact.recorded')).toBeNull();
    expect(await detailOf('fact', 'pg14', 'fact.invalidated')).toEqual({ supersededByFactId: 'pg14-ended' });

    const attached = await store.commit(
      changeSet(
        [
          { kind: 'record_source', source: source('s-3') },
          { kind: 'attach_source', factId: 'pg16', sourceId: 's-3' },
        ],
        {
          reasonCode: 'restated',
          occurredAt: day('2026-05-01'),
        },
      ),
    );
    expect(attached.ok).toBe(true);
    expect(await detailOf('fact', 'pg16', 'fact.source_attached')).toEqual({ sourceId: 's-3' });

    // A correction replaces a fact with a different one, so the replacement is not a revised copy.
    const retraction = await store.commit(
      changeSet([{ kind: 'invalidate_fact', factId: 'pg16', supersededByFactId: null }], {
        operation: 'retraction',
        reasonCode: 'reported_wrong',
        occurredAt: day('2026-06-01'),
      }),
    );
    expect(retraction.ok).toBe(true);
    expect(await detailOf('fact', 'pg16', 'fact.invalidated')).toEqual({ supersededByFactId: null });
  });

  it('refuses a second open-ended value for a single-valued predicate', async () => {
    const store = await createSeededStore();
    const error = await commitError(store, [
      recordFact(
        fact('pg16', {
          object: { kind: 'value', value: 'PostgreSQL 16' },
          validFrom: day('2026-03-15'),
          createdAt: day('2026-04-02'),
        }),
      ),
    ]);
    expect(error).toEqual({ code: 'conflict', relatedFactIds: ['pg14'] });
    expect(await listFactIds(store, 'all')).toEqual(['pg14']);
  });

  it('refuses an older fact that arrives late and overlaps a stored one, and a fact dated in the future', async () => {
    const store = await createSeededStore();
    const late = await commitError(store, [
      recordFact(fact('pg13', { validFrom: day('2024-01-01'), validTo: day('2025-09-01') })),
    ]);
    expect(late).toEqual({ code: 'conflict', relatedFactIds: ['pg14'] });
    const future = await commitError(store, [recordFact(fact('pg17', { validFrom: day('2027-01-01') }))]);
    expect(future).toEqual({ code: 'conflict', relatedFactIds: ['pg14'] });
  });

  it('accepts a period that starts where another ends', async () => {
    const store = await createSeededStore();
    const result = await store.commit(
      changeSet([recordFact(fact('pg13', { validFrom: day('2024-01-01'), validTo: day('2025-06-01') }))]),
    );
    expect(result.ok).toBe(true);
    expect(await listFactIds(store, 'live')).toEqual(['pg13', 'pg14']);
  });

  it('accepts a change set that invalidates a fact and records its replacement', async () => {
    const store = await createSeededStore();
    const result = await store.commit(
      changeSet(
        [
          recordFact(
            fact('pg15', {
              object: { kind: 'value', value: 'PostgreSQL 15' },
              validFrom: day('2025-06-01'),
              createdAt: day('2026-05-01'),
            }),
          ),
          { kind: 'invalidate_fact', factId: 'pg14', supersededByFactId: 'pg15' },
        ],
        { operation: 'correction', reasonCode: 'reported_wrong', occurredAt: day('2026-05-01') },
      ),
    );
    expect(result.ok).toBe(true);
    expect(await listFactIds(store, 'live')).toEqual(['pg15']);
    const old = await store.getFact({ namespace: NAMESPACE, factId: 'pg14' });
    expect(old.ok && old.value?.fact).toMatchObject({
      invalidatedAt: day('2026-05-01'),
      supersededByFactId: 'pg15',
    });
  });

  it('does not apply the single-value rule to a multi-valued predicate', async () => {
    const store = await createSeededStore();
    const depends = (id: string, value: string) =>
      recordFact(
        fact(id, {
          predicate: 'depends_on',
          object: { kind: 'value', value },
          statement: `The example repository depends on ${value}`,
        }),
        {
          singleValued: false,
        },
      );
    expect(
      (await store.commit(changeSet([depends('dep-zod', 'zod'), depends('dep-vitest', 'vitest')]))).ok,
    ).toBe(true);
    expect(await listFactIds(store, 'live')).toEqual(['dep-vitest', 'dep-zod', 'pg14']);
  });

  it('returns each documented error code from commit', async () => {
    const store = await createSeededStore();
    const invalidated = await store.commit(
      changeSet(
        [
          recordFact(
            fact('pg14-ended', {
              validFrom: day('2025-06-01'),
              validTo: day('2026-03-15'),
              createdAt: day('2026-04-02'),
            }),
            {
              embedding: { copyFromFactId: 'pg14' },
            },
          ),
          { kind: 'invalidate_fact', factId: 'pg14', supersededByFactId: 'pg14-ended' },
        ],
        { operation: 'revision', reasonCode: 'reported_ended', occurredAt: day('2026-04-02') },
      ),
    );
    expect(invalidated.ok).toBe(true);
    const later = { occurredAt: day('2026-05-01') };

    // invalid_input: the change set fails its schema.
    expect((await commitError(store, [], { operationId: '' }))?.code).toBe('invalid_input');
    // not_found: a missing fact, entity, source, and the fact whose vector was to be copied.
    expect(
      (
        await commitError(
          store,
          [{ kind: 'invalidate_fact', factId: 'missing', supersededByFactId: null }],
          later,
        )
      )?.code,
    ).toBe('not_found');
    expect(
      (await commitError(store, [recordFact(fact('f-x', { subjectEntityId: 'e-missing', predicate: 'p' }))]))
        ?.code,
    ).toBe('not_found');
    expect(
      (await commitError(store, [recordFact(fact('f-x', { predicate: 'p' }), { sourceIds: ['s-missing'] })]))
        ?.code,
    ).toBe('not_found');
    expect(
      (
        await commitError(store, [
          recordFact(fact('f-x', { predicate: 'p' }), { embedding: { copyFromFactId: 'missing' } }),
        ])
      )?.code,
    ).toBe('not_found');
    expect(
      (
        await commitError(
          store,
          [{ kind: 'attach_source', factId: 'pg14-ended', sourceId: 's-missing' }],
          later,
        )
      )?.code,
    ).toBe('not_found');
    // already_invalidated: the fact is no longer live, and the error names what superseded it.
    expect(
      await commitError(
        store,
        [{ kind: 'invalidate_fact', factId: 'pg14', supersededByFactId: null }],
        later,
      ),
    ).toEqual({
      code: 'already_invalidated',
      relatedFactIds: ['pg14-ended'],
    });
    expect(
      (await commitError(store, [{ kind: 'attach_source', factId: 'pg14', sourceId: 's-1' }], later))?.code,
    ).toBe('already_invalidated');
    // already_exists: the same entity again, and an identifier already used.
    expect(
      (await commitError(store, [{ kind: 'create_entity', entity: entity('e-repo-2', '  example   REPO ') }]))
        ?.code,
    ).toBe('already_exists');
    expect(
      (await commitError(store, [{ kind: 'create_entity', entity: entity('e-repo', 'Another') }]))?.code,
    ).toBe('already_exists');
    expect((await commitError(store, [{ kind: 'record_source', source: source('s-1') }]))?.code).toBe(
      'already_exists',
    );
    expect((await commitError(store, [recordFact(fact('pg14', { predicate: 'p' }))]))?.code).toBe(
      'already_exists',
    );
    // embedding_model_mismatch: a vector of another size.
    expect(
      (
        await commitError(store, [
          recordFact(fact('f-x', { predicate: 'p' }), { embedding: new Float32Array([1, 0]) }),
        ])
      )?.code,
    ).toBe('embedding_model_mismatch');
    // conflict: the single-value rule.
    expect(
      (
        await commitError(store, [
          recordFact(fact('pg12', { validFrom: day('2025-01-01'), validTo: day('2026-01-01') })),
        ])
      )?.code,
    ).toBe('conflict');
    // Nothing above changed memory.
    expect(await listFactIds(store, 'all')).toEqual(['pg14-ended', 'pg14']);
  });
});

describe('reads', () => {
  /** PostgreSQL 14 until the upgrade on 2026-03-15, learned on 2026-04-02; then PostgreSQL 16. */
  async function createTimelineStore(): Promise<MemoryStore> {
    const store = await createSeededStore();
    const result = await store.commit(
      changeSet(
        [
          { kind: 'record_source', source: source('s-2') },
          recordFact(
            fact('pg14-ended', {
              validFrom: day('2025-06-01'),
              validTo: day('2026-03-15'),
              createdAt: day('2026-04-02'),
            }),
            {
              sourceIds: ['s-1', 's-2'],
              embedding: { copyFromFactId: 'pg14' },
            },
          ),
          { kind: 'invalidate_fact', factId: 'pg14', supersededByFactId: 'pg14-ended' },
          recordFact(
            fact('pg16', {
              object: { kind: 'value', value: 'PostgreSQL 16' },
              statement: 'The example repository uses PostgreSQL 16',
              validFrom: day('2026-03-15'),
              createdAt: day('2026-04-02'),
            }),
            { sourceIds: ['s-2'] },
          ),
        ],
        {
          operation: 'succession',
          reasonCode: 'reported_ended',
          explainedBySourceId: 's-2',
          occurredAt: day('2026-04-02'),
        },
      ),
    );
    if (!result.ok) throw new Error(result.error.message);
    return store;
  }

  it('returns a fact for an as-of date inside its valid period and not at its end', async () => {
    const store = await createTimelineStore();
    // As of 2026-02-01, known at 2026-11-13: PostgreSQL 14 was true then.
    expect(await listFactIds(store, { validAt: day('2026-02-01'), knownAt: NOW })).toEqual(['pg14-ended']);
    // As of the day of the upgrade, known at 2026-11-13: the period is half-open, so only PostgreSQL 16.
    expect(await listFactIds(store, { validAt: day('2026-03-15'), knownAt: NOW })).toEqual(['pg16']);
    // As of 2026-11-13, known at 2026-11-13: only the current fact.
    expect(await listFactIds(store, { validAt: NOW, knownAt: NOW })).toEqual(['pg16']);
  });

  it('returns what was believed at the known-at date', async () => {
    const store = await createTimelineStore();
    // As of 2026-04-01, known at 2026-04-01: the upgrade was not yet recorded, so still PostgreSQL 14.
    expect(await listFactIds(store, { validAt: day('2026-04-01'), knownAt: day('2026-04-01') })).toEqual([
      'pg14',
    ]);
    // As of 2026-04-01, known at 2026-04-10: the upgrade is known, and the invalidated fact is gone.
    expect(await listFactIds(store, { validAt: day('2026-04-01'), knownAt: day('2026-04-10') })).toEqual([
      'pg16',
    ]);
    // As of 2026-01-01, known at 2026-01-01: nothing had been recorded yet.
    expect(await listFactIds(store, { validAt: day('2026-01-01'), knownAt: day('2026-01-01') })).toEqual([]);
  });

  it('returns every live fact whatever its valid time', async () => {
    const store = await createTimelineStore();
    expect(await listFactIds(store, 'live')).toEqual(['pg16', 'pg14-ended']);
    expect(await listFactIds(store, 'all')).toEqual(['pg16', 'pg14-ended', 'pg14']);
  });

  it('filters by subject, predicate, the entities a fact touches, and the fact that superseded it', async () => {
    const store = await createTimelineStore();
    const extra = await store.commit(
      changeSet([
        { kind: 'create_entity', entity: entity('e-zod', 'zod', NAMESPACE, 'dependency') },
        recordFact(
          fact('dep-zod', {
            predicate: 'depends_on',
            object: { kind: 'entity', entityId: 'e-zod' },
            statement: 'The example repository depends on zod',
          }),
          { singleValued: false },
        ),
      ]),
    );
    expect(extra.ok).toBe(true);
    const list = async (filters: Partial<Parameters<MemoryStore['listFacts']>[0]>) => {
      const listed = await store.listFacts({
        namespace: NAMESPACE,
        subjectEntityId: null,
        predicate: null,
        touchingEntityIds: null,
        supersededByFactId: null,
        time: 'all',
        limit: 100,
        ...filters,
      });
      return listed.ok ? listed.value.map((found) => found.fact.id) : listed.error.code;
    };
    expect(await list({ predicate: 'depends_on' })).toEqual(['dep-zod']);
    expect(await list({ subjectEntityId: 'e-zod' })).toEqual([]);
    expect(await list({ touchingEntityIds: ['e-zod'] })).toEqual(['dep-zod']);
    expect(await list({ supersededByFactId: 'pg14-ended' })).toEqual(['pg14']);
    expect(await list({ limit: 1 })).toEqual(['pg16']);
    expect(await list({ limit: 0 })).toBe('invalid_input');
  });

  it('returns a fact with its subject, its object entity and all its sources', async () => {
    const store = await createTimelineStore();
    const found = await store.getFact({ namespace: NAMESPACE, factId: 'pg14-ended' });
    expect(found.ok && found.value?.subject.name).toBe('Example Repo');
    expect(found.ok && found.value?.objectEntity).toBeNull();
    expect(found.ok && found.value?.sources.map((s) => s.id)).toEqual(['s-1', 's-2']);
    expect(await store.getFact({ namespace: NAMESPACE, factId: 'missing' })).toEqual({
      ok: true,
      value: null,
    });
  });

  it('returns a source by its identifier', async () => {
    const store = await createSeededStore();
    const unlinked = await store.commit(
      changeSet([
        { kind: 'record_source', source: source('s-note', NAMESPACE, 'This was wrong because we moved.') },
      ]),
    );
    expect(unlinked.ok).toBe(true);
    const found = await store.getSource({ namespace: NAMESPACE, sourceId: 's-note' });
    expect(found.ok && found.value?.content).toBe('This was wrong because we moved.');
    expect(await store.getSource({ namespace: NAMESPACE, sourceId: 'unknown' })).toEqual({
      ok: true,
      value: null,
    });
    expect(await store.getSource({ namespace: OTHER_NAMESPACE, sourceId: 's-note' })).toEqual({
      ok: true,
      value: null,
    });
  });

  it('finds an entity by its normalised name', async () => {
    const store = await createSeededStore();
    const found = await store.findEntities({ namespace: NAMESPACE, name: '  Example  Repo ', type: null });
    expect(found.ok && found.value.map((e) => e.id)).toEqual(['e-repo']);
    const byType = await store.findEntities({
      namespace: NAMESPACE,
      name: 'example repo',
      type: 'repository',
    });
    expect(byType.ok && byType.value).toHaveLength(1);
    const otherType = await store.findEntities({
      namespace: NAMESPACE,
      name: 'example repo',
      type: 'dependency',
    });
    expect(otherType).toEqual({ ok: true, value: [] });
  });

  it('returns nothing from another namespace', async () => {
    const store = await createSeededStore();
    expect(
      await store.findEntities({ namespace: OTHER_NAMESPACE, name: 'Example Repo', type: null }),
    ).toEqual({ ok: true, value: [] });
    expect(await store.getFact({ namespace: OTHER_NAMESPACE, factId: 'pg14' })).toEqual({
      ok: true,
      value: null,
    });
    expect(await listFactIds(store, 'all', OTHER_NAMESPACE)).toEqual([]);
    expect(await store.getSource({ namespace: OTHER_NAMESPACE, sourceId: 's-1' })).toEqual({
      ok: true,
      value: null,
    });
    expect(
      await store.listAuditEntries({ namespace: OTHER_NAMESPACE, targetKind: 'fact', targetId: 'pg14' }),
    ).toEqual({ ok: true, value: [] });
  });

  it('keeps two namespaces apart when they hold an entity of the same name', async () => {
    const store = await createSeededStore();
    const other = await store.commit(
      changeSet(
        [
          { kind: 'create_entity', entity: entity('e-repo-other', 'Example Repo', OTHER_NAMESPACE) },
          { kind: 'record_source', source: source('s-other', OTHER_NAMESPACE) },
          recordFact(fact('pg-other', { namespace: OTHER_NAMESPACE, subjectEntityId: 'e-repo-other' }), {
            sourceIds: ['s-other'],
          }),
        ],
        { namespace: OTHER_NAMESPACE },
      ),
    );
    expect(other.ok).toBe(true);
    expect(await listFactIds(store, 'all')).toEqual(['pg14']);
    expect(await listFactIds(store, 'all', OTHER_NAMESPACE)).toEqual(['pg-other']);
    // A fact cannot cite an entity or a source of another namespace.
    expect(
      (
        await commitError(store, [
          recordFact(fact('f-x', { subjectEntityId: 'e-repo-other', predicate: 'p' })),
        ])
      )?.code,
    ).toBe('not_found');
    expect(
      (await commitError(store, [recordFact(fact('f-x', { predicate: 'p' }), { sourceIds: ['s-other'] })]))
        ?.code,
    ).toBe('not_found');
  });

  it('does not let a caller change memory through a result', async () => {
    const store = await createSeededStore();
    const first = await store.getFact({ namespace: NAMESPACE, factId: 'pg14' });
    if (!first.ok || first.value === null) throw new Error('expected the fact');
    // The types are read-only; this simulates a caller that ignores them.
    Object.assign(first.value.fact, { statement: 'changed by the caller' });
    Object.assign(first.value.subject, { name: 'changed by the caller' });
    const second = await store.getFact({ namespace: NAMESPACE, factId: 'pg14' });
    expect(second.ok && second.value?.fact.statement).toBe('The example repository uses PostgreSQL 14');
    expect(second.ok && second.value?.subject.name).toBe('Example Repo');
  });
});
