import { z } from 'zod';
import { OperationSchema, ReasonCodeSchema, TriggerSchema } from './audit.ts';
import {
  EntitySchema,
  FactIdSchema,
  FactSchema,
  NamespaceSchema,
  SourceIdSchema,
  SourceSchema,
} from './fact.ts';
import { EntityMergeSchema } from './entity-merge.ts';
import { FeedbackSchema } from './feedback.ts';
import { TimestampSchema } from './timestamp.ts';

/** A vector with at least one number. Its size is checked against the model by the store. */
const VectorSchema = z.custom<Float32Array>((value) => value instanceof Float32Array && value.length > 0, {
  error: 'Expected a Float32Array with at least one number.',
});

/** One change to memory, as plain data. Phases 2 and 3 add kinds; adding a kind does not change these. */
export const ChangeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('create_entity'), entity: EntitySchema }).readonly(),
  z.strictObject({ kind: z.literal('record_source'), source: SourceSchema }).readonly(),
  z
    .strictObject({
      kind: z.literal('record_fact'),
      fact: FactSchema,
      /** At least one. Sources recorded earlier in the same change set may be used. */
      sourceIds: z.tuple([SourceIdSchema], SourceIdSchema).readonly(),
      /** A new vector, or the vector of the fact this one revises. */
      embedding: z.union([VectorSchema, z.strictObject({ copyFromFactId: FactIdSchema }).readonly()]),
      /** Whether the single-value rule applies. Set by core from the domain's predicate. */
      singleValued: z.boolean(),
    })
    .readonly(),
  z
    .strictObject({ kind: z.literal('attach_source'), factId: FactIdSchema, sourceId: SourceIdSchema })
    .readonly(),
  z
    .strictObject({
      kind: z.literal('invalidate_fact'),
      factId: FactIdSchema,
      supersededByFactId: FactIdSchema.nullable(),
    })
    .readonly(),
  z
    .strictObject({
      kind: z.literal('adjust_confidence'),
      factId: FactIdSchema,
      /** The new confidence, from the change set's `occurredAt`. The fact row is not changed. */
      confidence: z.number().min(0).max(1),
    })
    .readonly(),
  z.strictObject({ kind: z.literal('record_feedback'), feedback: FeedbackSchema }).readonly(),
  z
    .strictObject({
      kind: z.literal('purge_content'),
      /** A fact's text, or a source's content and locator, is replaced (ADR 0012). */
      targetKind: z.enum(['source', 'fact']),
      targetId: z.string().min(1),
    })
    .readonly(),
  /** Phase 3. Records that one entity is the same as another; no entity or fact is rewritten. */
  z.strictObject({ kind: z.literal('merge_entities'), merge: EntityMergeSchema }).readonly(),
]);
export type Change = z.infer<typeof ChangeSchema>;

/** Names the row of a change whose namespace differs from the change set's, if any. */
function findForeignRow(namespace: string, change: Change): string | null {
  switch (change.kind) {
    case 'create_entity':
      return change.entity.namespace === namespace ? null : `entity ${change.entity.id}`;
    case 'record_source':
      return change.source.namespace === namespace ? null : `source ${change.source.id}`;
    case 'record_fact':
      return change.fact.namespace === namespace ? null : `fact ${change.fact.id}`;
    case 'attach_source':
    case 'invalidate_fact':
    case 'adjust_confidence':
    case 'purge_content':
      return null;
    case 'merge_entities':
      return change.merge.namespace === namespace ? null : `merge ${change.merge.id}`;
    case 'record_feedback':
      return change.feedback.namespace === namespace ? null : `feedback ${change.feedback.id}`;
    default: {
      const unhandled: never = change;
      return unhandled;
    }
  }
}

/** The changes that one operation makes to memory. A store applies all of them or none. */
export const ChangeSetSchema = z
  .strictObject({
    namespace: NamespaceSchema,
    /** Shared by every audit entry this commit writes. */
    operationId: z.string().min(1),
    operation: OperationSchema,
    trigger: TriggerSchema,
    reasonCode: ReasonCodeSchema,
    /** The source that explains the change. It may be recorded in this same change set. */
    explainedBySourceId: SourceIdSchema.nullable(),
    occurredAt: TimestampSchema,
    changes: z.array(ChangeSchema).readonly(),
  })
  .check((context) => {
    for (const change of context.value.changes) {
      const foreign = findForeignRow(context.value.namespace, change);
      if (foreign !== null) {
        context.issues.push({
          code: 'custom',
          message: `The ${foreign} is in another namespace than the change set.`,
          input: context.value,
        });
      }
    }
  })
  .readonly();
export type ChangeSet = z.infer<typeof ChangeSetSchema>;

/** What a store returns after a commit. */
export const CommitReceiptSchema = z
  .strictObject({
    operationId: z.string().min(1),
    auditEntryCount: z.number().int().nonnegative(),
  })
  .readonly();
export type CommitReceipt = z.infer<typeof CommitReceiptSchema>;
