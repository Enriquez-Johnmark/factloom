import { z } from 'zod';
import { FactIdSchema } from './fact.ts';
import { TimestampSchema } from './timestamp.ts';

/**
 * How often recall has returned a fact, and when last. Bookkeeping, not memory: it is
 * written outside `commit`, with no audit entry, and changes no fact.
 */
export const FactUsageSchema = z
  .strictObject({
    factId: FactIdSchema,
    lastRecalledAt: TimestampSchema,
    recallCount: z.number().int().positive(),
  })
  .readonly();
export type FactUsage = z.infer<typeof FactUsageSchema>;
