import { describe, expect, it } from 'vitest';
import { AuditEntrySchema } from './audit.ts';
import { ChangeSetSchema } from './change-set.ts';
import { DomainSchema } from './domain.ts';
import { EntitySchema, FactObjectSchema, FactSchema, SourceSchema } from './fact.ts';

const NAMESPACE = 'repo:example';
const at = (day: string): string => `${day}T00:00:00.000Z`;

/** A fact of the example timeline, with the fields that vary. */
function fact(fields: {
  id: string;
  predicate: string;
  value: string;
  validFrom?: string | null;
  validTo?: string | null;
  createdAt: string;
  invalidatedAt?: string | null;
  supersededByFactId?: string | null;
}): Record<string, unknown> {
  return {
    id: fields.id,
    namespace: NAMESPACE,
    subjectEntityId: 'e-repo',
    predicate: fields.predicate,
    object: { kind: 'value', value: fields.value },
    statement: `The example repository: ${fields.predicate} is ${fields.value}`,
    confidence: 1,
    validFrom: fields.validFrom ?? null,
    validTo: fields.validTo ?? null,
    createdAt: fields.createdAt,
    invalidatedAt: fields.invalidatedAt ?? null,
    supersededByFactId: fields.supersededByFactId ?? null,
    purgedAt: null,
  };
}

// The seven fact rows the fact-schema spike ends with in its example namespace:
// PostgreSQL 14 was upgraded to 16 (a succession), CI was on Node 22 and not Node 20
// (a correction), and the date of the upgrade was then corrected.
const DB = 'uses_database_version';
const NODE = 'ci_node_version';
const TIMELINE = [
  fact({
    id: 'pg14',
    predicate: DB,
    value: 'PostgreSQL 14',
    validFrom: at('2025-06-01'),
    createdAt: at('2026-01-10'),
    invalidatedAt: at('2026-04-02'),
    supersededByFactId: 'pg14-ended',
  }),
  fact({
    id: 'node20',
    predicate: NODE,
    value: 'Node 20',
    createdAt: at('2026-01-10'),
    invalidatedAt: at('2026-05-01'),
    supersededByFactId: 'node22',
  }),
  fact({
    id: 'pg14-ended',
    predicate: DB,
    value: 'PostgreSQL 14',
    validFrom: at('2025-06-01'),
    validTo: at('2026-03-15'),
    createdAt: at('2026-04-02'),
    invalidatedAt: at('2026-06-01'),
    supersededByFactId: 'pg14-ended-2',
  }),
  fact({
    id: 'pg16',
    predicate: DB,
    value: 'PostgreSQL 16',
    validFrom: at('2026-03-15'),
    createdAt: at('2026-04-02'),
    invalidatedAt: at('2026-06-01'),
    supersededByFactId: 'pg16-2',
  }),
  fact({ id: 'node22', predicate: NODE, value: 'Node 22', createdAt: at('2026-05-01') }),
  fact({
    id: 'pg14-ended-2',
    predicate: DB,
    value: 'PostgreSQL 14',
    validFrom: at('2025-06-01'),
    validTo: at('2026-03-20'),
    createdAt: at('2026-06-01'),
  }),
  fact({
    id: 'pg16-2',
    predicate: DB,
    value: 'PostgreSQL 16',
    validFrom: at('2026-03-20'),
    createdAt: at('2026-06-01'),
  }),
];

const current = fact({
  id: 'f-1',
  predicate: DB,
  value: 'PostgreSQL 16',
  validFrom: at('2026-03-15'),
  createdAt: at('2026-04-02'),
});
const entity = {
  id: 'e-repo',
  namespace: NAMESPACE,
  type: 'repository',
  name: 'example',
  createdAt: at('2026-01-10'),
};
const source = {
  id: 's-1',
  namespace: NAMESPACE,
  kind: 'agent_note',
  locator: null,
  version: null,
  content: 'We run PostgreSQL 16.',
  contentHash: null,
  purgedAt: null,
  observedAt: at('2026-04-02'),
  createdAt: at('2026-04-02'),
};

/** A change set that records one source and one fact, with the parts a test replaces. */
function changeSet(
  overrides: Record<string, unknown> = {},
  factChange: Record<string, unknown> = {},
): unknown {
  return {
    namespace: NAMESPACE,
    operationId: 'op-1',
    operation: 'remember',
    trigger: 'agent',
    reasonCode: 'stated',
    explainedBySourceId: 's-1',
    occurredAt: at('2026-04-02'),
    changes: [
      { kind: 'create_entity', entity },
      { kind: 'record_source', source },
      {
        kind: 'record_fact',
        fact: current,
        sourceIds: ['s-1'],
        embedding: new Float32Array([1, 0, 0, 0]),
        singleValued: true,
        ...factChange,
      },
    ],
    ...overrides,
  };
}

/** The messages of the issues a schema raises for a value, or an empty list when it accepts it. */
function issues(
  schema: { safeParse(value: unknown): { success: boolean; error?: { issues: { message: string }[] } } },
  value: unknown,
): string[] {
  const parsed = schema.safeParse(value);
  return parsed.success ? [] : (parsed.error?.issues ?? []).map((issue) => issue.message);
}

describe('FactSchema', () => {
  it('accepts the facts of the PostgreSQL and Node timeline', () => {
    expect(TIMELINE).toHaveLength(7);
    for (const row of TIMELINE) expect(issues(FactSchema, row)).toEqual([]);
  });

  it.each([
    ['a confidence above 1', { ...current, confidence: 1.5 }],
    ['a confidence below 0', { ...current, confidence: -0.1 }],
    ['a valid period that ends when it starts', { ...current, validTo: current.validFrom }],
    ['a valid period that ends before it starts', { ...current, validTo: at('2026-01-01') }],
    ['an invalidation before the fact was recorded', { ...current, invalidatedAt: at('2026-04-01') }],
    ['a supersession link on a fact that is not invalidated', { ...current, supersededByFactId: 'f-2' }],
    [
      'a fact that supersedes itself',
      { ...current, invalidatedAt: at('2026-05-01'), supersededByFactId: 'f-1' },
    ],
    ['an empty statement', { ...current, statement: '' }],
    ['an empty predicate', { ...current, predicate: '' }],
  ])('rejects a fact that breaks a rule the database also enforces: %s', (_rule, value) => {
    expect(issues(FactSchema, value).length).toBeGreaterThan(0);
  });

  it('rejects a timestamp in another form, and a missing field', () => {
    expect(issues(FactSchema, { ...current, createdAt: '2026-04-02 00:00:00' }).length).toBeGreaterThan(0);
    const { confidence: _confidence, ...withoutConfidence } = current;
    expect(issues(FactSchema, withoutConfidence).length).toBeGreaterThan(0);
  });

  it('rejects an unknown key', () => {
    expect(issues(FactSchema, { ...current, note: 'extra' }).length).toBeGreaterThan(0);
    expect(issues(EntitySchema, { ...entity, alias: 'x' }).length).toBeGreaterThan(0);
    expect(issues(SourceSchema, { ...source, author: 'x' }).length).toBeGreaterThan(0);
  });
});

describe('FactObjectSchema', () => {
  it('accepts an entity or a value', () => {
    expect(issues(FactObjectSchema, { kind: 'entity', entityId: 'e-1' })).toEqual([]);
    expect(issues(FactObjectSchema, { kind: 'value', value: 'PostgreSQL 16' })).toEqual([]);
  });

  it('rejects an object with both an entity and a value, or with neither', () => {
    expect(issues(FactObjectSchema, { kind: 'entity', entityId: 'e-1', value: 'x' }).length).toBeGreaterThan(
      0,
    );
    expect(issues(FactObjectSchema, { kind: 'value' }).length).toBeGreaterThan(0);
    expect(issues(FactObjectSchema, { kind: 'entity' }).length).toBeGreaterThan(0);
    expect(issues(FactObjectSchema, {}).length).toBeGreaterThan(0);
  });
});

describe('ChangeSetSchema', () => {
  it('accepts a change set that records an entity, a source and a fact', () => {
    expect(issues(ChangeSetSchema, changeSet())).toEqual([]);
  });

  it('accepts a fact that copies the vector of the fact it revises', () => {
    expect(issues(ChangeSetSchema, changeSet({}, { embedding: { copyFromFactId: 'f-0' } }))).toEqual([]);
  });

  it('rejects a change set that records a fact with no source', () => {
    expect(issues(ChangeSetSchema, changeSet({}, { sourceIds: [] })).length).toBeGreaterThan(0);
  });

  it('rejects a change set that holds a row from another namespace', () => {
    const foreignFact = changeSet({}, { fact: { ...current, namespace: 'repo:other' } });
    expect(issues(ChangeSetSchema, foreignFact).join(' ')).toContain('fact f-1 is in another namespace');
    const foreignEntity = changeSet({
      changes: [{ kind: 'create_entity', entity: { ...entity, namespace: 'repo:other' } }],
    });
    expect(issues(ChangeSetSchema, foreignEntity).join(' ')).toContain(
      'entity e-repo is in another namespace',
    );
    const foreignSource = changeSet({
      changes: [{ kind: 'record_source', source: { ...source, namespace: 'repo:other' } }],
    });
    expect(issues(ChangeSetSchema, foreignSource).join(' ')).toContain('source s-1 is in another namespace');
  });

  it('rejects an empty operation identifier', () => {
    expect(issues(ChangeSetSchema, changeSet({ operationId: '' })).length).toBeGreaterThan(0);
  });

  it('rejects a vector that is empty or is not a Float32Array', () => {
    expect(
      issues(ChangeSetSchema, changeSet({}, { embedding: new Float32Array([]) })).length,
    ).toBeGreaterThan(0);
    expect(issues(ChangeSetSchema, changeSet({}, { embedding: [1, 0, 0, 0] })).length).toBeGreaterThan(0);
  });

  it('rejects a kind of change, an operation or a reason that is not in the closed lists', () => {
    expect(
      issues(ChangeSetSchema, changeSet({ changes: [{ kind: 'merge_entities' }] })).length,
    ).toBeGreaterThan(0);
    expect(issues(ChangeSetSchema, changeSet({ operation: 'deletion' })).length).toBeGreaterThan(0);
    expect(issues(ChangeSetSchema, changeSet({ reasonCode: 'because' })).length).toBeGreaterThan(0);
    expect(issues(ChangeSetSchema, changeSet({ trigger: 'robot' })).length).toBeGreaterThan(0);
  });
});

describe('AuditEntrySchema', () => {
  const entry = {
    id: 1,
    namespace: NAMESPACE,
    operationId: 'op-1',
    operation: 'succession',
    action: 'fact.invalidated',
    targetKind: 'fact',
    targetId: 'pg14',
    trigger: 'agent',
    reasonCode: 'reported_ended',
    sourceId: 's-2',
    detail: { supersededByFactId: 'pg14-ended' },
    occurredAt: at('2026-04-02'),
  };

  it('accepts an entry whose detail holds identifiers and numbers, or nothing', () => {
    expect(issues(AuditEntrySchema, entry)).toEqual([]);
    expect(issues(AuditEntrySchema, { ...entry, detail: null, sourceId: null })).toEqual([]);
    expect(issues(AuditEntrySchema, { ...entry, detail: { count: 2, supersededByFactId: null } })).toEqual(
      [],
    );
  });

  it("rejects free text nested in an audit entry's detail", () => {
    expect(
      issues(AuditEntrySchema, { ...entry, detail: { note: { text: 'we moved to Vitest' } } }).length,
    ).toBeGreaterThan(0);
    expect(
      issues(AuditEntrySchema, { ...entry, detail: { notes: ['we moved to Vitest'] } }).length,
    ).toBeGreaterThan(0);
  });

  it('rejects a free-text reason, which belongs in a source', () => {
    expect(issues(AuditEntrySchema, { ...entry, reason: 'we moved to Vitest' }).length).toBeGreaterThan(0);
  });
});

describe('DomainSchema', () => {
  const domain = {
    name: 'software-development',
    entityTypes: ['repository', 'dependency'],
    predicates: [
      {
        name: 'uses_test_framework',
        description: 'The test framework a repository uses.',
        cardinality: 'single',
      },
      { name: 'depends_on', description: 'A dependency a repository has.', cardinality: 'multi' },
    ],
    extractionInstructions: 'Extract facts about the repository.',
    correctionPolicy: 'automatic',
  };

  it('accepts a domain with entity types and distinct predicates', () => {
    expect(issues(DomainSchema, domain)).toEqual([]);
  });

  it('rejects a domain with a repeated predicate name', () => {
    const repeated = { ...domain, predicates: [...domain.predicates, domain.predicates[0]] };
    expect(issues(DomainSchema, repeated).join(' ')).toContain(
      '"uses_test_framework" is defined more than once',
    );
  });

  it('rejects a domain with no entity type', () => {
    expect(issues(DomainSchema, { ...domain, entityTypes: [] }).length).toBeGreaterThan(0);
  });
});
