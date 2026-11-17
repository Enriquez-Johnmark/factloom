import type { AuditAction, AuditEntry } from './audit.ts';
import { type Change, type ChangeSet, ChangeSetSchema } from './change-set.ts';
import { normaliseEntityName } from './entity-name.ts';
import {
  type Entity,
  type Fact,
  type FactWithSources,
  type Namespace,
  PURGED_MARKER,
  type Source,
  type TimeFilter,
} from './fact.ts';
import type { EntityMerge } from './entity-merge.ts';
import type { FactUsage } from './fact-usage.ts';
import type { FactVerification } from './fact-verification.ts';
import type { Feedback } from './feedback.ts';
import type { MemoryStore } from './memory-store.ts';
import { err, type Failure, ok } from './result.ts';
import type { Timestamp } from './timestamp.ts';
import { matchesTimeFilter, periodsOverlap } from './valid-period.ts';

/** One archiving of a fact, open while `unarchivedAt` is null. */
type ArchiveRow = {
  readonly id: string;
  readonly factId: string;
  readonly archivedAt: Timestamp;
  readonly unarchivedAt: Timestamp | null;
};

/** One confidence adjustment of a fact. */
type ConfidenceRow = { readonly factId: string; readonly confidence: number; readonly adjustedAt: Timestamp };

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
  /** Confidence adjustments in the order they were recorded. The fact rows keep their confidence at recording. */
  readonly confidences: ConfidenceRow[];
  readonly feedback: Map<string, Feedback>;
  /** Entity merges in the order they were made, undone ones included. */
  readonly merges: EntityMerge[];
  /** Verifications in the order they were recorded. */
  readonly verifications: FactVerification[];
  /** Archivings in the order they were made, ended ones included. */
  readonly archives: ArchiveRow[];
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
    confidences: [],
    feedback: new Map(),
    merges: [],
    verifications: [],
    archives: [],
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
    confidences: [...state.confidences],
    feedback: new Map(state.feedback),
    merges: [...state.merges],
    verifications: [...state.verifications],
    archives: [...state.archives],
    dimensions: state.dimensions,
  };
}

function entityKey(namespace: Namespace, type: string, name: string): string {
  return JSON.stringify([namespace, type, normaliseEntityName(name)]);
}

const ACTION_OF_CHANGE: { readonly [Kind in Exclude<Change['kind'], 'purge_content'>]: AuditAction } = {
  create_entity: 'entity.created',
  record_source: 'source.recorded',
  record_fact: 'fact.recorded',
  attach_source: 'fact.source_attached',
  invalidate_fact: 'fact.invalidated',
  adjust_confidence: 'fact.confidence_adjusted',
  record_feedback: 'feedback.recorded',
  merge_entities: 'entity.merged',
  undo_entity_merge: 'entity.merge_undone',
  record_verification: 'fact.verified',
  archive_fact: 'fact.archived',
  unarchive_fact: 'fact.unarchived',
};

/** What happened to the target of a change. A purge's action depends on what it purged. */
function actionOf(change: Change): AuditAction {
  if (change.kind === 'purge_content')
    return change.targetKind === 'source' ? 'source.purged' : 'fact.purged';
  return ACTION_OF_CHANGE[change.kind];
}

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
    case 'adjust_confidence':
      return { targetKind: 'fact', targetId: change.factId };
    case 'record_feedback':
      return { targetKind: 'feedback', targetId: change.feedback.id };
    case 'purge_content':
      return { targetKind: change.targetKind, targetId: change.targetId };
    case 'merge_entities':
      return { targetKind: 'entity', targetId: change.merge.fromEntityId };
    case 'undo_entity_merge':
      return { targetKind: 'entity', targetId: change.fromEntityId };
    case 'record_verification':
      return { targetKind: 'fact', targetId: change.verification.factId };
    case 'archive_fact':
    case 'unarchive_fact':
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

/**
 * The confidence of a fact at a known-at date: the latest adjustment recorded at or before it,
 * or the confidence at recording when there is none. With no date, the latest adjustment.
 * Adjustments with the same time are ordered by recording, so the later one wins.
 */
function confidenceAt(confidences: readonly ConfidenceRow[], fact: Fact, knownAt: Timestamp | null): number {
  let latest: ConfidenceRow | null = null;
  for (const row of confidences) {
    if (row.factId !== fact.id || (knownAt !== null && row.adjustedAt > knownAt)) continue;
    if (latest === null || row.adjustedAt >= latest.adjustedAt) latest = row;
  }
  return latest?.confidence ?? fact.confidence;
}

/**
 * The confidence a fact had before an adjustment in a change set: that of an earlier
 * adjustment of the same fact in the same change set, or else its latest before the commit.
 */
function previousConfidence(factId: string, earlier: readonly Change[], before: State): number | null {
  const lastEarlier = earlier.findLast(
    (other) => other.kind === 'adjust_confidence' && other.factId === factId,
  );
  if (lastEarlier?.kind === 'adjust_confidence') return lastEarlier.confidence;
  const fact = before.facts.get(factId);
  return fact === undefined ? null : confidenceAt(before.confidences, fact, null);
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
    case 'adjust_confidence':
      return {
        previousConfidence: previousConfidence(
          change.factId,
          changes.slice(0, changes.indexOf(change)),
          before,
        ),
        confidence: change.confidence,
      };
    case 'record_feedback':
      return { factId: change.feedback.factId };
    case 'purge_content':
      return null;
    case 'merge_entities':
      return { intoEntityId: change.merge.intoEntityId, mergeId: change.merge.id };
    case 'undo_entity_merge':
      return { mergeId: change.mergeId };
    case 'record_verification':
      return { verificationId: change.verification.id };
    case 'archive_fact':
      return { archiveId: change.archiveId };
    case 'unarchive_fact':
      // The archiving it ends: the one in force before the commit.
      return { archiveId: findOpenArchive(before, change.factId)?.id ?? null };
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

/** The merges in force: those not undone. */
function mergesInForce(merges: readonly EntityMerge[]): EntityMerge[] {
  return merges.filter((merge) => merge.undoneAt === null);
}

/** The entity an identifier resolves to: the end of its chain of merges in force, or itself. */
function resolveEntityId(merges: readonly EntityMerge[], entityId: string): string {
  const inForce = mergesInForce(merges);
  let current = entityId;
  // Bounded by the refusal of cycles: each step moves to an entity not seen before.
  for (let step = 0; step <= inForce.length; step += 1) {
    const next = inForce.find((merge) => merge.fromEntityId === current)?.intoEntityId;
    if (next === undefined) return current;
    current = next;
  }
  return current;
}

/** Every identifier that resolves to the same entity as this one, through the whole chain. */
function sameEntityIds(merges: readonly EntityMerge[], entityId: string): Set<string> {
  const resolved = resolveEntityId(merges, entityId);
  const ids = new Set([entityId, resolved]);
  for (const merge of mergesInForce(merges)) {
    if (resolveEntityId(merges, merge.fromEntityId) === resolved) ids.add(merge.fromEntityId);
  }
  return ids;
}

/** The latest verification of a fact: the latest time, and of two with one time the later recorded. */
function latestVerification(
  verifications: readonly FactVerification[],
  factId: string,
): FactVerification | null {
  let latest: FactVerification | null = null;
  for (const verification of verifications) {
    if (verification.factId !== factId) continue;
    if (latest === null || verification.verifiedAt >= latest.verifiedAt) latest = verification;
  }
  return latest;
}

/** Whether two live facts disagree: different objects, as stored, with overlapping valid periods. */
function disagree(first: Fact, second: Fact): boolean {
  return !sameObject(first, second) && periodsOverlap(first, second);
}

/**
 * Records a merge, refusing an entity already merged, a cycle, and a merge whose two entities,
 * with everything merged into each, hold different live values for a single-valued predicate
 * (INTERFACES.md, "The single-value rule after a merge").
 */
function recordMerge(
  draft: State,
  changeSet: ChangeSet,
  merge: EntityMerge,
  singleValuedPredicates: readonly string[],
): Failure | null {
  for (const entityId of [merge.fromEntityId, merge.intoEntityId]) {
    if (draft.entities.get(entityId)?.namespace !== changeSet.namespace) {
      return err('not_found', `The entity ${entityId} does not exist.`);
    }
  }
  if (merge.fromEntityId === merge.intoEntityId)
    return err('invalid_input', 'An entity cannot be merged with itself.');
  if (draft.merges.some((known) => known.id === merge.id)) {
    return err('already_exists', `The identifier ${merge.id} is already used by a merge.`);
  }
  if (mergesInForce(draft.merges).some((known) => known.fromEntityId === merge.fromEntityId)) {
    return err('already_exists', `The entity ${merge.fromEntityId} is already merged into another.`);
  }
  if (resolveEntityId(draft.merges, merge.intoEntityId) === merge.fromEntityId) {
    return err(
      'invalid_input',
      `Merging ${merge.fromEntityId} into ${merge.intoEntityId} would make a cycle of merges.`,
    );
  }
  const before = {
    from: sameEntityIds(draft.merges, merge.fromEntityId),
    into: sameEntityIds(draft.merges, merge.intoEntityId),
  };
  const live = (subjects: Set<string>, predicate: string) =>
    [...draft.facts.values()].filter(
      (fact) =>
        fact.namespace === changeSet.namespace &&
        fact.invalidatedAt === null &&
        fact.predicate === predicate &&
        subjects.has(fact.subjectEntityId),
    );
  const conflicting = new Set<string>();
  for (const predicate of singleValuedPredicates) {
    const intoFacts = live(before.into, predicate);
    for (const fromFact of live(before.from, predicate)) {
      for (const intoFact of intoFacts) {
        if (disagree(fromFact, intoFact)) {
          conflicting.add(fromFact.id);
          conflicting.add(intoFact.id);
        }
      }
    }
  }
  if (conflicting.size > 0) {
    const ids = [...conflicting].sort();
    return err(
      'conflict',
      `Merging ${merge.fromEntityId} into ${merge.intoEntityId} would give one entity different values at once: ${ids.join(', ')}.`,
      { relatedFactIds: ids },
    );
  }
  draft.merges.push(merge);
  return null;
}

/** Undoes a merge, once. */
function undoMerge(
  draft: State,
  changeSet: ChangeSet,
  mergeId: string,
  fromEntityId: string,
): Failure | null {
  const index = draft.merges.findIndex(
    (merge) => merge.id === mergeId && merge.namespace === changeSet.namespace,
  );
  const merge = draft.merges[index];
  if (merge === undefined || merge.fromEntityId !== fromEntityId)
    return err('not_found', `No merge ${mergeId} in this namespace.`);
  if (merge.undoneAt !== null) return err('already_exists', `The merge ${mergeId} was already undone.`);
  draft.merges[index] = { ...merge, undoneAt: changeSet.occurredAt };
  return null;
}

/**
 * Replaces a fact's text with the marker and removes its vector (ADR 0012). Its keyword entry
 * goes with the text: the keyword lane skips purged facts. Nothing else of the row changes.
 */
function purgeFact(draft: State, changeSet: ChangeSet, factId: string): Failure | null {
  const fact = draft.facts.get(factId);
  if (fact === undefined || fact.namespace !== changeSet.namespace) {
    return err('not_found', `The fact ${factId} does not exist.`);
  }
  if (fact.purgedAt !== null) return err('invalid_input', `The fact ${factId} is already purged.`);
  draft.facts.set(factId, {
    ...fact,
    statement: PURGED_MARKER,
    object: fact.object.kind === 'value' ? { kind: 'value', value: PURGED_MARKER } : fact.object,
    purgedAt: changeSet.occurredAt,
  });
  draft.vectors.delete(factId);
  return null;
}

/** Replaces a source's content with the marker and clears its locator and hash (ADR 0012). */
function purgeSource(draft: State, changeSet: ChangeSet, sourceId: string): Failure | null {
  const source = draft.sources.get(sourceId);
  if (source === undefined || source.namespace !== changeSet.namespace) {
    return err('not_found', `The source ${sourceId} does not exist.`);
  }
  if (source.purgedAt !== null) return err('invalid_input', `The source ${sourceId} is already purged.`);
  draft.sources.set(sourceId, {
    ...source,
    content: source.content === null ? null : PURGED_MARKER,
    contentHash: null,
    locator: null,
    purgedAt: changeSet.occurredAt,
  });
  return null;
}

/** The archiving of a fact in force, if any. */
function findOpenArchive(state: State, factId: string): ArchiveRow | undefined {
  return state.archives.find((row) => row.factId === factId && row.unarchivedAt === null);
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
    case 'adjust_confidence': {
      const fact = findFact(change.factId);
      if (fact === undefined) return err('not_found', `The fact ${change.factId} does not exist.`);
      if (fact.invalidatedAt !== null) return notLive(fact);
      draft.confidences.push({
        factId: fact.id,
        confidence: change.confidence,
        adjustedAt: changeSet.occurredAt,
      });
      return null;
    }
    case 'record_feedback': {
      const { feedback } = change;
      if (draft.feedback.has(feedback.id)) {
        return err('already_exists', `The identifier ${feedback.id} is already used by feedback.`);
      }
      // Feedback on an invalidated fact is kept: a fact recalled with a past known-at date can be one.
      if (findFact(feedback.factId) === undefined) {
        return err('not_found', `The fact ${feedback.factId} does not exist.`);
      }
      if (feedback.sourceId !== null && !hasSource(feedback.sourceId)) {
        return err('not_found', `The source ${feedback.sourceId} of feedback ${feedback.id} does not exist.`);
      }
      draft.feedback.set(feedback.id, feedback);
      return null;
    }
    case 'merge_entities':
      return recordMerge(draft, changeSet, change.merge, change.singleValuedPredicates);
    case 'undo_entity_merge':
      return undoMerge(draft, changeSet, change.mergeId, change.fromEntityId);
    case 'record_verification': {
      const { verification } = change;
      if (draft.verifications.some((known) => known.id === verification.id)) {
        return err('already_exists', `The identifier ${verification.id} is already used by a verification.`);
      }
      const fact = findFact(verification.factId);
      if (fact === undefined) return err('not_found', `The fact ${verification.factId} does not exist.`);
      if (fact.invalidatedAt !== null) return notLive(fact);
      draft.verifications.push(verification);
      return null;
    }
    case 'archive_fact': {
      const fact = findFact(change.factId);
      if (fact === undefined) return err('not_found', `The fact ${change.factId} does not exist.`);
      if (fact.invalidatedAt !== null) return notLive(fact);
      if (draft.archives.some((row) => row.id === change.archiveId)) {
        return err('already_exists', `The identifier ${change.archiveId} is already used by an archiving.`);
      }
      if (findOpenArchive(draft, fact.id) !== undefined) {
        return err('already_exists', `The fact ${fact.id} is already archived.`);
      }
      draft.archives.push({
        id: change.archiveId,
        factId: fact.id,
        archivedAt: changeSet.occurredAt,
        unarchivedAt: null,
      });
      return null;
    }
    case 'unarchive_fact': {
      const fact = findFact(change.factId);
      if (fact === undefined) return err('not_found', `The fact ${change.factId} does not exist.`);
      const open = findOpenArchive(draft, fact.id);
      if (open === undefined) return err('already_exists', `The fact ${fact.id} is not archived.`);
      draft.archives[draft.archives.indexOf(open)] = { ...open, unarchivedAt: changeSet.occurredAt };
      return null;
    }
    case 'purge_content':
      return change.targetKind === 'fact'
        ? purgeFact(draft, changeSet, change.targetId)
        : purgeSource(draft, changeSet, change.targetId);
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
    // The rule holds across merged entities: a fact about either is checked against both.
    const sameSubjects = sameEntityIds(draft.merges, recorded.subjectEntityId);
    const overlapping = [...draft.facts.values()].filter(
      (other) =>
        other.id !== recorded.id &&
        other.namespace === recorded.namespace &&
        other.invalidatedAt === null &&
        sameSubjects.has(other.subjectEntityId) &&
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

function isValidLimit(limit: number): boolean {
  return Number.isInteger(limit) && limit >= 1;
}

function invalidLimit(): Failure {
  return err('invalid_input', 'The limit must be a whole number of at least 1.');
}

/** The words of a text: lower case, split wherever a character is not a letter or a digit. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
}

/** Cosine distance: 0 for the same direction, 1 for unrelated, 2 for opposite. */
function cosineDistance(first: Float32Array, second: Float32Array): number {
  let dot = 0;
  let firstLength = 0;
  let secondLength = 0;
  for (let index = 0; index < first.length; index += 1) {
    const a = first[index] ?? 0;
    const b = second[index] ?? 0;
    dot += a * b;
    firstLength += a * a;
    secondLength += b * b;
  }
  if (firstLength === 0 || secondLength === 0) return 1;
  return 1 - dot / Math.sqrt(firstLength * secondLength);
}

/**
 * Creates a `MemoryStore` that keeps everything in memory. It is a complete implementation
 * of the interface, not a mock: use cases are tested against it, and the storage contract
 * suite runs against it so that it cannot drift from the SQLite adapter.
 */
export function createInMemoryStore(): MemoryStore {
  let state = createEmptyState();
  // Usage is bookkeeping, not memory, so it is kept beside the state, not in it.
  const factUsage = new Map<string, FactUsage>();
  const usageTrackingStart = new Map<Namespace, Timestamp>();

  /**
   * Builds what a read returns for one fact, with its confidence at the read's known-at date,
   * or its latest confidence when the read has none. Copies, so a caller cannot change memory
   * through a result.
   */
  const withSources = (stored: Fact, knownAt: Timestamp | null): FactWithSources | null => {
    const fact = { ...stored, confidence: confidenceAt(state.confidences, stored, knownAt) };
    // Shown under the entity it resolves to through merges; the fact row keeps its own identifiers.
    const subject = state.entities.get(resolveEntityId(state.merges, fact.subjectEntityId));
    if (subject === undefined) return null;
    const objectEntity =
      fact.object.kind === 'entity'
        ? (state.entities.get(resolveEntityId(state.merges, fact.object.entityId)) ?? null)
        : null;
    const sources = (state.factSources.get(fact.id) ?? []).flatMap((sourceId) => {
      const source = state.sources.get(sourceId);
      return source === undefined ? [] : [source];
    });
    const archivedAt = findOpenArchive(state, fact.id)?.archivedAt ?? null;
    return structuredClone({ fact, subject, objectEntity, sources, archivedAt });
  };

  /** The facts of a namespace that pass the time filter, in the order they were recorded. */
  const factsInTime = (namespace: Namespace, time: TimeFilter, excludeArchived = false): Fact[] =>
    [...state.facts.values()].filter(
      (fact) =>
        fact.namespace === namespace &&
        matchesTimeFilter(fact, time) &&
        !(excludeArchived && findOpenArchive(state, fact.id) !== undefined),
    );

  /** Turns ranked facts into what a lane returns, best first, after the time filter and up to the limit. */
  const rankedResults = (
    ranked: readonly { readonly fact: Fact; readonly rank: number }[],
    limit: number,
    knownAt: Timestamp,
  ): FactWithSources[] =>
    [...ranked]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit)
      .flatMap(({ fact }) => {
        const result = withSources(fact, knownAt);
        return result === null ? [] : [result];
      });

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
          action: actionOf(change),
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
      return Promise.resolve(ok(withSources(fact, null)));
    },

    listFacts(query) {
      if (!isValidLimit(query.limit)) return Promise.resolve(invalidLimit());
      const { time } = query;
      const touching =
        query.touchingEntityIds === null
          ? null
          : new Set(
              query.touchingEntityIds.flatMap((entityId) => [...sameEntityIds(state.merges, entityId)]),
            );
      const subjects =
        query.subjectEntityId === null ? null : sameEntityIds(state.merges, query.subjectEntityId);
      const matches = (fact: Fact): boolean => {
        if (fact.namespace !== query.namespace) return false;
        if (subjects !== null && !subjects.has(fact.subjectEntityId)) return false;
        if (query.predicate !== null && fact.predicate !== query.predicate) return false;
        if (query.excludeArchived === true && findOpenArchive(state, fact.id) !== undefined) return false;
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
      const knownAt = typeof time === 'string' ? null : time.knownAt;
      const results = newestFirst.flatMap(({ fact }) => {
        const result = withSources(fact, knownAt);
        return result === null ? [] : [result];
      });
      return Promise.resolve(ok(results));
    },

    searchFactsByVector(query) {
      if (!isValidLimit(query.limit)) return Promise.resolve(invalidLimit());
      if (state.dimensions !== null && query.vector.length !== state.dimensions) {
        return Promise.resolve(
          err(
            'invalid_input',
            `The query vector has ${query.vector.length} dimensions, but this memory holds vectors of ${state.dimensions}.`,
          ),
        );
      }
      const ranked = factsInTime(query.namespace, query.time, query.excludeArchived).flatMap((fact) => {
        const vector = state.vectors.get(fact.id);
        return vector === undefined ? [] : [{ fact, rank: cosineDistance(query.vector, vector) }];
      });
      return Promise.resolve(ok(rankedResults(ranked, query.limit, query.time.knownAt)));
    },

    searchFactsByKeyword(query) {
      if (!isValidLimit(query.limit)) return Promise.resolve(invalidLimit());
      const wanted = new Set(wordsOf(query.text));
      const ranked = factsInTime(query.namespace, query.time, query.excludeArchived).flatMap((fact) => {
        // A purged fact has no keyword entry.
        if (fact.purgedAt !== null) return [];
        const statementWords = new Set(wordsOf(fact.statement));
        const matching = [...wanted].filter((word) => statementWords.has(word)).length;
        // More matching words rank first, so the rank is the negative count.
        return matching === 0 ? [] : [{ fact, rank: -matching }];
      });
      return Promise.resolve(ok(rankedResults(ranked, query.limit, query.time.knownAt)));
    },

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

    listFactsOfSources(query) {
      const wanted = new Set(query.sourceIds);
      const results = [...state.facts.values()].flatMap((fact) => {
        if (fact.namespace !== query.namespace) return [];
        if (!(state.factSources.get(fact.id) ?? []).some((sourceId) => wanted.has(sourceId))) return [];
        const result = withSources(fact, null);
        return result === null ? [] : [result];
      });
      return Promise.resolve(ok(results));
    },

    findSourcesByContentHash(query) {
      const found = [...state.sources.values()].filter(
        (source) => source.namespace === query.namespace && source.contentHash === query.contentHash,
      );
      return Promise.resolve(ok(structuredClone(found)));
    },

    recordFactUsage(usage) {
      // Bookkeeping outside the state that commit replaces: no change set, no audit entry.
      let wrote = false;
      for (const factId of new Set(usage.factIds)) {
        if (state.facts.get(factId)?.namespace !== usage.namespace) continue;
        const known = factUsage.get(factId);
        factUsage.set(factId, {
          factId,
          lastRecalledAt: usage.recalledAt,
          recallCount: (known?.recallCount ?? 0) + 1,
        });
        wrote = true;
      }
      if (wrote && !usageTrackingStart.has(usage.namespace))
        usageTrackingStart.set(usage.namespace, usage.recalledAt);
      return Promise.resolve(ok(null));
    },

    getFactUsage(query) {
      if (state.facts.get(query.factId)?.namespace !== query.namespace) return Promise.resolve(ok(null));
      const found = factUsage.get(query.factId);
      return Promise.resolve(ok(found === undefined ? null : { ...found }));
    },

    getUsageTrackingStart(query) {
      return Promise.resolve(ok(usageTrackingStart.get(query.namespace) ?? null));
    },

    listEntityMerges(query) {
      return Promise.resolve(
        ok(structuredClone(state.merges.filter((merge) => merge.namespace === query.namespace))),
      );
    },

    listFeedback(query) {
      const found = [...state.feedback.values()].filter(
        (feedback) => feedback.namespace === query.namespace && feedback.factId === query.factId,
      );
      return Promise.resolve(ok(structuredClone(found)));
    },

    listEntities(query) {
      if (!isValidLimit(query.limit)) return Promise.resolve(invalidLimit());
      const { afterEntityId } = query;
      const page = [...state.entities.values()]
        .filter(
          (entity) =>
            entity.namespace === query.namespace && (afterEntityId === null || entity.id > afterEntityId),
        )
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, query.limit);
      return Promise.resolve(ok(structuredClone(page)));
    },

    listUnusedFacts(query) {
      if (!isValidLimit(query.limit)) return Promise.resolve(invalidLimit());
      // No fact is taken as unused before a whole period of counting has passed.
      const trackingStart = usageTrackingStart.get(query.namespace);
      if (trackingStart === undefined || trackingStart > query.unusedSince) return Promise.resolve(ok([]));
      const current = { validAt: query.currentAt, knownAt: query.currentAt };
      const results = factsInTime(query.namespace, current, true)
        .filter((fact) => {
          if (fact.createdAt >= query.unusedSince) return false;
          const usage = factUsage.get(fact.id);
          return usage === undefined || usage.lastRecalledAt < query.unusedSince;
        })
        .slice(0, query.limit)
        .flatMap((fact) => {
          const result = withSources(fact, null);
          return result === null ? [] : [result];
        });
      return Promise.resolve(ok(results));
    },

    listVerifications(query) {
      const found = state.verifications.filter(
        (verification) => verification.namespace === query.namespace && verification.factId === query.factId,
      );
      return Promise.resolve(ok(structuredClone(found)));
    },

    listStaleFacts(query) {
      if (!isValidLimit(query.limit)) return Promise.resolve(invalidLimit());
      const current = { validAt: query.currentAt, knownAt: query.currentAt };
      const stale = factsInTime(query.namespace, current).flatMap((fact) => {
        const verifiedAt = latestVerification(state.verifications, fact.id)?.verifiedAt ?? fact.createdAt;
        const isLowConfidence =
          query.confidenceBelow !== null &&
          confidenceAt(state.confidences, fact, null) < query.confidenceBelow;
        return verifiedAt < query.notVerifiedSince || isLowConfidence ? [{ fact, verifiedAt }] : [];
      });
      // A stable sort: facts verified at one moment keep the order they were recorded in.
      const results = stale
        .sort((a, b) => (a.verifiedAt === b.verifiedAt ? 0 : a.verifiedAt < b.verifiedAt ? -1 : 1))
        .slice(0, query.limit)
        .flatMap(({ fact }) => {
          const result = withSources(fact, null);
          return result === null ? [] : [result];
        });
      return Promise.resolve(ok(results));
    },

    listOrphanedFacts(query) {
      if (!isValidLimit(query.limit)) return Promise.resolve(invalidLimit());
      const isOrphaned = (fact: Fact): boolean => {
        const sourceIds = state.factSources.get(fact.id) ?? [];
        const allPurged = sourceIds.every((sourceId) => {
          const source = state.sources.get(sourceId);
          return source !== undefined && source.purgedAt !== null;
        });
        return allPurged || latestVerification(state.verifications, fact.id)?.outcome === 'source_missing';
      };
      const results = [...state.facts.values()]
        .filter(
          (fact) => fact.namespace === query.namespace && fact.invalidatedAt === null && isOrphaned(fact),
        )
        .slice(0, query.limit)
        .flatMap((fact) => {
          const result = withSources(fact, null);
          return result === null ? [] : [result];
        });
      return Promise.resolve(ok(results));
    },

    close() {
      return Promise.resolve();
    },
  };
  return store;
}
