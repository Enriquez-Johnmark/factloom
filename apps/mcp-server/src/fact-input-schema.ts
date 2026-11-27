import { type Domain, ok, type Result } from '@kronomind/core';
import type { StructuredFactInput } from '@kronomind/graph-rag';
import { z } from 'zod';
import { readOptionalDate } from './read-optional-date.ts';

const DATE_FORMS =
  'A full UTC timestamp such as 2026-03-15T09:30:00.000Z, or a calendar date such as 2026-03-15.';

/**
 * The fields of one structured fact, as `record_fact` takes them. The entity types and
 * predicates are listed in the descriptions, generated from the domain so that they cannot
 * drift from it. The fields stay plain strings, so that an unknown value reaches the use case
 * and is answered with `invalid_input` and the allowed values.
 */
export function buildFactInputShape(domain: Domain) {
  const entityTypeField = z
    .string()
    .min(1)
    .describe(`The entity type, one of: ${domain.entityTypes.join(', ')}.`);
  const predicates = domain.predicates.map((predicate) => `${predicate.name} (${predicate.description})`);
  const entity = (role: string) =>
    z.object({
      type: entityTypeField,
      name: z.string().min(1).describe(`The name of the ${role}, such as shop-api or Vitest.`),
    });
  return {
    subject: entity('entity the fact is about').describe(
      'The entity the fact is about. Created if it does not exist.',
    ),
    predicate: z
      .string()
      .min(1)
      .describe(`The relation, one of: ${predicates.join('; ')}.`),
    object: z
      .union([
        entity('other entity'),
        z.object({
          value: z.string().min(1).describe('A literal value, such as a version, a port or a command.'),
        }),
      ])
      .describe('Another entity, as { type, name }, or a literal value, as { value }.'),
    statement: z.string().min(1).max(1000).describe('The fact as one sentence that can be read on its own.'),
    valid_from: z.string().optional().describe(`When the fact became true. Default: unknown. ${DATE_FORMS}`),
    valid_to: z
      .string()
      .optional()
      .describe(`When the fact stopped being true. Default: no known end. ${DATE_FORMS}`),
    confidence: z.number().min(0).max(1).optional().describe('How sure, from 0 to 1. Default: 1.'),
  };
}

type FactInputShape = ReturnType<typeof buildFactInputShape>;
export type FactInput = z.infer<z.ZodObject<FactInputShape>>;

/** Converts the tool's fact fields to the use case's shape: dates to timestamps, confidence to 1 when absent. */
export function readFactInput(fact: FactInput, fieldPrefix = ''): Result<StructuredFactInput> {
  const validFrom = readOptionalDate(`${fieldPrefix}valid_from`, fact.valid_from);
  if (!validFrom.ok) return validFrom;
  const validTo = readOptionalDate(`${fieldPrefix}valid_to`, fact.valid_to);
  if (!validTo.ok) return validTo;
  return ok({
    subject: fact.subject,
    predicate: fact.predicate,
    object:
      'value' in fact.object
        ? { kind: 'value', value: fact.object.value }
        : { kind: 'entity', type: fact.object.type, name: fact.object.name },
    statement: fact.statement,
    confidence: fact.confidence ?? 1,
    validFrom: validFrom.value,
    validTo: validTo.value,
  });
}
