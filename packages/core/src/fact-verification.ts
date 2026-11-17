import { z } from 'zod';
import { FactIdSchema, NamespaceSchema } from './fact.ts';
import { TimestampSchema } from './timestamp.ts';

/** What checking a fact against its source found. */
export const VerificationOutcomeSchema = z.enum([
  'confirmed',
  'contradicted',
  'source_missing',
  'inconclusive',
]);
export type VerificationOutcome = z.infer<typeof VerificationOutcomeSchema>;

/** How a fact was checked: by a rule that needs no model, or by an LLM. */
export const VerificationMethodSchema = z.enum(['deterministic', 'llm']);
export type VerificationMethod = z.infer<typeof VerificationMethodSchema>;

/**
 * The outcome of checking one fact against its source. It changes no fact: what follows from
 * an outcome is a separate fact operation, so the audit log shows the finding and the action.
 */
export const FactVerificationSchema = z
  .strictObject({
    id: z.string().min(1),
    namespace: NamespaceSchema,
    factId: FactIdSchema,
    outcome: VerificationOutcomeSchema,
    method: VerificationMethodSchema,
    verifiedAt: TimestampSchema,
  })
  .readonly();
export type FactVerification = z.infer<typeof FactVerificationSchema>;
