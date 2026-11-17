import type { Change } from '../change-set.ts';
import type { Domain } from '../domain.ts';
import { type Entity, type Fact, FactSchema, type Namespace, type SourceId } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { err, ok, type Result } from '../result.ts';
import type { Timestamp } from '../timestamp.ts';
import type { FactDraft } from './operation-inputs.ts';

/** A fact ready to be recorded: validated, with its vector and its predicate's cardinality. */
export type PreparedFact = {
  readonly fact: Fact;
  readonly vector: Float32Array;
  readonly singleValued: boolean;
};

export type PreparedDrafts = {
  /** In draft order. */
  readonly facts: readonly PreparedFact[];
  /** Each new entity once, even when several drafts introduce it. */
  readonly newEntities: readonly Entity[];
};

/** Names what the domain does not have among the predicates and entity types of the drafts. */
function findNamesOutsideDomain(drafts: readonly FactDraft[], domain: Domain): string[] {
  const predicates = new Set(domain.predicates.map((predicate) => predicate.name));
  const problems: string[] = [];
  for (const draft of drafts) {
    if (!predicates.has(draft.fact.predicate)) problems.push(`the predicate "${draft.fact.predicate}"`);
    for (const entity of draft.newEntities) {
      if (!domain.entityTypes.includes(entity.type)) problems.push(`the entity type "${entity.type}"`);
    }
  }
  return [...new Set(problems)];
}

function collectNewEntities(
  drafts: readonly FactDraft[],
  namespace: Namespace,
  createdAt: Timestamp,
): Entity[] {
  const entities = new Map<string, Entity>();
  for (const draft of drafts) {
    for (const entity of draft.newEntities) {
      if (!entities.has(entity.id)) entities.set(entity.id, { ...entity, namespace, createdAt });
    }
  }
  return [...entities.values()];
}

/**
 * Checks drafts against the domain and the rules of a fact, gives each fact an identifier,
 * and embeds all statements in one call. Returns `invalid_input` or `embedding_failed`, and
 * calls the embedder only when there is a draft.
 */
export async function prepareFactDrafts(
  deps: Pick<OperationDeps, 'domain' | 'embedder' | 'newId'>,
  parts: {
    readonly namespace: Namespace;
    readonly drafts: readonly FactDraft[];
    readonly createdAt: Timestamp;
  },
): Promise<Result<PreparedDrafts>> {
  const { namespace, drafts, createdAt } = parts;
  const outside = findNamesOutsideDomain(drafts, deps.domain);
  if (outside.length > 0) {
    const predicates = deps.domain.predicates.map((predicate) => predicate.name).join(', ');
    return err(
      'invalid_input',
      `The domain "${deps.domain.name}" does not have ${outside.join(' or ')}. Its predicates are ${predicates}; its entity types are ${deps.domain.entityTypes.join(', ')}.`,
    );
  }

  const facts: Fact[] = [];
  for (const draft of drafts) {
    const parsed = FactSchema.safeParse({
      ...draft.fact,
      id: deps.newId(),
      namespace,
      createdAt,
      invalidatedAt: null,
      purgedAt: null,
      supersededByFactId: null,
    });
    if (!parsed.success) {
      const reasons = parsed.error.issues.map((issue) => issue.message).join(' ');
      return err('invalid_input', `The fact "${draft.fact.statement}" is not valid. ${reasons}`);
    }
    facts.push(parsed.data);
  }
  if (facts.length === 0) return ok({ facts: [], newEntities: [] });

  const embedded = await deps.embedder.embed(
    facts.map((fact) => fact.statement),
    'statement',
  );
  if (!embedded.ok) return embedded;
  const vectors = embedded.value;
  if (vectors.length !== facts.length) {
    return err(
      'embedding_failed',
      `The embedder returned ${vectors.length} vectors for ${facts.length} statements.`,
    );
  }

  const cardinalityOf = new Map(
    deps.domain.predicates.map((predicate) => [predicate.name, predicate.cardinality]),
  );
  return ok({
    facts: facts.flatMap((fact, index) => {
      const vector = vectors[index];
      return vector === undefined
        ? []
        : [{ fact, vector, singleValued: cardinalityOf.get(fact.predicate) === 'single' }];
    }),
    newEntities: collectNewEntities(drafts, namespace, createdAt),
  });
}

/** The changes that record prepared drafts with one source: each new entity, then each fact. */
export function buildRecordChanges(prepared: PreparedDrafts, sourceId: SourceId): Change[] {
  return [
    ...prepared.newEntities.map((entity): Change => ({ kind: 'create_entity', entity })),
    ...prepared.facts.map(
      ({ fact, vector, singleValued }): Change => ({
        kind: 'record_fact',
        fact,
        sourceIds: [sourceId],
        embedding: vector,
        singleValued,
      }),
    ),
  ];
}
