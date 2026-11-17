// The prompt of the LLM stage of duplicate entity detection (FL-064). The instructions are the
// same bytes on every call, so the provider can cache them; the pair goes in the input.
import { z } from 'zod';

/** What the model answers about one pair of entities. */
export const EntityMatchAnswerSchema = z.strictObject({
  answer: z.enum(['same', 'different', 'unsure']),
});
export type EntityMatchAnswer = z.infer<typeof EntityMatchAnswerSchema>;

/** The stable part of the prompt. */
export const ENTITY_MATCH_INSTRUCTIONS = `You decide whether two entities in a memory about software work are the same thing.

Each entity has a name, a type, and some facts recorded about it. The two come from the same repository's memory. They may be the same thing written two ways, such as a short name and its full name, or two different things with similar names.

Answer one of:
- same: the two names refer to one and the same thing, for example "Postgres" and "PostgreSQL".
- different: they are two different things, for example two versions of a product that the facts treat separately, a library and a tool with similar names, or two things that happen to share a name.
- unsure: the names and facts given do not settle it.

Rules:
- Decide from the names, the types and the facts given, and nothing else.
- Merging two different things is worse than keeping one thing twice. When in doubt, answer unsure.
- Two different types can still be one thing, when the facts show it.`;

/** One entity as the prompt shows it. */
export type MatchedEntity = {
  readonly name: string;
  readonly type: string;
  readonly facts: readonly string[];
};

function describe(label: string, entity: MatchedEntity): string {
  const facts = entity.facts.length === 0 ? ['(no facts)'] : entity.facts.map((fact) => `- ${fact}`);
  return [`${label}: ${entity.name}`, `Type: ${entity.type}`, 'Facts:', ...facts].join('\n');
}

/** The part of the prompt that changes with every call. */
export function formatEntityMatchInput(first: MatchedEntity, second: MatchedEntity): string {
  return [describe('Entity A', first), '', describe('Entity B', second)].join('\n');
}
