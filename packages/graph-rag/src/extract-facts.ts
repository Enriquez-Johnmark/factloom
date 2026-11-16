// Turns a text into structured facts with one LLM call. The schema lists the domain's entity
// types and predicates as closed sets, and stays inside the structured output limits of
// docs/research/technical/llm-anthropic.md, section 3: no recursion, every object closed, no
// optional field (an absent value is null), and at most 16 union-typed or nullable fields.
import {
  type Domain,
  type LlmClient,
  type OperationDeps,
  ok,
  parseDateInput,
  type Result,
  type Timestamp,
} from '@factloom/core';
import { z } from 'zod';
import type { StructuredFactInput } from './structured-fact-input.ts';

export type ExtractFactsDeps = Pick<OperationDeps, 'domain' | 'now'> & { readonly llm: LlmClient };

/** One of a closed set of names. The domain's lists are never empty for predicates in use. */
function oneOf(names: readonly string[]) {
  const [first, ...rest] = names;
  if (first === undefined) throw new Error('A closed set of names needs at least one name.');
  return z.enum([first, ...rest]);
}

/** A full UTC timestamp or a calendar date, as `parseDateInput` reads it. */
const DateTextSchema = z
  .string()
  .describe('A calendar date such as 2026-03-15, or a full UTC timestamp such as 2026-03-15T09:30:00.000Z.')
  .refine((text) => parseDateInput(text).ok, { error: 'Expected a calendar date or a full UTC timestamp.' });

/**
 * The extraction schema of a domain. Only names from the domain appear in it, never text
 * from memory, because the provider caches a schema for up to 24 hours (research, section 3).
 */
export function buildExtractionSchema(domain: Domain) {
  const entityType = oneOf(domain.entityTypes);
  return z.strictObject({
    facts: z.array(
      z.strictObject({
        subject: z.strictObject({ type: entityType, name: z.string().min(1) }),
        predicate: oneOf(domain.predicates.map((predicate) => predicate.name)),
        object: z.union([
          z.strictObject({ type: entityType, name: z.string().min(1) }),
          z.strictObject({ value: z.string().min(1) }),
        ]),
        statement: z.string().min(1).describe('One sentence that can be read on its own.'),
        confidence: z.number().min(0).max(1),
        valid_from: DateTextSchema.nullable(),
        valid_to: DateTextSchema.nullable(),
      }),
    ),
  });
}
type Extraction = z.infer<ReturnType<typeof buildExtractionSchema>>;
type ExtractedFact = Extraction['facts'][number];

/** The rules every domain shares. The domain's own guidance and vocabulary follow them. */
const EXTRACTION_RULES = `You extract facts from a text for a memory that records when each fact was true.

Rules:
- Return only facts the text states as true. A plan, an intention, a proposal, a question or a hypothetical is not a fact: return nothing for it.
- A text with nothing worth remembering gives an empty list.
- Use only the entity types and predicates listed below. Leave out a fact that none of them fits.
- The object of a fact is an entity, with a type and a name, or a value such as a version, a port, a command or a target.
- The statement is one sentence that can be read on its own, without the text.
- confidence is from 0 to 1: how sure the text makes you that the fact is true.
- valid_from is the date the fact became true, and valid_to the date it stopped. Give a date only when the text states it or a relative date in the text fixes it; otherwise give null. Never give a date the text does not support. Words such as "now" or "currently" fix no date, and neither does the moment the text was written, such as the time of a commit.
- Resolve a relative date, such as "yesterday" or "three days ago", against the reference time given with the text.
- When the text gives only a month or a year, use the first day of that period.
- When the text says that something replaced something else on a date it states or fixes, also return the replaced fact, with valid_to that date. When it gives no date for the change, return only the new fact.
- Write dates as calendar dates, such as 2026-03-15, or as full UTC timestamps.`;

/**
 * The stable part of the prompt for a domain: the shared rules, the domain's guidance, and its
 * entity types and predicates in the order the domain lists them. It is the same bytes on
 * every call, so the provider can cache it.
 */
export function buildExtractionInstructions(domain: Domain): string {
  const predicates = domain.predicates.map(
    (predicate) =>
      `- ${predicate.name} (${predicate.cardinality === 'single' ? 'one value at a time' : 'several values at once'}): ${predicate.description}`,
  );
  return [
    EXTRACTION_RULES,
    domain.extractionInstructions,
    `Entity types:\n${domain.entityTypes.map((type) => `- ${type}`).join('\n')}`,
    `Predicates:\n${predicates.join('\n')}`,
  ].join('\n\n');
}

/** A date the schema has already checked, as a timestamp. */
function toTimestamp(text: string | null): Timestamp | null {
  if (text === null) return null;
  const parsed = parseDateInput(text);
  if (!parsed.ok) throw new Error(`The schema let through a date it should refuse: "${text}".`);
  return parsed.value;
}

function toStructuredFact(fact: ExtractedFact): StructuredFactInput {
  return {
    subject: fact.subject,
    predicate: fact.predicate,
    object:
      'value' in fact.object
        ? { kind: 'value', value: fact.object.value }
        : { kind: 'entity', type: fact.object.type, name: fact.object.name },
    statement: fact.statement,
    confidence: fact.confidence,
    validFrom: toTimestamp(fact.valid_from),
    validTo: toTimestamp(fact.valid_to),
  };
}

/**
 * Extracts the facts a text states, with one LLM call, in the shape `recordStructuredFacts`
 * takes. The reference time for relative dates is `now`, sent in the input with the text.
 * A response outside the schema, or a failed call, is `llm_failed`.
 */
export async function extractFacts(
  deps: ExtractFactsDeps,
  text: string,
): Promise<Result<readonly StructuredFactInput[]>> {
  const extracted = await deps.llm.generateObject({
    task: 'extraction',
    instructions: buildExtractionInstructions(deps.domain),
    input: `Reference time: ${deps.now()}\n\nText:\n${text}`,
    schema: buildExtractionSchema(deps.domain),
  });
  if (!extracted.ok) return extracted;
  return ok(extracted.value.facts.map(toStructuredFact));
}
