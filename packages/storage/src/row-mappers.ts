import {
  type AuditEntry,
  AuditEntrySchema,
  type Entity,
  EntitySchema,
  type Fact,
  FactSchema,
  type Source,
  SourceSchema,
} from '@factloom/core';

/**
 * A row that does not parse into its core type. It means the database holds something this
 * version of the code does not understand, which the caller reports as `storage_failed`.
 */
export class UnreadableRow extends Error {}

/** What this file needs of a core schema. Written out because storage does not import zod. */
type RowSchema<Value> = {
  safeParse(value: unknown):
    | { readonly success: true; readonly data: Value }
    | {
        readonly success: false;
        readonly error: {
          readonly issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[];
        };
      };
};

function parseRow<Value>(schema: RowSchema<Value>, kind: string, value: unknown): Value {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const reasons = parsed.error.issues
    .map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`)
    .join('; ');
  throw new UnreadableRow(`A stored ${kind} could not be read. ${reasons}`);
}

export type EntityRow = {
  readonly id: string;
  readonly namespace: string;
  readonly type: string;
  readonly name: string;
  readonly created_at: string;
};

export function toEntity(row: EntityRow): Entity {
  return parseRow(EntitySchema, 'entity', {
    id: row.id,
    namespace: row.namespace,
    type: row.type,
    name: row.name,
    createdAt: row.created_at,
  });
}

export type SourceRow = {
  readonly id: string;
  readonly namespace: string;
  readonly kind: string;
  readonly locator: string | null;
  readonly version: string | null;
  readonly content: string | null;
  readonly content_hash: string | null;
  readonly observed_at: string;
  readonly created_at: string;
};

export function toSource(row: SourceRow): Source {
  return parseRow(SourceSchema, 'source', {
    id: row.id,
    namespace: row.namespace,
    kind: row.kind,
    locator: row.locator,
    version: row.version,
    content: row.content,
    contentHash: row.content_hash,
    observedAt: row.observed_at,
    createdAt: row.created_at,
  });
}

export type FactRow = {
  readonly id: string;
  readonly namespace: string;
  readonly subject_entity_id: string;
  readonly predicate: string;
  readonly object_entity_id: string | null;
  readonly object_value: string | null;
  readonly statement: string;
  readonly confidence: number;
  readonly valid_from: string | null;
  readonly valid_to: string | null;
  readonly created_at: string;
  readonly invalidated_at: string | null;
  readonly superseded_by_fact_id: string | null;
};

export function toFact(row: FactRow): Fact {
  return parseRow(FactSchema, 'fact', {
    id: row.id,
    namespace: row.namespace,
    subjectEntityId: row.subject_entity_id,
    predicate: row.predicate,
    object:
      row.object_entity_id === null
        ? { kind: 'value', value: row.object_value }
        : { kind: 'entity', entityId: row.object_entity_id },
    statement: row.statement,
    confidence: row.confidence,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    createdAt: row.created_at,
    invalidatedAt: row.invalidated_at,
    supersededByFactId: row.superseded_by_fact_id,
  });
}

export type AuditRow = {
  readonly id: number;
  readonly namespace: string;
  readonly operation_id: string;
  readonly operation: string;
  readonly action: string;
  readonly target_kind: string;
  readonly target_id: string;
  readonly trigger: string;
  readonly reason_code: string;
  readonly source_id: string | null;
  readonly detail: string | null;
  readonly occurred_at: string;
};

export function toAuditEntry(row: AuditRow): AuditEntry {
  let detail: unknown = null;
  if (row.detail !== null) {
    try {
      detail = JSON.parse(row.detail);
    } catch {
      throw new UnreadableRow(`The detail of audit entry ${row.id} is not JSON.`);
    }
  }
  return parseRow(AuditEntrySchema, 'audit entry', {
    id: row.id,
    namespace: row.namespace,
    operationId: row.operation_id,
    operation: row.operation,
    action: row.action,
    targetKind: row.target_kind,
    targetId: row.target_id,
    trigger: row.trigger,
    reasonCode: row.reason_code,
    sourceId: row.source_id,
    detail,
    occurredAt: row.occurred_at,
  });
}
