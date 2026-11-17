// Adapter tests of the structural reads: what the MemoryStore interface does not describe.
// What the reads return is covered by the contract suite.
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { buildListFactsSql, type ListFactsShape } from './create-reads.ts';
import { at, NAMESPACE, NOW, writeTimeline } from './memory-store-contract.ts';
import { closeLater, closeTestStores, openOnFile } from './sqlite-test-store.ts';

afterEach(closeTestStores);

const NO_FILTER: ListFactsShape = {
  hasSubject: false,
  hasPredicate: false,
  hasTouching: false,
  hasSupersededBy: false,
  time: 'live',
};

/** The query plan of a `listFacts` query, as the lines SQLite prints. */
function explain(rows: Database.Database, shape: ListFactsShape): string {
  const parameters: Record<string, unknown> = { namespace: NAMESPACE, limit: 10 };
  if (shape.hasSubject) parameters.subjectEntityId = 'e-repo';
  if (shape.hasPredicate) parameters.predicate = 'uses_database_version';
  if (shape.hasTouching) parameters.touchingEntityIds = '["e-repo"]';
  if (shape.hasSupersededBy) parameters.supersededByFactId = 'pg16';
  if (shape.time === 'filter') Object.assign(parameters, { validAt: NOW, knownAt: NOW });
  const plan = rows
    .prepare<[Record<string, unknown>], { detail: string }>(`EXPLAIN QUERY PLAN ${buildListFactsSql(shape)}`)
    .all(parameters);
  return plan.map((step) => step.detail).join('\n');
}

describe('the indexes of listFacts', () => {
  it('uses the subject and predicate index', async () => {
    const { store, rows } = openOnFile();
    await writeTimeline(store);

    for (const time of ['filter', 'live', 'all'] as const) {
      const plan = explain(rows, { ...NO_FILTER, hasSubject: true, hasPredicate: true, time });
      expect(plan, time).toContain('fact_subject_predicate');
    }
  });

  it('uses the object entity index for facts that point at an entity', async () => {
    const { store, rows } = openOnFile();
    await writeTimeline(store);

    const plan = explain(rows, { ...NO_FILTER, hasTouching: true, time: 'filter' });

    expect(plan).toContain('fact_object_entity');
    expect(plan).toContain('fact_subject_predicate');
  });

  it('uses the supersession index for the facts a fact superseded', async () => {
    const { store, rows } = openOnFile();
    await writeTimeline(store);

    const plan = explain(rows, { ...NO_FILTER, hasSupersededBy: true, time: 'all' });

    expect(plan).toContain('fact_superseded_by');
  });
});

describe('reads on SQLite', () => {
  it('a read leaves the database unchanged', async () => {
    const { store, rows } = openOnFile();
    await writeTimeline(store);
    // The data version, read through another connection, changes when any connection commits.
    const before = rows.pragma('data_version', { simple: true });
    const time = { validAt: NOW, knownAt: NOW };
    const everyFact = {
      namespace: NAMESPACE,
      subjectEntityId: null,
      predicate: null,
      touchingEntityIds: null,
      supersededByFactId: null,
      limit: 10,
    };

    const results = [
      await store.findEntities({ namespace: NAMESPACE, name: 'example', type: null }),
      await store.getFact({ namespace: NAMESPACE, factId: 'pg16' }),
      await store.listFacts({ ...everyFact, time }),
      await store.listFacts({ ...everyFact, time: 'live', touchingEntityIds: ['e-repo'] }),
      await store.listFacts({ ...everyFact, time: 'all', supersededByFactId: 'pg14-ended' }),
      await store.getSource({ namespace: NAMESPACE, sourceId: 's-1' }),
      await store.listAuditEntries({ namespace: NAMESPACE, targetKind: 'fact', targetId: 'pg14' }),
    ];

    expect(results.every((result) => result.ok)).toBe(true);
    expect(rows.pragma('data_version', { simple: true })).toBe(before);
  });

  it('returns a fact once when both its subject and its object entity are asked for', async () => {
    const { store } = openOnFile();
    await writeTimeline(store);
    const created = at('2026-06-01');
    const committed = await store.commit({
      namespace: NAMESPACE,
      operationId: 'op-4',
      operation: 'remember',
      trigger: 'agent',
      reasonCode: 'stated',
      explainedBySourceId: null,
      occurredAt: created,
      changes: [
        {
          kind: 'create_entity',
          entity: {
            id: 'e-redis',
            namespace: NAMESPACE,
            type: 'dependency',
            name: 'redis',
            createdAt: created,
          },
        },
        {
          kind: 'record_fact',
          fact: {
            id: 'uses-redis',
            namespace: NAMESPACE,
            subjectEntityId: 'e-repo',
            predicate: 'depends_on',
            object: { kind: 'entity', entityId: 'e-redis' },
            statement: 'The example repository depends on Redis',
            confidence: 1,
            validFrom: null,
            validTo: null,
            createdAt: created,
            invalidatedAt: null,
            purgedAt: null,
            supersededByFactId: null,
          },
          sourceIds: ['s-1'],
          embedding: new Float32Array([0, 0, 1, 0]),
          singleValued: false,
        },
      ],
    });
    expect(committed.ok).toBe(true);

    const touching = await store.listFacts({
      namespace: NAMESPACE,
      subjectEntityId: null,
      predicate: 'depends_on',
      touchingEntityIds: ['e-repo', 'e-redis'],
      supersededByFactId: null,
      time: 'live',
      limit: 10,
    });

    if (!touching.ok) throw new Error(touching.error.message);
    expect(touching.value.map(({ fact }) => fact.id)).toEqual(['uses-redis']);
    expect(touching.value[0]?.objectEntity?.name).toBe('redis');
  });

  it('returns storage_failed for a row it cannot read', async () => {
    const { store, path } = openOnFile();
    await writeTimeline(store);
    // An operation this version of core does not know, written past the adapter.
    const raw = new Database(path);
    closeLater(() => raw.close());
    raw
      .prepare(
        `INSERT INTO audit_log (namespace, operation_id, operation, action, target_kind, target_id, trigger, reason_code, occurred_at)
         VALUES (?, 'op-x', 'an_operation_from_the_future', 'fact.recorded', 'fact', 'pg16', 'agent', 'stated', ?)`,
      )
      .run(NAMESPACE, NOW);

    const entries = await store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'fact',
      targetId: 'pg16',
    });

    expect(!entries.ok && entries.error.code).toBe('storage_failed');
  });

  it('returns storage_failed for a read after the store is closed', async () => {
    const { store } = openOnFile();
    await store.close();

    const found = await store.getFact({ namespace: NAMESPACE, factId: 'pg16' });

    expect(!found.ok && found.error.code).toBe('storage_failed');
  });
});
