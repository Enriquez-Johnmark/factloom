import { z } from 'zod';
import { NamespaceSchema, SourceIdSchema } from './fact.ts';
import { TimestampSchema } from './timestamp.ts';

/** What caused a change. */
export const TriggerSchema = z.enum(['agent', 'person', 'feedback', 'maintenance']);
export type Trigger = z.infer<typeof TriggerSchema>;

/** What was being done. Phases 2 and 3 add 'merge', 'verification', 'feedback' and 'purge'. */
export const OperationSchema = z.enum([
  'remember',
  'revision',
  'succession',
  'correction',
  'retraction',
  'confidence_adjustment',
  'feedback',
  'purge',
]);
export type Operation = z.infer<typeof OperationSchema>;

/** Why, from a fixed list, so that the audit log holds no free text. Later phases add codes. */
export const ReasonCodeSchema = z.enum([
  'stated',
  'restated',
  'reported_wrong',
  'reported_ended',
  'period_corrected',
  'feedback_given',
  'erasure_requested',
  'secret_stored',
]);
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;

/** What happened to one row. */
export const AuditActionSchema = z.enum([
  'entity.created',
  'source.recorded',
  'fact.recorded',
  'fact.source_attached',
  'fact.invalidated',
  'fact.confidence_adjusted',
  'feedback.recorded',
  'source.purged',
  'fact.purged',
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

/** The kind of row an audit entry is about. */
export const AuditTargetKindSchema = z.enum(['entity', 'source', 'fact', 'feedback']);

/**
 * One record of one change to memory. It holds identifiers and codes, never free text:
 * the explanation of a change is the content of the source the entry points to.
 */
export const AuditEntrySchema = z
  .strictObject({
    id: z.number().int().nonnegative(),
    namespace: NamespaceSchema,
    operationId: z.string().min(1),
    operation: OperationSchema,
    action: AuditActionSchema,
    targetKind: AuditTargetKindSchema,
    targetId: z.string().min(1),
    trigger: TriggerSchema,
    reasonCode: ReasonCodeSchema,
    /** The source that explains the change. Its content is the free-text explanation. */
    sourceId: SourceIdSchema.nullable(),
    /** Identifiers and numbers only. A flat record, so nothing can be nested inside it. */
    detail: z
      .record(z.string(), z.union([z.string(), z.number(), z.null()]))
      .readonly()
      .nullable(),
    occurredAt: TimestampSchema,
  })
  .readonly();
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
