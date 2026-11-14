import type { AuditAction, AuditEntry } from './audit.ts';
import { type Change, type ChangeSet, ChangeSetSchema } from './change-set.ts';
import { normaliseEntityName } from './entity-name.ts';
import type { Entity, Fact, FactWithSources, Namespace, Source } from './fact.ts';
import type { MemoryStore } from './memory-store.ts';
import { err, type Failure, ok } from './result.ts';
import { matchesTimeFilter, periodsOverlap } from './valid-period.ts';

/** Everything the store holds. A commit works on a copy and replaces this only if it succeeds. */
type State = {
  readonly entities: Map<string, Entity>;
  /** Namespace, type and normalised name, to the entity that holds them. */
  readonly entityKeys: Map<string, string>;
  readonly sources: Map<string, Source>;
  /** Facts in the order they were recorded. A Map keeps insertion order. */
  readonly facts: Map<string, Fact>;
  readonly factSources: Map<string, readonly string[]>;
  readonly vectors: Map<string, Float32Array>;
  readonly auditEntries: AuditEntry[];
  /** The size of the vectors held, once the first one is recorded. */
  dimensions: number | null;
};

function createEmptyState(): State {
  return {
    entities: new Map(),
    entityKeys: new Map(),
    sources: new Map(),
    facts: new Map(),
    factSources: new Map(),
    vectors: new Map(),
    auditEntries: [],
    dimensions: null,
  };
}

/** Copies the containers, not the rows. Rows are never mutated in place, so sharing them is safe. */
function copyState(state: State): State {
  return {
    entities: new Map(state.entities),
    entityKeys: new Map(state.entityKeys),
    sources: new Map(state.sources),
    facts: new Map(state.facts),
    factSources: new Map(state.factSources),
    vectors: new Map(state.vectors),
    auditEntries: [...state.auditEntries],
    dimensions: state.dimensions,
  };
}

function entityKey(namespace: Namespace, type: string, name: string): string {
  return JSON.stringify([namespace, type, normaliseEntityName(name)]);
}

const ACTION_OF_CHANGE: { readonly [Kind in Change['kind']]: AuditAction } = {
  create_entity: 'entity.created',
  record_source: 'source.recorded',
  record_fact: 'fact.recorded',
  attach_source: 'fact.source_attached',
  invalidate_fact: 'fact.invalidated',
};

function targetOf(change: Change): {
  readonly targetKind: AuditEntry['targetKind'];
  readonly targetId: string;
} {
  switch (change.kind) {
    case 'create_entity':
      return { targetKind: 'entity', targetId: change.entity.id };
    case 'record_source':
      return { targetKind: 'source', targetId: change.source.id };
    case 'record_fact':
      return { targetKind: 'fact', targetId: change.fact.id };
    case 'attach_source':
    case 'invalidate_fact':
      return { targetKind: 'fact', targetId: change.factId };
    default: {
      const unhandled: never = change;
      return unhandled;
    }
  }
}

function sameObject(first: Fact, second: Fact): boolean {
  if (first.object.kind === 'entity' && second.object.kind === 'entity') {
    return first.object.entityId === second.object.entityId;
  }
  if (first.object.kind === 'value' && second.object.kind === 'value') {
    return first.object.value === second.object.value;
  }
  return false;
}

/**
 * The fact that a recorded fact is a revised copy of, if any: a fact that a later change of
 * the same change set invalidates with a supersession link to it, and that has the same
 * subject, predicate and object.
 */
function findRevisedFactId(recorded: Fact, changes: readonly Change[], before: State): string | null {
  for (const change of changes) {
    if (change.kind !== 'invalidate_fact' || change.supersededByFactId !== recorded.id) continue;
    const invalidated = before.facts.get(change.factId);
    if (
      invalidated !== undefined &&
      invalidated.subjectEntityId === recorded.subjectEntityId &&
      invalidated.predicate === recorded.predicate &&
      sameObject(invalidated, recorded)
    ) {
      return invalidated.id;
    }
  }
  return null;
}

/** What an audit entry's detail holds for one change. Fixed per action; identifiers only. */
function detailOf(change: Change, changes: readonly Change[], before: State): AuditEntry['detail'] {
  switch (change.kind) {
    case 'create_entity':
    case 'record_source':
      return null;
    case 'record_fact': {
      const revisesFactId = findRevisedFactId(change.fact, changes, before);
      return revisesFactId === null ? null : { revisesFactId };
    }
    case 'attach_source':
      return { sourceId: change.sourceId };
    case 'invalidate_fact':
      return { supersededByFactId: change.supersededByFactId };
    default: {
      const unhandled: never = change;
      return unhandled;
    }
  }
}

function notLive(fact: Fact): Failure {
  const superseded = fact.supersededByFactId;
  return err(
    'already_invalidated',
    superseded === null
      ? `The fact ${fact.id} was invalidated and nothing superseded it.`
      : `The fact ${fact.id} was invalidated and superseded by ${superseded}. Use that fact.`,
    { relatedFactIds: superseded === null ? [] : [superseded] },
  );
}

/** Applies one change to the draft. Returns a failure and leaves the caller to discard the draft. */
function applyChange(draft: State, changeSet: ChangeSet, change: Change): Failure | null {
  const namespace = changeSet.namespace;
  const findFact = (factId: string): Fact | undefined => {
    const fact = draft.facts.get(factId);
    return fact !== undefined && fact.namespace === namespace ? fact : undefined;
  };
  const hasEntity = (entityId: string): boolean => draft.entities.get(entityId)?.namespace === namespace;
  const hasSource = (sourceId: string): boolean => draft.sources.get(sourceId)?.namespace === namespace;

  switch (change.kind) {
    case 'create_entity': {
      const { entity } = change;
      if (draft.entities.has(entity.id)) {
        return err('already_exists', `The identifier ${entity.id} is already used by an entity.`);
      }
      const key = entityKey(namespace, entity.type, entity.name);
      if (draft.entityKeys.has(key)) {
        return err(
          'already_exists',
          `An entity of type "${entity.type}" named "${entity.name}" already exists. Read it with findEntities and use it.`,
        );
      }
      draft.entities.set(entity.id, entity);
      draft.entityKeys.set(key, entity.id);
      return null;
    }
    case 'record_source': {
      if (draft.sources.has(change.source.id)) {
        return err('already_exists', `The identifier ${change.source.id} is already used by a source.`);
      }
      draft.sources.set(change.source.id, change.source);
      return null;
    }
    case 'record_fact': {
      const { fact } = change;
      if (draft.facts.has(fact.id)) {
        return err('already_exists', `The identifier ${fact.id} is already used by a fact.`);
      }
      if (!hasEntity(fact.subjectEntityId)) {
        return err(
          'not_found',
          `The subject entity ${fact.subjectEntityId} of fact ${fact.id} does not exist.`,
        );
      }
      if (fact.object.kind === 'entity' && !hasEntity(fact.object.entityId)) {
        return err(
          'not_found',
          `The object entity ${fact.object.entityId} of fact ${fact.id} does not exist.`,
        );
      }
      const missingSource = change.sourceIds.find((sourceId) => !hasSource(sourceId));
      if (missingSource !== undefined) {
        return err('not_found', `The source ${missingSource} of fact ${fact.id} does not exist.`);
      }
      let vector: Float32Array;
      if (change.embedding instanceof Float32Array) {
        vector = new Float32Array(change.embedding);
      } else {
        const copied =
          findFact(change.embedding.copyFromFactId) && draft.vectors.get(change.embedding.copyFromFactId);
        if (copied === undefined) {
          return err(
            'not_found',
            `The fact ${change.embedding.copyFromFactId}, whose vector was to be copied, does not exist.`,
          );
        }
        vector = copied;
      }
      if (draft.dimensions !== null && vector.length !== draft.dimensions) {
        return err(
          'embedding_model_mismatch',
          `The vector of fact ${fact.id} has ${vector.length} dimensions, but this memory holds vectors of ${draft.dimensions}.`,
        );
      }
      draft.dimensions = vector.length;
      draft.facts.set(fact.id, fact);
      draft.factSources.set(fact.id, [...change.sourceIds]);
      draft.vectors.set(fact.id, vector);
      return null;
    }
    case 'attach_source': {
      const fact = findFact(change.factId);
      if (fact === undefined) return err('not_found', `The fact ${change.factId} does not exist.`);
      if (fact.invalidatedAt !== null) return notLive(fact);
      if (!hasSource(change.sourceId))
        return err('not_found', `The source ${change.sourceId} does not exist.`);
      const attached = draft.factSources.get(fact.id) ?? [];
      if (attached.includes(change.sourceId)) {
        return err('already_exists', `The source ${change.sourceId} is already attached to fact ${fact.id}.`);
      }
      draft.factSources.set(fact.id, [...attached, change.sourceId]);
      return null;
    }
    case 'invalidate_fact': {
      const fact = findFact(change.factId);
      if (fact === undefined) return err('not_found', `The fact ${change.factId} does not exist.`);
      if (fact.invalidatedAt !== null) return notLive(fact);
      if (change.supersededByFactId === fact.id) {
        return err('invalid_input', `The fact ${fact.id} cannot supersede itself.`);
      }
      if (change.supersededByFactId !== null && findFact(change.supersededByFactId) === undefined) {
        return err('not_found', `The superseding fact ${change.supersededByFactId} does not exist.`);
      }
      if (changeSet.occurredAt < fact.createdAt) {
        return err('invalid_input', `The fact ${fact.id} cannot be invalidated before it was recorded.`);
      }
      // The one change ever made to a fact: a new object replaces the stored one.
      draft.facts.set(fact.id, {
        ...fact,
        invalidatedAt: changeSet.occurredAt,
        supersededByFactId: change.supersededByFactId,
      });
      return null;
    }
    default: {
      const unhandled: never = change;
      return unhandled;
    }
  }
}

/**
 * The single-value rule, checked on the result of a change set: no fact it recorded for a
 * single-valued predicate may overlap, in valid time, another live fact with the same
 * subject and predicate. The object is not compared.
 */
function findSingleValueConflict(draft: State, changeSet: ChangeSet): Failure | null {
  for (const change of changeSet.changes) {
    if (change.kind !== 'record_fact' || !change.singleValued) continue;
    const recorded = draft.facts.get(change.fact.id);
    if (recorded === undefined || recorded.invalidatedAt !== null) continue;
    const overlapping = [...draft.facts.values()].filter(
      (other) =>
        other.id !== recorded.id &&
        other.namespace === recorded.namespace &&
        other.invalidatedAt === null &&
        other.subjectEntityId === recorded.subjectEntityId &&
        other.predicate === recorded.predicate &&
        periodsOverlap(recorded, other),
    );
    if (overlapping.length > 0) {
      const ids = overlapping.map((other) => other.id);
      return err(
        'conflict',
        `The fact ${recorded.id} overlaps in valid time with ${ids.join(', ')}, for the single-valued predicate "${recorded.predicate}". End or invalidate the stored fact first.`,
        { relatedFactIds: ids },
      );
    }
  }
  return null;
}

/**
 * Creates a `MemoryStore` that keeps everything in memory. It is a complete implementation
 * of the interface, not a mock: use cases are tested against it, and the storage contract
 * suite runs against it so that it cannot drift from the SQLite adapter.
 */
export function createInMemoryStore(): MemoryStore {
  let state = createEmptyState();

  /** Builds what a read returns for one fact. Copies, so a caller cannot change memory through a result. */
  const withSources = (fact: Fact): FactWithSources | null => {
    const subject = state.entities.get(fact.subjectEntityId);
    if (subject === undefined) return null;
    const objectEntity =
      fact.object.kind === 'entity' ? (state.entities.get(fact.object.entityId) ?? null) : null;
    const sources = (state.factSources.get(fact.id) ?? []).flatMap((sourceId) => {
      const source = state.sources.get(sourceId);
      return source === undefined ? [] : [source];
    });
    return structuredClone({ fact, subject, objectEntity, sources });
  };

  const lanesNotBuilt = (): Promise<Failure> =>
    Promise.resolve(err('storage_failed', 'The in-memory store has no retrieval lanes yet.'));

  const store: MemoryStore = {
    commit(changeSet) {
      const parsed = ChangeSetSchema.safeParse(changeSet);
      if (!parsed.success) {
        const reasons = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
        return Promise.resolve(err('invalid_input', `The change set is not valid. ${reasons.join(' ')}`));
      }
      const draft = copyState(state);
      for (const change of changeSet.changes) {
        const failure = applyChange(draft, changeSet, change);
        if (failure !== null) return Promise.resolve(failure);
      }
      const conflict = findSingleValueConflict(draft, changeSet);
      if (conflict !== null) return Promise.resolve(conflict);

      for (const change of changeSet.changes) {
        draft.auditEntries.push({
          id: draft.auditEntries.length + 1,
          namespace: changeSet.namespace,
          operationId: changeSet.operationId,
          operation: changeSet.operation,
          action: ACTION_OF_CHANGE[change.kind],
          ...targetOf(change),
          trigger: changeSet.trigger,
          reasonCode: changeSet.reasonCode,
          sourceId: changeSet.explainedBySourceId,
          detail: detailOf(change, changeSet.changes, state),
          occurredAt: changeSet.occurredAt,
        });
      }
      state = draft;
      return Promise.resolve(
        ok({ operationId: changeSet.operationId, auditEntryCount: changeSet.changes.length }),
      );
    },

    findEntities(query) {
      const wanted = normaliseEntityName(query.name);
      const found = [...state.entities.values()].filter(
        (entity) =>
          entity.namespace === query.namespace &&
          normaliseEntityName(entity.name) === wanted &&
          (query.type === null || entity.type === query.type),
      );
      return Promise.resolve(ok(structuredClone(found)));
    },

    getFact(query) {
      const fact = state.facts.get(query.factId);
      if (fact === undefined || fact.namespace !== query.namespace) return Promise.resolve(ok(null));
      return Promise.resolve(ok(withSources(fact)));
    },

    listFacts(query) {
      if (!Number.isInteger(query.limit) || query.limit < 1) {
        return Promise.resolve(err('invalid_input', 'The limit must be a whole number of at least 1.'));
      }
      const { time } = query;
      const touching = query.touchingEntityIds === null ? null : new Set(query.touchingEntityIds);
      const matches = (fact: Fact): boolean => {
        if (fact.namespace !== query.namespace) return false;
        if (query.subjectEntityId !== null && fact.subjectEntityId !== query.subjectEntityId) return false;
        if (query.predicate !== null && fact.predicate !== query.predicate) return false;
        if (query.supersededByFactId !== null && fact.supersededByFactId !== query.supersededByFactId)
          return false;
        if (touching !== null) {
          const touchesObject = fact.object.kind === 'entity' && touching.has(fact.object.entityId);
          if (!touching.has(fact.subjectEntityId) && !touchesObject) return false;
        }
        if (time === 'all') return true;
        if (time === 'live') return fact.invalidatedAt === null;
        return matchesTimeFilter(fact, time);
      };
      // Newest first by recorded time. Facts recorded at the same moment keep the reverse of their recording order.
      const newestFirst = [...state.facts.values()]
        .map((fact, position) => ({ fact, position }))
        .filter(({ fact }) => matches(fact))
        .sort((a, b) =>
          a.fact.createdAt === b.fact.createdAt
            ? b.position - a.position
            : a.fact.createdAt < b.fact.createdAt
              ? 1
              : -1,
        )
        .slice(0, query.limit);
      const results = newestFirst.flatMap(({ fact }) => {
        const result = withSources(fact);
        return result === null ? [] : [result];
      });
      return Promise.resolve(ok(results));
    },

    searchFactsByVector: lanesNotBuilt,
    searchFactsByKeyword: lanesNotBuilt,

    getSource(query) {
      const source = state.sources.get(query.sourceId);
      if (source === undefined || source.namespace !== query.namespace) return Promise.resolve(ok(null));
      return Promise.resolve(ok(structuredClone(source)));
    },

    listAuditEntries(query) {
      const entries = state.auditEntries.filter(
        (entry) =>
          entry.namespace === query.namespace &&
          entry.targetKind === query.targetKind &&
          entry.targetId === query.targetId,
      );
      return Promise.resolve(ok(structuredClone(entries)));
    },

    close() {
      return Promise.resolve();
    },
  };
  return store;
}
