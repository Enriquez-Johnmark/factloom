import {
  err,
  type FactWithSources,
  type MemoryStore,
  normaliseEntityName,
  ok,
  type Result,
  TimestampSchema,
} from '@factloom/core';
import type { Database, Statement } from 'better-sqlite3';
import { buildKeywordQuery } from './build-keyword-query.ts';
import { CONFIDENCE_AT_KNOWN_AT, LATEST_CONFIDENCE } from './confidence-columns.ts';
import { resolveEntityIdsOfArray, sameEntityIds, sameEntityIdsOfArray } from './entity-resolution-sql.ts';
import { type EmbeddingModel, toBlob } from './embedding-model.ts';
import {
  type AuditRow,
  type EntityMergeRow,
  type EntityRow,
  type FactRow,
  type FactVerificationRow,
  type FeedbackRow,
  type ProposedChangeRow,
  type SourceRow,
  toAuditEntry,
  toEntity,
  toEntityMerge,
  toFact,
  toFactVerification,
  toFeedback,
  toProposedChange,
  toSource,
} from './row-mappers.ts';
import { TIME_PREDICATE } from './time-predicate.ts';

type ListFactsQuery = Parameters<MemoryStore['listFacts']>[0];

/** Which filters a `listFacts` query uses. Each combination is one fixed SQL text. */
export type ListFactsShape = {
  readonly hasSubject: boolean;
  readonly hasPredicate: boolean;
  readonly hasTouching: boolean;
  readonly hasSupersededBy: boolean;
  readonly time: 'filter' | 'live' | 'all';
  readonly excludeArchived: boolean;
};

/** For a fact row aliased `f`: it has no archiving in force (FL-065). */
const NOT_ARCHIVED =
  'NOT EXISTS (SELECT 1 FROM fact_archive a WHERE a.fact_id = f.id AND a.unarchived_at IS NULL)';

/** In a lane: leave out archived facts when `@excludeArchived` is 1. */
const ARCHIVE_FILTER = `(@excludeArchived = 0 OR ${NOT_ARCHIVED})`;

/** The columns of a fact row, with the confidence that the read's time asks for. */
function factColumns(confidence: string): string {
  return `f.id, f.namespace, f.subject_entity_id, f.predicate, f.object_entity_id, f.object_value,
  f.statement, ${confidence} AS confidence, f.valid_from, f.valid_to, f.created_at, f.invalidated_at,
  f.superseded_by_fact_id, f.purged_at`;
}

/** For reads with a time filter: the confidence at its known-at date. */
const FACT_COLUMNS_AT_KNOWN_AT = factColumns(CONFIDENCE_AT_KNOWN_AT);

/** For reads with no known-at date: the latest confidence. */
const FACT_COLUMNS_LATEST = factColumns(LATEST_CONFIDENCE);

const SOURCE_COLUMNS =
  'id, namespace, kind, locator, version, content, content_hash, observed_at, created_at, purged_at';

/**
 * The SQL of `listFacts` for one combination of filters. It is built only from the fixed
 * fragments below: every value is a bound parameter. A filter that is not given is left out
 * of the text, so that SQLite can choose the index of the filters that are.
 */
export function buildListFactsSql(shape: ListFactsShape): string {
  const conditions = ['f.namespace = @namespace'];
  // An entity filter matches every identifier merged with the one asked for (FL-052).
  if (shape.hasSubject) conditions.push(`f.subject_entity_id IN (${sameEntityIds('@subjectEntityId')})`);
  if (shape.hasPredicate) conditions.push('f.predicate = @predicate');
  if (shape.hasSupersededBy) conditions.push('f.superseded_by_fact_id = @supersededByFactId');
  if (shape.time === 'live') conditions.push('f.invalidated_at IS NULL');
  if (shape.time === 'filter') conditions.push(TIME_PREDICATE);
  if (shape.excludeArchived) conditions.push(NOT_ARCHIVED);
  const where = conditions.join('\n  AND ');
  // Newest first. Facts recorded at the same moment come in the reverse of their row order,
  // which never changes, so the order is the same on every run.
  const columns = shape.time === 'filter' ? FACT_COLUMNS_AT_KNOWN_AT : FACT_COLUMNS_LATEST;
  const select = (extra: string): string =>
    `SELECT ${columns}, f.rowid AS row_order FROM fact f WHERE ${where}${extra}`;
  if (!shape.hasTouching) return `${select('')} ORDER BY f.created_at DESC, f.rowid DESC LIMIT @limit`;
  // Facts whose subject or whose object entity is one of the given entities. Two selects, so
  // that each can use its own index; UNION drops a fact that both find. The identifiers are
  // bound as one JSON array and read with json_each.
  const touching = (column: string): string =>
    select(`\n  AND f.${column} IN (${sameEntityIdsOfArray('@touchingEntityIds')})`);
  return `SELECT * FROM (${touching('subject_entity_id')} UNION ${touching('object_entity_id')})
    ORDER BY created_at DESC, row_order DESC LIMIT @limit`;
}

function invalidLimit(): Result<never> {
  return err('invalid_input', 'The limit must be a whole number of at least 1.');
}

/** The read methods of a SQLite store, as synchronous functions. None of them writes. */
export type SqliteReads = {
  readonly findEntities: (query: Parameters<MemoryStore['findEntities']>[0]) => ReturnType<typeof toEntity>[];
  readonly getFact: (query: Parameters<MemoryStore['getFact']>[0]) => FactWithSources | null;
  readonly listFacts: (query: ListFactsQuery) => Result<readonly FactWithSources[]>;
  readonly getSource: (query: Parameters<MemoryStore['getSource']>[0]) => ReturnType<typeof toSource> | null;
  readonly listAuditEntries: (
    query: Parameters<MemoryStore['listAuditEntries']>[0],
  ) => ReturnType<typeof toAuditEntry>[];
  readonly searchFactsByVector: (
    query: Parameters<MemoryStore['searchFactsByVector']>[0],
  ) => Result<readonly FactWithSources[]>;
  readonly searchFactsByKeyword: (
    query: Parameters<MemoryStore['searchFactsByKeyword']>[0],
  ) => Result<readonly FactWithSources[]>;
  readonly listFactsOfSources: (
    query: Parameters<MemoryStore['listFactsOfSources']>[0],
  ) => readonly FactWithSources[];
  readonly findSourcesByContentHash: (
    query: Parameters<MemoryStore['findSourcesByContentHash']>[0],
  ) => ReturnType<typeof toSource>[];
  readonly listEntityMerges: (
    query: Parameters<MemoryStore['listEntityMerges']>[0],
  ) => ReturnType<typeof toEntityMerge>[];
  readonly listFeedback: (
    query: Parameters<MemoryStore['listFeedback']>[0],
  ) => ReturnType<typeof toFeedback>[];
  readonly listEntities: (
    query: Parameters<MemoryStore['listEntities']>[0],
  ) => Result<readonly ReturnType<typeof toEntity>[]>;
  readonly listUnusedFacts: (
    query: Parameters<MemoryStore['listUnusedFacts']>[0],
  ) => Result<readonly FactWithSources[]>;
  readonly listVerifications: (
    query: Parameters<MemoryStore['listVerifications']>[0],
  ) => ReturnType<typeof toFactVerification>[];
  readonly listStaleFacts: (
    query: Parameters<MemoryStore['listStaleFacts']>[0],
  ) => Result<readonly FactWithSources[]>;
  readonly listOrphanedFacts: (
    query: Parameters<MemoryStore['listOrphanedFacts']>[0],
  ) => Result<readonly FactWithSources[]>;
  readonly listPendingProposals: (
    query: Parameters<MemoryStore['listPendingProposals']>[0],
  ) => { readonly proposal: ReturnType<typeof toProposedChange>; readonly storedFact: FactWithSources }[];
};

/**
 * Current facts, each with the time it counts as verified: its latest verification, or its
 * recording. Those verified before `@notVerifiedSince`, or with a latest confidence below
 * `@confidenceBelow` when that is given, least recently verified first, then in row order.
 */
export const STALE_FACTS_SQL = `SELECT * FROM (
  SELECT ${FACT_COLUMNS_LATEST}, f.rowid AS row_order,
    COALESCE((SELECT max(v.verified_at) FROM fact_verification v WHERE v.fact_id = f.id), f.created_at)
      AS last_verified_at
  FROM fact f
  WHERE f.namespace = @namespace AND ${TIME_PREDICATE})
WHERE last_verified_at < @notVerifiedSince
   OR (@confidenceBelow IS NOT NULL AND confidence < @confidenceBelow)
ORDER BY last_verified_at, row_order LIMIT @limit`;

/**
 * Live facts with no source left unpurged, or whose latest verification is `source_missing`:
 * the latest time, then the latest rowid. In row order.
 */
export const ORPHANED_FACTS_SQL = `SELECT ${FACT_COLUMNS_LATEST} FROM fact f
WHERE f.namespace = @namespace AND f.invalidated_at IS NULL
  AND (NOT EXISTS (
         SELECT 1 FROM fact_source fs JOIN source s ON s.id = fs.source_id
         WHERE fs.fact_id = f.id AND s.purged_at IS NULL)
       OR (SELECT v.outcome FROM fact_verification v WHERE v.fact_id = f.id
           ORDER BY v.verified_at DESC, v.rowid DESC LIMIT 1) = 'source_missing')
ORDER BY f.rowid LIMIT @limit`;

/**
 * Builds the structural reads of a SQLite store. Statements are prepared once and reused;
 * a `listFacts` statement is prepared the first time its combination of filters is used.
 * The functions throw what the driver throws and `UnreadableRow`; the caller turns both
 * into `storage_failed`.
 */
export function createReads(db: Database, embeddingModel: EmbeddingModel): SqliteReads {
  const selectEntitiesByName = db.prepare<[string, string], EntityRow>(
    'SELECT id, namespace, type, name, created_at FROM entity WHERE namespace = ? AND name_key = ? ORDER BY rowid',
  );
  const selectEntitiesByNameAndType = db.prepare<[string, string, string], EntityRow>(
    'SELECT id, namespace, type, name, created_at FROM entity WHERE namespace = ? AND name_key = ? AND type = ?',
  );
  const selectEntitiesByIds = db.prepare<[string, string], EntityRow>(
    `SELECT id, namespace, type, name, created_at FROM entity
     WHERE namespace = ? AND id IN (SELECT value FROM json_each(?))`,
  );
  const selectFact = db.prepare<[string, string], FactRow>(
    `SELECT ${FACT_COLUMNS_LATEST} FROM fact f WHERE f.id = ? AND f.namespace = ?`,
  );
  const selectSource = db.prepare<[string, string], SourceRow>(
    `SELECT ${SOURCE_COLUMNS} FROM source WHERE id = ? AND namespace = ?`,
  );
  const selectSourcesOfFacts = db.prepare<[string, string], SourceRow & { readonly fact_id: string }>(
    `SELECT fs.fact_id, s.id, s.namespace, s.kind, s.locator, s.version, s.content, s.content_hash,
            s.observed_at, s.created_at, s.purged_at
     FROM fact_source fs JOIN source s ON s.id = fs.source_id
     WHERE s.namespace = ? AND fs.fact_id IN (SELECT value FROM json_each(?))
     ORDER BY s.created_at, s.rowid`,
  );
  const selectAuditEntries = db.prepare<[string, string, string], AuditRow>(
    `SELECT id, namespace, operation_id, operation, action, target_kind, target_id, trigger, reason_code,
            source_id, detail, occurred_at
     FROM audit_log WHERE namespace = ? AND target_kind = ? AND target_id = ? ORDER BY id`,
  );
  // The keyword lane: statements that hold any term of the query, best match first. bm25()
  // is smaller for a better match. The namespace and the time predicate are in the same
  // query as the MATCH, so the limit counts only facts that pass them.
  const selectByKeyword = db.prepare<[Record<string, unknown>], FactRow>(
    `SELECT ${FACT_COLUMNS_AT_KNOWN_AT}
     FROM fact_fts JOIN fact f ON f.rowid = fact_fts.rowid
     WHERE fact_fts MATCH @match AND f.namespace = @namespace AND ${TIME_PREDICATE} AND ${ARCHIVE_FILTER}
     ORDER BY bm25(fact_fts), f.rowid DESC LIMIT @limit`,
  );
  // The vector lane: an exact scan of the embeddings of the facts that pass the namespace
  // and the time predicate, nearest first. The filter is in the same query as the distance,
  // so the limit counts only facts that pass it: the nearest rows can all be superseded copies.
  const selectByVector = db.prepare<[Record<string, unknown>], FactRow>(
    `SELECT ${FACT_COLUMNS_AT_KNOWN_AT}
     FROM fact f JOIN fact_embedding e ON e.fact_id = f.id
     WHERE f.namespace = @namespace AND ${TIME_PREDICATE} AND ${ARCHIVE_FILTER}
     ORDER BY vec_distance_cosine(e.embedding, @vector), f.rowid LIMIT @limit`,
  );
  const selectFactsOfSources = db.prepare<[string, string], FactRow>(
    `SELECT ${FACT_COLUMNS_LATEST} FROM fact f
     WHERE f.namespace = ? AND f.id IN (
       SELECT fs.fact_id FROM fact_source fs WHERE fs.source_id IN (SELECT value FROM json_each(?)))
     ORDER BY f.created_at, f.rowid`,
  );
  const selectSourcesByHash = db.prepare<[string, string], SourceRow>(
    `SELECT ${SOURCE_COLUMNS} FROM source WHERE namespace = ? AND content_hash = ? ORDER BY created_at, rowid`,
  );
  const selectMergesFrom = db.prepare<
    { namespace: string; ids: string },
    { from_entity_id: string; into_entity_id: string }
  >(resolveEntityIdsOfArray('@ids'));
  const selectPendingProposals = db.prepare<[string], ProposedChangeRow>(
    `SELECT id, namespace, stored_fact_id, kind, changed_at, new_fact, source_id, reason_code,
            proposed_at, state, decided_at
     FROM proposed_change WHERE namespace = ? AND state = 'pending' ORDER BY proposed_at, rowid`,
  );
  const selectMerges = db.prepare<[string], EntityMergeRow>(
    `SELECT id, namespace, from_entity_id, into_entity_id, merged_at, undone_at FROM entity_merge
     WHERE namespace = ? ORDER BY merged_at, rowid`,
  );
  const selectFeedback = db.prepare<[string, string], FeedbackRow>(
    `SELECT id, namespace, fact_id, signal, trigger, source_id, recorded_at FROM feedback
     WHERE namespace = ? AND fact_id = ? ORDER BY recorded_at, rowid`,
  );
  // Paged by identifier: SQLite orders by the primary key and stops at the limit.
  const selectEntityPage = db.prepare<{ namespace: string; after: string | null; limit: number }, EntityRow>(
    `SELECT id, namespace, type, name, created_at FROM entity
     WHERE namespace = @namespace AND (@after IS NULL OR id > @after) ORDER BY id LIMIT @limit`,
  );
  // Current, not archived, recorded before the date and not recalled since; nothing until usage
  // tracking began on or before the date (FL-073).
  const selectUnusedFacts = db.prepare<[Record<string, unknown>], FactRow>(
    `SELECT ${FACT_COLUMNS_LATEST} FROM fact f
     WHERE f.namespace = @namespace AND ${TIME_PREDICATE} AND f.created_at < @unusedSince AND ${NOT_ARCHIVED}
       AND NOT EXISTS (SELECT 1 FROM fact_usage u WHERE u.fact_id = f.id AND u.last_recalled_at >= @unusedSince)
       AND EXISTS (SELECT 1 FROM fact_usage_tracking t WHERE t.namespace = @namespace AND t.started_at <= @unusedSince)
     ORDER BY f.created_at, f.rowid LIMIT @limit`,
  );
  const selectVerifications = db.prepare<[string, string], FactVerificationRow>(
    `SELECT id, namespace, fact_id, outcome, method, verified_at FROM fact_verification
     WHERE namespace = ? AND fact_id = ? ORDER BY rowid`,
  );
  const selectStaleFacts = db.prepare<[Record<string, unknown>], FactRow>(STALE_FACTS_SQL);
  const selectOrphanedFacts = db.prepare<[Record<string, unknown>], FactRow>(ORPHANED_FACTS_SQL);
  const selectOpenArchives = db.prepare<[string], { readonly fact_id: string; readonly archived_at: string }>(
    `SELECT fact_id, archived_at FROM fact_archive
     WHERE unarchived_at IS NULL AND fact_id IN (SELECT value FROM json_each(?))`,
  );
  const listStatements = new Map<string, Statement<[Record<string, unknown>], FactRow>>();

  // Three queries for any number of facts: the facts are given, then their entities, then their sources.
  const withSources = (rows: readonly FactRow[], namespace: string): FactWithSources[] => {
    if (rows.length === 0) return [];
    const recorded = new Set<string>();
    for (const row of rows) {
      recorded.add(row.subject_entity_id);
      if (row.object_entity_id !== null) recorded.add(row.object_entity_id);
    }
    // A fact is shown under the entity each of its entities resolves to through merges.
    const resolvedTo = new Map(
      selectMergesFrom
        .all({ namespace, ids: JSON.stringify([...recorded]) })
        .map((row) => [row.from_entity_id, row.into_entity_id]),
    );
    const resolve = (entityId: string): string => resolvedTo.get(entityId) ?? entityId;
    const entityIds = new Set([...recorded].map(resolve));
    const entities = new Map(
      selectEntitiesByIds
        .all(namespace, JSON.stringify([...entityIds]))
        .map((row) => [row.id, toEntity(row)]),
    );
    const sourcesOf = new Map<string, ReturnType<typeof toSource>[]>();
    for (const row of selectSourcesOfFacts.all(namespace, JSON.stringify(rows.map((fact) => fact.id)))) {
      const sources = sourcesOf.get(row.fact_id) ?? [];
      sources.push(toSource(row));
      sourcesOf.set(row.fact_id, sources);
    }
    const archivedAt = new Map(
      selectOpenArchives
        .all(JSON.stringify(rows.map((fact) => fact.id)))
        .map((row) => [row.fact_id, TimestampSchema.parse(row.archived_at)]),
    );
    return rows.flatMap((row) => {
      const subject = entities.get(resolve(row.subject_entity_id));
      if (subject === undefined) return [];
      const objectEntity =
        row.object_entity_id === null ? null : (entities.get(resolve(row.object_entity_id)) ?? null);
      return [
        {
          fact: toFact(row),
          subject,
          objectEntity,
          sources: sourcesOf.get(row.id) ?? [],
          archivedAt: archivedAt.get(row.id) ?? null,
        },
      ];
    });
  };

  return {
    findEntities(query) {
      const nameKey = normaliseEntityName(query.name);
      const rows =
        query.type === null
          ? selectEntitiesByName.all(query.namespace, nameKey)
          : selectEntitiesByNameAndType.all(query.namespace, nameKey, query.type);
      return rows.map(toEntity);
    },

    getFact(query) {
      const row = selectFact.get(query.factId, query.namespace);
      return row === undefined ? null : (withSources([row], query.namespace)[0] ?? null);
    },

    listFacts(query) {
      if (!Number.isInteger(query.limit) || query.limit < 1) return invalidLimit();
      const shape: ListFactsShape = {
        hasSubject: query.subjectEntityId !== null,
        hasPredicate: query.predicate !== null,
        hasTouching: query.touchingEntityIds !== null,
        hasSupersededBy: query.supersededByFactId !== null,
        time: typeof query.time === 'string' ? query.time : 'filter',
        excludeArchived: query.excludeArchived === true,
      };
      const key = JSON.stringify(shape);
      let statement = listStatements.get(key);
      if (statement === undefined) {
        statement = db.prepare<[Record<string, unknown>], FactRow>(buildListFactsSql(shape));
        listStatements.set(key, statement);
      }
      // Only the parameters that this combination's SQL names may be bound.
      const parameters: Record<string, unknown> = { namespace: query.namespace, limit: query.limit };
      if (query.subjectEntityId !== null) parameters.subjectEntityId = query.subjectEntityId;
      if (query.predicate !== null) parameters.predicate = query.predicate;
      if (query.supersededByFactId !== null) parameters.supersededByFactId = query.supersededByFactId;
      if (query.touchingEntityIds !== null)
        parameters.touchingEntityIds = JSON.stringify(query.touchingEntityIds);
      if (typeof query.time !== 'string') {
        parameters.validAt = query.time.validAt;
        parameters.knownAt = query.time.knownAt;
      }
      return ok(withSources(statement.all(parameters), query.namespace));
    },

    searchFactsByVector(query) {
      if (!Number.isInteger(query.limit) || query.limit < 1) return invalidLimit();
      if (query.vector.length !== embeddingModel.dimensions) {
        return err(
          'invalid_input',
          `The query vector has ${query.vector.length} dimensions, but this memory holds vectors of ${embeddingModel.dimensions}.`,
        );
      }
      const rows = selectByVector.all({
        vector: toBlob(query.vector),
        namespace: query.namespace,
        validAt: query.time.validAt,
        knownAt: query.time.knownAt,
        limit: query.limit,
        excludeArchived: query.excludeArchived === true ? 1 : 0,
      });
      return ok(withSources(rows, query.namespace));
    },

    searchFactsByKeyword(query) {
      if (!Number.isInteger(query.limit) || query.limit < 1) return invalidLimit();
      const match = buildKeywordQuery(query.text);
      if (match === null) return ok([]);
      const rows = selectByKeyword.all({
        match,
        namespace: query.namespace,
        validAt: query.time.validAt,
        knownAt: query.time.knownAt,
        limit: query.limit,
        excludeArchived: query.excludeArchived === true ? 1 : 0,
      });
      return ok(withSources(rows, query.namespace));
    },

    getSource(query) {
      const row = selectSource.get(query.sourceId, query.namespace);
      return row === undefined ? null : toSource(row);
    },

    listAuditEntries(query) {
      return selectAuditEntries.all(query.namespace, query.targetKind, query.targetId).map(toAuditEntry);
    },

    listFactsOfSources(query) {
      return withSources(
        selectFactsOfSources.all(query.namespace, JSON.stringify(query.sourceIds)),
        query.namespace,
      );
    },

    findSourcesByContentHash(query) {
      return selectSourcesByHash.all(query.namespace, query.contentHash).map(toSource);
    },

    listPendingProposals(query) {
      return selectPendingProposals.all(query.namespace).flatMap((row) => {
        const proposal = toProposedChange(row);
        const stored = selectFact.get(proposal.storedFactId, query.namespace);
        const storedFact = stored === undefined ? undefined : withSources([stored], query.namespace)[0];
        return storedFact === undefined ? [] : [{ proposal, storedFact }];
      });
    },

    listEntityMerges(query) {
      return selectMerges.all(query.namespace).map(toEntityMerge);
    },

    listFeedback(query) {
      return selectFeedback.all(query.namespace, query.factId).map(toFeedback);
    },

    listEntities(query) {
      if (!Number.isInteger(query.limit) || query.limit < 1) return invalidLimit();
      return ok(
        selectEntityPage
          .all({ namespace: query.namespace, after: query.afterEntityId, limit: query.limit })
          .map(toEntity),
      );
    },

    listUnusedFacts(query) {
      if (!Number.isInteger(query.limit) || query.limit < 1) return invalidLimit();
      const rows = selectUnusedFacts.all({
        namespace: query.namespace,
        validAt: query.currentAt,
        knownAt: query.currentAt,
        unusedSince: query.unusedSince,
        limit: query.limit,
      });
      return ok(withSources(rows, query.namespace));
    },

    listVerifications(query) {
      return selectVerifications.all(query.namespace, query.factId).map(toFactVerification);
    },

    listStaleFacts(query) {
      if (!Number.isInteger(query.limit) || query.limit < 1) return invalidLimit();
      const rows = selectStaleFacts.all({
        namespace: query.namespace,
        validAt: query.currentAt,
        knownAt: query.currentAt,
        notVerifiedSince: query.notVerifiedSince,
        confidenceBelow: query.confidenceBelow,
        limit: query.limit,
      });
      return ok(withSources(rows, query.namespace));
    },

    listOrphanedFacts(query) {
      if (!Number.isInteger(query.limit) || query.limit < 1) return invalidLimit();
      const rows = selectOrphanedFacts.all({ namespace: query.namespace, limit: query.limit });
      return ok(withSources(rows, query.namespace));
    },
  };
}
