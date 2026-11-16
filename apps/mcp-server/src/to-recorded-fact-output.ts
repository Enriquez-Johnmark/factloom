import type { RememberedFact } from '@factloom/graph-rag';
import { z } from 'zod';

/** A fact that a recording tool wrote or restated, in the field names of MCP-TOOLS.md. */
export const RecordedFactOutputSchema = z.object({
  fact_id: z.string(),
  statement: z.string(),
  valid_from: z.string().nullable(),
  valid_to: z.string().nullable(),
  outcome: z.enum(['recorded', 'restated']),
});

/** Translates a remembered fact into the tool output. */
export function toRecordedFactOutput(remembered: RememberedFact): z.infer<typeof RecordedFactOutputSchema> {
  return {
    fact_id: remembered.fact.id,
    statement: remembered.fact.statement,
    valid_from: remembered.fact.validFrom,
    valid_to: remembered.fact.validTo,
    outcome: remembered.outcome,
  };
}
