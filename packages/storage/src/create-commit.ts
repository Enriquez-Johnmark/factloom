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
  type Result,
} from '@factloom/core';
import type { Database } from 'better-sqlite3';

/** The embedding model a database holds vectors of. Written to every embedding row. */
export type EmbeddingModel = { readonly model: string; readonly dimensions: number };

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

/** The bytes of a vector's 32-bit floats, the form `vec_distance_cosine()` reads. */
function toBlob(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

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
     WHERE o.namespace = @namespace AND o.subject_entity_id = @subject AND o.predicate = @predicate
       AND o.invalidated_at IS NULL AND o.id <> @id
       AND (o.valid_from IS NULL OR @validTo IS NULL OR o.valid_from < @validTo)
       AND (@validFrom IS NULL OR o.valid_to IS NULL OR @validFrom < o.valid_to)
     ORDER BY o.id`,
  );
  const selectObject = db.prepare<[string, string], ObjectRow>(
    `SELECT subject_entity_id, predicate, object_entity_id, object_value
     FROM fact WHERE id = ? AND namespace = ?`,
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
        action: ACTION_OF_CHANGE[change.kind],
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
