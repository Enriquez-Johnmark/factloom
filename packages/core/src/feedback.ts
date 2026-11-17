import { z } from 'zod';
import { TriggerSchema } from './audit.ts';
import { FactIdSchema, NamespaceSchema, SourceIdSchema } from './fact.ts';
import { TimestampSchema } from './timestamp.ts';

/** What someone found a recalled fact to be. */
export const FeedbackSignalSchema = z.enum(['right', 'wrong', 'outdated']);
export type FeedbackSignal = z.infer<typeof FeedbackSignalSchema>;

/**
 * One piece of feedback on a fact. It changes no fact. What was said is the content of the
 * source it names, never text in this row.
 */
export const FeedbackSchema = z
  .strictObject({
    id: z.string().min(1),
    namespace: NamespaceSchema,
    factId: FactIdSchema,
    signal: FeedbackSignalSchema,
    trigger: TriggerSchema,
    sourceId: SourceIdSchema.nullable(),
    recordedAt: TimestampSchema,
  })
  .readonly();
export type Feedback = z.infer<typeof FeedbackSchema>;
