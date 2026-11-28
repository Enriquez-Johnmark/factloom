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
 * Phase 2 (FL-043). A succession, a correction or, from FL-095, a retraction held for a person
 * to decide. It stores the
 * input of the operation it would run, not a built change set, so that approval records the
 * facts at the time of approval (ADR 0009). It changes no fact until it is approved.
 */
export const ProposedChangeSchema = z
  .strictObject({
    id: z.string().min(1),
    namespace: NamespaceSchema,
    /** The live fact it would end or invalidate, in the same namespace. */
    storedFactId: FactIdSchema,
    /** A succession carries when the stored fact ended; a correction and a retraction have no such moment. */
    supersession: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('succession'), changedAt: TimestampSchema }).readonly(),
      z.strictObject({ kind: z.literal('correction') }).readonly(),
      z.strictObject({ kind: z.literal('retraction') }).readonly(),
    ]),
    /**
     * The fact to put in its place: always for a correction, never for a retraction, and null
     * for a succession that ends the stored fact with nothing after it (FL-095).
     */
    newFact: FactDraftSchema.nullable(),
    /** The source that explains it, recorded when the proposal is stored. */
    sourceId: SourceIdSchema,
    /** The reason code the change is recorded with when it is approved. */
    reasonCode: ReasonCodeSchema,
    proposedAt: TimestampSchema,
    state: z.enum(['pending', 'approved', 'rejected']),
    /** When it was approved or rejected; null while it is pending. */
    decidedAt: TimestampSchema.nullable(),
  })
  .check((context) => {
    const problem = findNewFactProblem(context.value);
    if (problem !== null) context.issues.push({ code: 'custom', message: problem, input: context.value });
  })
  .readonly();
export type ProposedChange = z.infer<typeof ProposedChangeSchema>;

/**
 * Says why a proposal's new fact does not fit its kind, or returns null: a correction replaces
 * the stored fact, so it needs one, and a retraction puts nothing in its place.
 */
export function findNewFactProblem(proposal: {
  readonly supersession: { readonly kind: 'succession' | 'correction' | 'retraction' };
  readonly newFact: unknown;
}): string | null {
  if (proposal.supersession.kind === 'correction' && proposal.newFact === null) {
    return "A proposed correction needs the fact that takes the stored one's place.";
  }
  if (proposal.supersession.kind === 'retraction' && proposal.newFact !== null) {
    return "A proposed retraction puts nothing in the stored fact's place, so it has no new fact.";
  }
  return null;
}
