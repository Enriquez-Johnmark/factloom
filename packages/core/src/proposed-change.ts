import { z } from 'zod';
import { ReasonCodeSchema } from './audit.ts';
import { EntityIdSchema, FactIdSchema, FactObjectSchema, NamespaceSchema, SourceIdSchema } from './fact.ts';
import type { FactDraft } from './operations/operation-inputs.ts';
import { TimestampSchema } from './timestamp.ts';

/** A fact with the entities it introduces, as an operation takes it. Parsed where a stored one is read. */
export const FactDraftSchema = z
  .strictObject({
    fact: z
      .strictObject({
        subjectEntityId: EntityIdSchema,
        predicate: z.string().min(1),
        object: FactObjectSchema,
        statement: z.string().min(1),
        confidence: z.number().min(0).max(1),
        validFrom: TimestampSchema.nullable(),
        validTo: TimestampSchema.nullable(),
      })
      .readonly(),
    newEntities: z
      .array(
        z.strictObject({ id: EntityIdSchema, type: z.string().min(1), name: z.string().min(1) }).readonly(),
      )
      .readonly(),
  })
  .readonly() satisfies z.ZodType<FactDraft>;

/**
 * Phase 2 (FL-043). A succession or a correction held for a person to decide. It stores the
 * input of the operation it would run, not a built change set, so that approval records the
 * facts at the time of approval (ADR 0009). It changes no fact until it is approved.
 */
export const ProposedChangeSchema = z
  .strictObject({
    id: z.string().min(1),
    namespace: NamespaceSchema,
    /** The live fact it would end or invalidate, in the same namespace. */
    storedFactId: FactIdSchema,
    /** A succession carries when the stored fact ended; a correction has no such moment. */
    supersession: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('succession'), changedAt: TimestampSchema }).readonly(),
      z.strictObject({ kind: z.literal('correction') }).readonly(),
    ]),
    /** The fact to put in its place. */
    newFact: FactDraftSchema,
    /** The source that explains it, recorded when the proposal is stored. */
    sourceId: SourceIdSchema,
    /** The reason code the change is recorded with when it is approved. */
    reasonCode: ReasonCodeSchema,
    proposedAt: TimestampSchema,
    state: z.enum(['pending', 'approved', 'rejected']),
    /** When it was approved or rejected; null while it is pending. */
    decidedAt: TimestampSchema.nullable(),
  })
  .readonly();
export type ProposedChange = z.infer<typeof ProposedChangeSchema>;
