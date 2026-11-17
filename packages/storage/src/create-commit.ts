import {
  type AuditAction,
  type AuditEntry,
  type Change,
  type ChangeSet,
  ChangeSetSchema,
  type CommitReceipt,
  err,
  type Fact,
  type Failure,
  normaliseEntityName,
  ok,
  PURGED_MARKER,
  type Result,
} from '@factloom/core';
import type { Database } from 'better-sqlite3';
import { LATEST_CONFIDENCE } from './confidence-columns.ts';
import { resolvedEntityId, sameEntityIds } from './entity-resolution-sql.ts';
import { type EmbeddingModel, toBlob } from './embedding-model.ts';

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

/** A refusal of one change. Thrown inside the transaction to roll it back, then returned. */
class Refusal extends Error {
  readonly failure: Failure;
  constructor(failure: Failure) {
    super(failure.error.message);
    this.failure = failure;
  }
}

function refuse(...args: Parameters<typeof err>): never {
  throw new Refusal(err(...args));
}

type FactStateRow = {
  readonly created_at: string;
  readonly invalidated_at: string | null;
  readonly superseded_by_fact_id: string | null;
};

type ObjectRow = {
  readonly subject_entity_id: string;
  readonly predicate: string;
  readonly object_entity_id: string | null;
  readonly object_value: string | null;
};

/**
 * Builds the `commit` of a SQLite store. Every statement is prepared once, here, and reused
 * by each commit on this connection.
 */
export function createCommit(
  db: Database,
  embeddingModel: EmbeddingModel,
): (changeSet: ChangeSet) => Result<CommitReceipt> {
  const insertEntity = db.prepare(
    `INSERT INTO entity (id, namespace, type, name, name_key, created_at)
     VALUES (@id, @namespace, @type, @name, @nameKey, @createdAt)`,
  );
  const insertSource = db.prepare(
    `INSERT INTO source (id, namespace, kind, locator, version, content, content_hash, observed_at, created_at)
     VALUES (@id, @namespace, @kind, @locator, @version, @content, @contentHash, @observedAt, @createdAt)`,
  );
  const insertFact = db.prepare(
    `INSERT INTO fact (id, namespace, subject_entity_id, predicate, object_entity_id, object_value,
                       statement, confidence, valid_from, valid_to, created_at)
     VALUES (@id, @namespace, @subjectEntityId, @predicate, @objectEntityId, @objectValue,
             @statement, @confidence, @validFrom, @validTo, @createdAt)`,
  );
  const insertFactSource = db.prepare('INSERT INTO fact_source (fact_id, source_id) VALUES (?, ?)');
  const insertEmbedding = db.prepare(
    'INSERT INTO fact_embedding (fact_id, model, dimensions, embedding) VALUES (?, ?, ?, ?)',
  );
  const copyEmbedding = db.prepare(
    `INSERT INTO fact_embedding (fact_id, model, dimensions, embedding)
     SELECT @factId, e.model, e.dimensions, e.embedding
     FROM fact_embedding e JOIN fact f ON f.id = e.fact_id
     WHERE f.id = @copyFromFactId AND f.namespace = @namespace`,
  );
  const invalidateFact = db.prepare(
    `UPDATE fact SET invalidated_at = @invalidatedAt, superseded_by_fact_id = @supersededByFactId
     WHERE id = @id AND namespace = @namespace AND invalidated_at IS NULL`,
  );
  // Lookups that decide a refusal. Each filters on the namespace, except the three that ask
  // whether an identifier is used at all: identifiers are unique across namespaces.
  const isEntityIdUsed = db.prepare<[string], unknown>('SELECT 1 FROM entity WHERE id = ?');
  const isSourceIdUsed = db.prepare<[string], unknown>('SELECT 1 FROM source WHERE id = ?');
  const isFactIdUsed = db.prepare<[string], unknown>('SELECT 1 FROM fact WHERE id = ?');
  const hasEntityNamed = db.prepare<[string, string, string], unknown>(
    'SELECT 1 FROM entity WHERE namespace = ? AND type = ? AND name_key = ?',
  );
  const hasEntity = db.prepare<[string, string], unknown>(
    'SELECT 1 FROM entity WHERE id = ? AND namespace = ?',
  );
  const hasSource = db.prepare<[string, string], unknown>(
    'SELECT 1 FROM source WHERE id = ? AND namespace = ?',
  );
  const hasFactSource = db.prepare<[string, string], unknown>(
    'SELECT 1 FROM fact_source WHERE fact_id = ? AND source_id = ?',
  );
  const selectFactState = db.prepare<[string, string], FactStateRow>(
    'SELECT created_at, invalidated_at, superseded_by_fact_id FROM fact WHERE id = ? AND namespace = ?',
  );
  // The single-value rule: other live facts with the same subject and predicate whose valid
  // period overlaps. A missing bound is open, and periods that only touch do not overlap.
  const selectOverlapping = db.prepare<
    {
      id: string;
      namespace: string;
      subject: string;
      predicate: string;
      validFrom: string | null;
      validTo: string | null;
    },
    { readonly id: string }
  >(
    `SELECT o.id FROM fact o
     WHERE o.namespace = @namespace AND o.subject_entity_id IN (${sameEntityIds('@subject')}) AND o.predicate = @predicate
       AND o.invalidated_at IS NULL AND o.id <> @id
       AND (o.valid_from IS NULL OR @validTo IS NULL OR o.valid_from < @validTo)
       AND (@validFrom IS NULL OR o.valid_to IS NULL OR @validFrom < o.valid_to)
     ORDER BY o.id`,
  );
  const selectObject = db.prepare<[string, string], ObjectRow>(
    `SELECT subject_entity_id, predicate, object_entity_id, object_value
     FROM fact WHERE id = ? AND namespace = ?`,
  );
  const insertConfidence = db.prepare(
    'INSERT INTO fact_confidence (fact_id, confidence, adjusted_at) VALUES (?, ?, ?)',
  );
  // The latest confidence of a fact: its latest adjustment, or its confidence at recording.
  const selectLatestConfidence = db.prepare<[string, string], { readonly confidence: number }>(
    `SELECT ${LATEST_CONFIDENCE} AS confidence FROM fact f WHERE f.id = ? AND f.namespace = ?`,
  );
  const insertFeedback = db.prepare(
    `INSERT INTO feedback (id, namespace, fact_id, signal, trigger, source_id, recorded_at)
     VALUES (@id, @namespace, @factId, @signal, @trigger, @sourceId, @recordedAt)`,
  );
  const isFeedbackIdUsed = db.prepare<[string], unknown>('SELECT 1 FROM feedback WHERE id = ?');
  const insertVerification = db.prepare(
    `INSERT INTO fact_verification (id, namespace, fact_id, outcome, method, verified_at)
     VALUES (@id, @namespace, @factId, @outcome, @method, @verifiedAt)`,
  );
  const insertArchive = db.prepare(
    `INSERT INTO fact_archive (id, namespace, fact_id, archived_at) VALUES (@id, @namespace, @factId, @archivedAt)`,
  );
  const isArchiveIdUsed = db.prepare<[string], unknown>('SELECT 1 FROM fact_archive WHERE id = ?');
  const selectOpenArchive = db.prepare<[string], { readonly id: string }>(
    'SELECT id FROM fact_archive WHERE fact_id = ? AND unarchived_at IS NULL',
  );
  const closeArchive = db.prepare('UPDATE fact_archive SET unarchived_at = @unarchivedAt WHERE id = @id');
  const isVerificationIdUsed = db.prepare<[string], unknown>('SELECT 1 FROM fact_verification WHERE id = ?');
  const selectPurgedAt = {
    fact: db.prepare<[string, string], { readonly purged_at: string | null }>(
      'SELECT purged_at FROM fact WHERE id = ? AND namespace = ?',
    ),
    source: db.prepare<[string, string], { readonly purged_at: string | null }>(
      'SELECT purged_at FROM source WHERE id = ? AND namespace = ?',
    ),
  };
  // The triggers of the fourth migration permit exactly these two updates, and the fact's
  // keyword entry is removed by its trigger, with the old text.
  const purgeFact = db.prepare(
    `UPDATE fact SET statement = @marker,
       object_value = CASE WHEN object_value IS NULL THEN NULL ELSE @marker END, purged_at = @purgedAt
     WHERE id = @id AND namespace = @namespace AND purged_at IS NULL`,
  );
  const removeVector = db.prepare('DELETE FROM fact_embedding WHERE fact_id = ?');
  const purgeSource = db.prepare(
    `UPDATE source SET content = CASE WHEN content IS NULL THEN NULL ELSE @marker END,
       content_hash = NULL, locator = NULL, purged_at = @purgedAt
     WHERE id = @id AND namespace = @namespace AND purged_at IS NULL`,
  );
  const insertMerge = db.prepare(
    `INSERT INTO entity_merge (id, namespace, from_entity_id, into_entity_id, merged_at, undone_at)
     VALUES (@id, @namespace, @fromEntityId, @intoEntityId, @mergedAt, @undoneAt)`,
  );
  const isMergeIdUsed = db.prepare<[string], unknown>('SELECT 1 FROM entity_merge WHERE id = ?');
  const isMergedFrom = db.prepare<[string, string], unknown>(
    'SELECT 1 FROM entity_merge WHERE namespace = ? AND from_entity_id = ? AND undone_at IS NULL',
  );
  const selectResolved = db.prepare<{ namespace: string; id: string }, { id: string }>(
    `SELECT ${resolvedEntityId('@id')} AS id`,
  );
  // Live facts of the two entities, each with everything merged into it, that disagree for a
  // single-valued predicate: different objects as stored, overlapping valid periods.
  const selectMergeConflicts = db.prepare<
    { namespace: string; fromEntityId: string; intoEntityId: string; predicates: string },
    { a: string; b: string }
  >(
    `SELECT a.id AS a, b.id AS b FROM fact a JOIN fact b ON b.predicate = a.predicate
     WHERE a.namespace = @namespace AND b.namespace = @namespace
       AND a.invalidated_at IS NULL AND b.invalidated_at IS NULL
       AND a.predicate IN (SELECT value FROM json_each(@predicates))
       AND a.subject_entity_id IN (${sameEntityIds('@fromEntityId')})
       AND b.subject_entity_id IN (${sameEntityIds('@intoEntityId')})
       AND NOT (a.object_entity_id IS b.object_entity_id AND a.object_value IS b.object_value)
       AND (a.valid_from IS NULL OR b.valid_to IS NULL OR a.valid_from < b.valid_to)
       AND (b.valid_from IS NULL OR a.valid_to IS NULL OR b.valid_from < a.valid_to)`,
  );
  const selectMerge = db.prepare<[string, string], { from_entity_id: string; undone_at: string | null }>(
    'SELECT from_entity_id, undone_at FROM entity_merge WHERE id = ? AND namespace = ?',
  );
  const undoMerge = db.prepare(
    'UPDATE entity_merge SET undone_at = @undoneAt WHERE id = @id AND namespace = @namespace AND undone_at IS NULL',
  );
  const insertAuditEntry = db.prepare(
    `INSERT INTO audit_log (namespace, operation_id, operation, action, target_kind, target_id,
                            trigger, reason_code, source_id, detail, occurred_at)
     VALUES (@namespace, @operationId, @operation, @action, @targetKind, @targetId,
             @trigger, @reasonCode, @sourceId, @detail, @occurredAt)`,
  );

  /**
   * The fact that a recorded fact is a revised copy of, if any: a fact stored before this
   * commit that a change of the same change set invalidates with a supersession link to the
   * recorded one, and that has the same subject, predicate and object. The same rule as the
   * in-memory store in core.
   */
  function findRevisedFactId(recorded: Fact, changeSet: ChangeSet): string | null {
    const recordedHere = new Set(
      changeSet.changes.flatMap((change) => (change.kind === 'record_fact' ? [change.fact.id] : [])),
    );
    for (const change of changeSet.changes) {
      if (change.kind !== 'invalidate_fact' || change.supersededByFactId !== recorded.id) continue;
      if (recordedHere.has(change.factId)) continue;
      const stored = selectObject.get(change.factId, changeSet.namespace);
      if (
        stored !== undefined &&
        stored.subject_entity_id === recorded.subjectEntityId &&
        stored.predicate === recorded.predicate &&
        stored.object_entity_id === (recorded.object.kind === 'entity' ? recorded.object.entityId : null) &&
        stored.object_value === (recorded.object.kind === 'value' ? recorded.object.value : null)
      ) {
        return change.factId;
      }
    }
    return null;
  }

  /** Reads a fact that a change is about to touch, refusing one that is missing or not live. */
  function requireLiveFact(factId: string, namespace: string): FactStateRow {
    const state = selectFactState.get(factId, namespace);
    if (state === undefined) return refuse('not_found', `The fact ${factId} does not exist.`);
    if (state.invalidated_at !== null) {
      const superseded = state.superseded_by_fact_id;
      return refuse(
        'already_invalidated',
        superseded === null
          ? `The fact ${factId} was invalidated and nothing superseded it.`
          : `The fact ${factId} was invalidated and superseded by ${superseded}. Use that fact.`,
        { relatedFactIds: superseded === null ? [] : [superseded] },
      );
    }
    return state;
  }

  /** Writes the rows of one change and returns the detail of its audit entry. */
  function applyChange(change: Change, changeSet: ChangeSet): AuditEntry['detail'] {
    const { namespace } = changeSet;
    switch (change.kind) {
      case 'create_entity': {
        const { entity } = change;
        const nameKey = normaliseEntityName(entity.name);
        if (isEntityIdUsed.get(entity.id) !== undefined) {
          refuse('already_exists', `The identifier ${entity.id} is already used by an entity.`);
        }
        if (hasEntityNamed.get(namespace, entity.type, nameKey) !== undefined) {
          refuse(
            'already_exists',
            `An entity of type "${entity.type}" named "${entity.name}" already exists. Read it with findEntities and use it.`,
          );
        }
        insertEntity.run({ ...entity, nameKey });
        return null;
      }
      case 'record_source':
        if (isSourceIdUsed.get(change.source.id) !== undefined) {
          refuse('already_exists', `The identifier ${change.source.id} is already used by a source.`);
        }
        insertSource.run(change.source);
        return null;
      case 'record_fact': {
        const { fact } = change;
        if (isFactIdUsed.get(fact.id) !== undefined) {
          refuse('already_exists', `The identifier ${fact.id} is already used by a fact.`);
        }
        if (hasEntity.get(fact.subjectEntityId, namespace) === undefined) {
          refuse(
            'not_found',
            `The subject entity ${fact.subjectEntityId} of fact ${fact.id} does not exist.`,
          );
        }
        if (fact.object.kind === 'entity' && hasEntity.get(fact.object.entityId, namespace) === undefined) {
          refuse('not_found', `The object entity ${fact.object.entityId} of fact ${fact.id} does not exist.`);
        }
        for (const sourceId of change.sourceIds) {
          if (hasSource.get(sourceId, namespace) === undefined) {
            refuse('not_found', `The source ${sourceId} of fact ${fact.id} does not exist.`);
          }
        }
        // Read before the fact is written, while the fact it revises is still as it was.
        const revisesFactId = findRevisedFactId(fact, changeSet);
        insertFact.run({
          id: fact.id,
          namespace: fact.namespace,
          subjectEntityId: fact.subjectEntityId,
          predicate: fact.predicate,
          objectEntityId: fact.object.kind === 'entity' ? fact.object.entityId : null,
          objectValue: fact.object.kind === 'value' ? fact.object.value : null,
          statement: fact.statement,
          confidence: fact.confidence,
          validFrom: fact.validFrom,
          validTo: fact.validTo,
          createdAt: fact.createdAt,
        });
        for (const sourceId of change.sourceIds) insertFactSource.run(fact.id, sourceId);
        if (change.embedding instanceof Float32Array) {
          if (change.embedding.length !== embeddingModel.dimensions) {
            refuse(
              'embedding_model_mismatch',
              `The vector of fact ${fact.id} has ${change.embedding.length} dimensions, but this memory holds vectors of ${embeddingModel.dimensions}.`,
            );
          }
          insertEmbedding.run(
            fact.id,
            embeddingModel.model,
            embeddingModel.dimensions,
            toBlob(change.embedding),
          );
        } else {
          const { copyFromFactId } = change.embedding;
          const copied = copyEmbedding.run({ factId: fact.id, copyFromFactId, namespace });
          if (copied.changes !== 1) {
            refuse('not_found', `The fact ${copyFromFactId}, whose vector was to be copied, does not exist.`);
          }
        }
        return revisesFactId === null ? null : { revisesFactId };
      }
      case 'attach_source':
        requireLiveFact(change.factId, namespace);
        if (hasSource.get(change.sourceId, namespace) === undefined) {
          refuse('not_found', `The source ${change.sourceId} does not exist.`);
        }
        if (hasFactSource.get(change.factId, change.sourceId) !== undefined) {
          refuse(
            'already_exists',
            `The source ${change.sourceId} is already attached to fact ${change.factId}.`,
          );
        }
        insertFactSource.run(change.factId, change.sourceId);
        return { sourceId: change.sourceId };
      case 'invalidate_fact': {
        const state = requireLiveFact(change.factId, namespace);
        if (change.supersededByFactId === change.factId) {
          refuse('invalid_input', `The fact ${change.factId} cannot supersede itself.`);
        }
        if (
          change.supersededByFactId !== null &&
          selectFactState.get(change.supersededByFactId, namespace) === undefined
        ) {
          refuse('not_found', `The superseding fact ${change.supersededByFactId} does not exist.`);
        }
        if (changeSet.occurredAt < state.created_at) {
          refuse('invalid_input', `The fact ${change.factId} cannot be invalidated before it was recorded.`);
        }
        invalidateFact.run({
          id: change.factId,
          namespace,
          invalidatedAt: changeSet.occurredAt,
          supersededByFactId: change.supersededByFactId,
        });
        return { supersededByFactId: change.supersededByFactId };
      }
      case 'adjust_confidence': {
        requireLiveFact(change.factId, namespace);
        const previous = selectLatestConfidence.get(change.factId, namespace);
        insertConfidence.run(change.factId, change.confidence, changeSet.occurredAt);
        return { previousConfidence: previous?.confidence ?? null, confidence: change.confidence };
      }
      case 'record_feedback': {
        const { feedback } = change;
        if (isFeedbackIdUsed.get(feedback.id) !== undefined) {
          refuse('already_exists', `The identifier ${feedback.id} is already used by feedback.`);
        }
        // Feedback on an invalidated fact is kept: a fact recalled with a past known-at date can be one.
        if (selectFactState.get(feedback.factId, namespace) === undefined) {
          refuse('not_found', `The fact ${feedback.factId} does not exist.`);
        }
        if (feedback.sourceId !== null && hasSource.get(feedback.sourceId, namespace) === undefined) {
          refuse('not_found', `The source ${feedback.sourceId} of feedback ${feedback.id} does not exist.`);
        }
        insertFeedback.run(feedback);
        return { factId: feedback.factId };
      }
      case 'merge_entities': {
        const { merge } = change;
        for (const entityId of [merge.fromEntityId, merge.intoEntityId]) {
          if (hasEntity.get(entityId, namespace) === undefined)
            refuse('not_found', `The entity ${entityId} does not exist.`);
        }
        if (merge.fromEntityId === merge.intoEntityId)
          refuse('invalid_input', 'An entity cannot be merged with itself.');
        if (isMergeIdUsed.get(merge.id) !== undefined) {
          refuse('already_exists', `The identifier ${merge.id} is already used by a merge.`);
        }
        if (isMergedFrom.get(namespace, merge.fromEntityId) !== undefined) {
          refuse('already_exists', `The entity ${merge.fromEntityId} is already merged into another.`);
        }
        if (selectResolved.get({ namespace, id: merge.intoEntityId })?.id === merge.fromEntityId) {
          refuse(
            'invalid_input',
            `Merging ${merge.fromEntityId} into ${merge.intoEntityId} would make a cycle of merges.`,
          );
        }
        // The refusal of a conflicting merge is made here, inside the commit's transaction, so
        // that a fact another process records meanwhile is seen (INTERFACES.md).
        const conflicts = selectMergeConflicts.all({
          namespace,
          fromEntityId: merge.fromEntityId,
          intoEntityId: merge.intoEntityId,
          predicates: JSON.stringify(change.singleValuedPredicates),
        });
        if (conflicts.length > 0) {
          const ids = [...new Set(conflicts.flatMap((row) => [row.a, row.b]))].sort();
          refuse(
            'conflict',
            `Merging ${merge.fromEntityId} into ${merge.intoEntityId} would give one entity different values at once: ${ids.join(', ')}.`,
            { relatedFactIds: ids },
          );
        }
        insertMerge.run(merge);
        return { intoEntityId: merge.intoEntityId, mergeId: merge.id };
      }
      case 'undo_entity_merge': {
        const known = selectMerge.get(change.mergeId, namespace);
        if (known === undefined || known.from_entity_id !== change.fromEntityId) {
          refuse('not_found', `No merge ${change.mergeId} in this namespace.`);
        }
        if (known.undone_at !== null)
          refuse('already_exists', `The merge ${change.mergeId} was already undone.`);
        undoMerge.run({ id: change.mergeId, namespace, undoneAt: changeSet.occurredAt });
        return { mergeId: change.mergeId };
      }
      case 'archive_fact': {
        requireLiveFact(change.factId, namespace);
        if (isArchiveIdUsed.get(change.archiveId) !== undefined) {
          refuse('already_exists', `The identifier ${change.archiveId} is already used by an archiving.`);
        }
        if (selectOpenArchive.get(change.factId) !== undefined) {
          refuse('already_exists', `The fact ${change.factId} is already archived.`);
        }
        insertArchive.run({
          id: change.archiveId,
          namespace,
          factId: change.factId,
          archivedAt: changeSet.occurredAt,
        });
        return { archiveId: change.archiveId };
      }
      case 'unarchive_fact': {
        if (selectFactState.get(change.factId, namespace) === undefined) {
          refuse('not_found', `The fact ${change.factId} does not exist.`);
        }
        const open = selectOpenArchive.get(change.factId);
        if (open === undefined) refuse('already_exists', `The fact ${change.factId} is not archived.`);
        closeArchive.run({ id: open.id, unarchivedAt: changeSet.occurredAt });
        return { archiveId: open.id };
      }
      case 'record_verification': {
        const { verification } = change;
        if (isVerificationIdUsed.get(verification.id) !== undefined) {
          refuse('already_exists', `The identifier ${verification.id} is already used by a verification.`);
        }
        requireLiveFact(verification.factId, namespace);
        insertVerification.run(verification);
        return { verificationId: verification.id };
      }
      case 'purge_content': {
        const { targetKind, targetId } = change;
        const state = selectPurgedAt[targetKind].get(targetId, namespace);
        if (state === undefined) refuse('not_found', `The ${targetKind} ${targetId} does not exist.`);
        if (state.purged_at !== null)
          refuse('invalid_input', `The ${targetKind} ${targetId} is already purged.`);
        const values = { id: targetId, namespace, marker: PURGED_MARKER, purgedAt: changeSet.occurredAt };
        if (targetKind === 'source') {
          purgeSource.run(values);
          return null;
        }
        purgeFact.run(values);
        removeVector.run(targetId);
        return null;
      }
      default: {
        const unhandled: never = change;
        return unhandled;
      }
    }
  }

  /**
   * The single-value rule, checked on the result of the change set, inside its transaction:
   * no fact it recorded for a single-valued predicate, and left live, may overlap another
   * live fact with the same subject and predicate.
   */
  function refuseSingleValueConflict(changeSet: ChangeSet): void {
    for (const change of changeSet.changes) {
      if (change.kind !== 'record_fact' || !change.singleValued) continue;
      const { fact } = change;
      if (selectFactState.get(fact.id, changeSet.namespace)?.invalidated_at !== null) continue;
      const overlapping = selectOverlapping.all({
        id: fact.id,
        namespace: changeSet.namespace,
        subject: fact.subjectEntityId,
        predicate: fact.predicate,
        validFrom: fact.validFrom,
        validTo: fact.validTo,
      });
      if (overlapping.length > 0) {
        const ids = overlapping.map((row) => row.id);
        refuse(
          'conflict',
          `The fact ${fact.id} overlaps in valid time with ${ids.join(', ')}, for the single-valued predicate "${fact.predicate}". End or invalidate the stored fact first.`,
          { relatedFactIds: ids },
        );
      }
    }
  }

  // BEGIN IMMEDIATE takes the write lock before the first read, so that no other process can
  // commit between this commit's reads and its writes. better-sqlite3 starts one with the
  // `immediate` form of a transaction function (its lib/methods/transaction.js).
  const applyChangeSet = db.transaction((changeSet: ChangeSet): void => {
    const details = changeSet.changes.map((change) => applyChange(change, changeSet));
    refuseSingleValueConflict(changeSet);
    // The audit entries are written after the rows, in the order of the changes: an entry
    // points to the explaining source, which a later change of the same change set may record.
    changeSet.changes.forEach((change, index) => {
      const detail = details[index] ?? null;
      insertAuditEntry.run({
        namespace: changeSet.namespace,
        operationId: changeSet.operationId,
        operation: changeSet.operation,
        action: actionOf(change),
        ...targetOf(change),
        trigger: changeSet.trigger,
        reasonCode: changeSet.reasonCode,
        sourceId: changeSet.explainedBySourceId,
        detail: detail === null ? null : JSON.stringify(detail),
        occurredAt: changeSet.occurredAt,
      });
    });
  });

  return (given) => {
    const parsed = ChangeSetSchema.safeParse(given);
    if (!parsed.success) {
      const reasons = parsed.error.issues.map((issue) => issue.message).join(' ');
      return err('invalid_input', `The change set is not valid. ${reasons}`);
    }
    try {
      applyChangeSet.immediate(parsed.data);
    } catch (cause) {
      if (cause instanceof Refusal) return cause.failure;
      const reason = cause instanceof Error ? cause.message : String(cause);
      return err('storage_failed', `The commit was rolled back and nothing was written. ${reason}`, {
        cause,
      });
    }
    return ok({ operationId: parsed.data.operationId, auditEntryCount: parsed.data.changes.length });
  };
}
