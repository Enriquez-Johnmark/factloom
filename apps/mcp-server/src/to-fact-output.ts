import type { FactWithSources } from '@kronomind/core';
import { z } from 'zod';

/** A fact as the tools return it, in the field names of MCP-TOOLS.md. */
export const FactOutputSchema = z.object({
  fact_id: z.string(),
  statement: z.string(),
  subject: z.object({ type: z.string(), name: z.string() }),
  predicate: z.string(),
  object: z.union([z.object({ type: z.string(), name: z.string() }), z.object({ value: z.string() })]),
  confidence: z.number(),
  valid_from: z.string().nullable(),
  valid_to: z.string().nullable(),
  recorded_at: z.string(),
  invalidated_at: z.string().nullable(),
  superseded_by_fact_id: z.string().nullable(),
  sources: z.array(
    z.object({
      kind: z.string(),
      locator: z.string().nullable(),
      version: z.string().nullable(),
      observed_at: z.string(),
    }),
  ),
});
export type FactOutput = z.infer<typeof FactOutputSchema>;

/**
 * Translates a fact with its sources into the tool output. `recorded_at` is the fact's
 * `createdAt`. A source is given without its content, which can be long and is not needed to
 * cite it.
 */
export function toFactOutput(found: FactWithSources): FactOutput {
  const { fact, subject, objectEntity, sources } = found;
  return {
    fact_id: fact.id,
    statement: fact.statement,
    subject: { type: subject.type, name: subject.name },
    predicate: fact.predicate,
    object:
      fact.object.kind === 'value'
        ? { value: fact.object.value }
        : // A store always reads the object entity with the fact; its identifier stands in if it did not.
          { type: objectEntity?.type ?? 'entity', name: objectEntity?.name ?? fact.object.entityId },
    confidence: fact.confidence,
    valid_from: fact.validFrom,
    valid_to: fact.validTo,
    recorded_at: fact.createdAt,
    invalidated_at: fact.invalidatedAt,
    superseded_by_fact_id: fact.supersededByFactId,
    sources: sources.map((source) => ({
      kind: source.kind,
      locator: source.locator,
      version: source.version,
      observed_at: source.observedAt,
    })),
  };
}
