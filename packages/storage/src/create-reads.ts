import {
  err,
  type FactWithSources,
  type MemoryStore,
  normaliseEntityName,
  ok,
  type Result,
} from '@factloom/core';
import type { Database, Statement } from 'better-sqlite3';
import { buildKeywordQuery } from './build-keyword-query.ts';
import { type EmbeddingModel, toBlob } from './embedding-model.ts';
import {
  type AuditRow,
  type EntityRow,
  type FactRow,
  type SourceRow,
  toAuditEntry,
  toEntity,
  toFact,
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
};

const FACT_COLUMNS = `f.id, f.namespace, f.subject_entity_id, f.predicate, f.object_entity_id, f.object_value,
  f.statement, f.confidence, f.valid_from, f.valid_to, f.created_at, f.invalidated_at, f.superseded_by_fact_id`;

/**
 * The SQL of `listFacts` for one combination of filters. It is built only from the fixed
 * fragments below: every value is a bound parameter. A filter that is not given is left out
 * of the text, so that SQLite can choose the index of the filters that are.
 */
export function buildListFactsSql(shape: ListFactsShape): string {
  const conditions = ['f.namespace = @namespace'];
  if (shape.hasSubject) conditions.push('f.subject_entity_id = @subjectEntityId');
  if (shape.hasPredicate) conditions.push('f.predicate = @predicate');
  if (shape.hasSupersededBy) conditions.push('f.superseded_by_fact_id = @supersededByFactId');
  if (shape.time === 'live') conditions.push('f.invalidated_at IS NULL');
  if (shape.time === 'filter') conditions.push(TIME_PREDICATE);
  const where = conditions.join('\n  AND ');
  // Newest first. Facts recorded at the same moment come in the reverse of their row order,
  // which never changes, so the order is the same on every run.
  const select = (extra: string): string =>
    `SELECT ${FACT_COLUMNS}, f.rowid AS row_order FROM fact f WHERE ${where}${extra}`;
  if (!shape.hasTouching) return `${select('')} ORDER BY f.created_at DESC, f.rowid DESC LIMIT @limit`;
  // Facts whose subject or whose object entity is one of the given entities. Two selects, so
  // that each can use its own index; UNION drops a fact that both find. The identifiers are
  // bound as one JSON array and read with json_each.
  const touching = (column: string): string =>
    select(`\n  AND f.${column} IN (SELECT value FROM json_each(@touchingEntityIds))`);
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
};

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
    `SELECT ${FACT_COLUMNS} FROM fact f WHERE f.id = ? AND f.namespace = ?`,
  );
  const selectSource = db.prepare<[string, string], SourceRow>(
    `SELECT id, namespace, kind, locator, version, content, content_hash, observed_at, created_at
     FROM source WHERE id = ? AND namespace = ?`,
  );
  const selectSourcesOfFacts = db.prepare<[string, string], SourceRow & { readonly fact_id: string }>(
    `SELECT fs.fact_id, s.id, s.namespace, s.kind, s.locator, s.version, s.content, s.content_hash,
            s.observed_at, s.created_at
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
    `SELECT ${FACT_COLUMNS}
     FROM fact_fts JOIN fact f ON f.rowid = fact_fts.rowid
     WHERE fact_fts MATCH @match AND f.namespace = @namespace AND ${TIME_PREDICATE}
     ORDER BY bm25(fact_fts), f.rowid DESC LIMIT @limit`,
  );
  // The vector lane: an exact scan of the embeddings of the facts that pass the namespace
  // and the time predicate, nearest first. The filter is in the same query as the distance,
  // so the limit counts only facts that pass it: the nearest rows can all be superseded copies.
  const selectByVector = db.prepare<[Record<string, unknown>], FactRow>(
    `SELECT ${FACT_COLUMNS}
     FROM fact f JOIN fact_embedding e ON e.fact_id = f.id
     WHERE f.namespace = @namespace AND ${TIME_PREDICATE}
     ORDER BY vec_distance_cosine(e.embedding, @vector), f.rowid LIMIT @limit`,
  );
  const listStatements = new Map<string, Statement<[Record<string, unknown>], FactRow>>();

  // Three queries for any number of facts: the facts are given, then their entities, then their sources.
  const withSources = (rows: readonly FactRow[], namespace: string): FactWithSources[] => {
    if (rows.length === 0) return [];
    const entityIds = new Set<string>();
    for (const row of rows) {
      entityIds.add(row.subject_entity_id);
      if (row.object_entity_id !== null) entityIds.add(row.object_entity_id);
    }
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
    return rows.flatMap((row) => {
      const subject = entities.get(row.subject_entity_id);
      if (subject === undefined) return [];
      const objectEntity =
        row.object_entity_id === null ? null : (entities.get(row.object_entity_id) ?? null);
      return [{ fact: toFact(row), subject, objectEntity, sources: sourcesOf.get(row.id) ?? [] }];
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
  };
}
