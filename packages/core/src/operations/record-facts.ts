import type { Change, ChangeSet } from '../change-set.ts';
import type { Domain } from '../domain.ts';
import { type Entity, type Fact, type FactId, FactSchema, type Source, type SourceId } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { err, ok, type Result } from '../result.ts';
import type { Timestamp } from '../timestamp.ts';
import { hashContent } from './hash-content.ts';
import type { ChangeContext, FactDraft, NewSource } from './operation-inputs.ts';

export type RecordFactsInput = ChangeContext & {
  readonly source: NewSource;
  readonly drafts: readonly FactDraft[];
  /** Live facts this source states again. The source is attached to each; no new row is written. */
  readonly restatedFactIds: readonly FactId[];
};

/**
 * Builds the one change set of `recordFacts`: the source, each new entity once, each fact
 * with the source and its vector, then the source attached to each restated fact. Pure: every
 * identifier, time and vector is given.
 */
export function buildRecordFactsChangeSet(parts: {
  readonly context: ChangeContext;
  readonly operationId: string;
  readonly occurredAt: Timestamp;
  readonly source: Source;
  readonly newEntities: readonly Entity[];
  readonly facts: readonly {
    readonly fact: Fact;
    readonly vector: Float32Array;
    readonly singleValued: boolean;
  }[];
  readonly restatedFactIds: readonly FactId[];
}): ChangeSet {
  const seenEntityIds = new Set<string>();
  const entityChanges: Change[] = [];
  for (const entity of parts.newEntities) {
    if (seenEntityIds.has(entity.id)) continue;
    seenEntityIds.add(entity.id);
    entityChanges.push({ kind: 'create_entity', entity });
  }
  return {
    namespace: parts.context.namespace,
    operationId: parts.operationId,
    operation: 'remember',
    trigger: parts.context.trigger,
    reasonCode: parts.context.reasonCode,
    explainedBySourceId: parts.source.id,
    occurredAt: parts.occurredAt,
    changes: [
      { kind: 'record_source', source: parts.source },
      ...entityChanges,
      ...parts.facts.map(
        ({ fact, vector, singleValued }): Change => ({
          kind: 'record_fact',
          fact,
          sourceIds: [parts.source.id],
          embedding: vector,
          singleValued,
        }),
      ),
      ...parts.restatedFactIds.map(
        (factId): Change => ({ kind: 'attach_source', factId, sourceId: parts.source.id }),
      ),
    ],
  };
}

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

/**
 * Records what was learned from one source, in one commit: the source, new entities, new
 * facts, and the source attached to each live fact it states again. All or nothing: if any
 * draft breaks the single-value rule, nothing is recorded and the result is `conflict`.
 */
export async function recordFacts(
  deps: OperationDeps,
  input: RecordFactsInput,
): Promise<Result<{ readonly sourceId: SourceId; readonly factIds: readonly FactId[] }>> {
  if (input.drafts.length === 0 && input.restatedFactIds.length === 0) {
    return err(
      'invalid_input',
      'There is nothing to record: give at least one fact, or one fact that the source restates.',
    );
  }
  const outside = findNamesOutsideDomain(input.drafts, deps.domain);
  if (outside.length > 0) {
    const predicates = deps.domain.predicates.map((predicate) => predicate.name).join(', ');
    return err(
      'invalid_input',
      `The domain "${deps.domain.name}" does not have ${outside.join(' or ')}. Its predicates are ${predicates}; its entity types are ${deps.domain.entityTypes.join(', ')}.`,
    );
  }

  const now = deps.now();
  const namespace = input.namespace;
  const facts: Fact[] = [];
  for (const draft of input.drafts) {
    const parsed = FactSchema.safeParse({
      ...draft.fact,
      id: deps.newId(),
      namespace,
      createdAt: now,
      invalidatedAt: null,
      supersededByFactId: null,
    });
    if (!parsed.success) {
      const reasons = parsed.error.issues.map((issue) => issue.message).join(' ');
      return err('invalid_input', `The fact "${draft.fact.statement}" is not valid. ${reasons}`);
    }
    facts.push(parsed.data);
  }

  let vectors: readonly Float32Array[] = [];
  if (facts.length > 0) {
    const embedded = await deps.embedder.embed(
      facts.map((fact) => fact.statement),
      'statement',
    );
    if (!embedded.ok) return embedded;
    if (embedded.value.length !== facts.length) {
      return err(
        'embedding_failed',
        `The embedder returned ${embedded.value.length} vectors for ${facts.length} statements.`,
      );
    }
    vectors = embedded.value;
  }

  const cardinalityOf = new Map(
    deps.domain.predicates.map((predicate) => [predicate.name, predicate.cardinality]),
  );
  const source: Source = {
    ...input.source,
    id: deps.newId(),
    namespace,
    contentHash: input.source.content === null ? null : await hashContent(input.source.content),
    createdAt: now,
  };
  const changeSet = buildRecordFactsChangeSet({
    context: input,
    operationId: deps.newId(),
    occurredAt: now,
    source,
    newEntities: input.drafts.flatMap((draft) =>
      draft.newEntities.map((entity): Entity => ({ ...entity, namespace, createdAt: now })),
    ),
    facts: facts.flatMap((fact, index) => {
      const vector = vectors[index];
      return vector === undefined
        ? []
        : [{ fact, vector, singleValued: cardinalityOf.get(fact.predicate) === 'single' }];
    }),
    restatedFactIds: input.restatedFactIds,
  });

  const committed = await deps.store.commit(changeSet);
  if (!committed.ok) return committed;
  return ok({ sourceId: source.id, factIds: facts.map((fact) => fact.id) });
}
