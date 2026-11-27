// The prompt of the conflict judge. The instructions are the same bytes on every call, so the
// provider can cache them; the source text, the new fact and the candidates go in the input.
// The candidates are numbered from 1, and the answer names them by number, so that the model
// never copies a fact or an identifier back (contradiction detection research, "Cost control").
import type { ConflictJudgeInput, FactWithSources, Timestamp } from '@kronomind/core';
import { z } from 'zod';

/** The four verdicts of decision D-12, as the model writes them. */
const VERDICT_NAMES = ['duplicate', 'succession', 'correction', 'unrelated'] as const;

/** What the model answers: one verdict for each stored fact, named by its number. */
export const JudgeAnswerSchema = z.strictObject({
  verdicts: z.array(
    z.strictObject({
      stored_fact: z.number().int().describe('The number of the stored fact, as listed in the input.'),
      verdict: z.enum(VERDICT_NAMES),
    }),
  ),
});
export type JudgeAnswer = z.infer<typeof JudgeAnswerSchema>;

/** The stable part of the prompt. */
export const JUDGE_INSTRUCTIONS = `You compare a new fact with stored facts for a memory that records when each fact was true.

Each stored fact has the same subject and predicate as the new fact, and a different value. The predicate holds one value at a time, and the valid periods overlap, so the facts cannot both be true as they stand. The new fact comes from the source text given with it.

For each stored fact, give one verdict:
- duplicate: the two values name the same thing in different words, such as "Postgres" and "PostgreSQL", or "port 5432" and "5432".
- succession: the text says the value changed. The stored value was true, and the new value took its place.
- correction: the text says the stored fact was never true, for example because it was a mistake, a typo, or described something else.
- unrelated: none of the above. The text does not say the value changed and does not say the stored fact was wrong.

Rules:
- Answer correction only when the text says the stored fact was never true. A different value alone is not a correction, and neither is a text that says the old value is no longer used.
- Answer succession only when the text says the value changed, with words such as "switched", "moved", "migrated", "replaced" or "no longer".
- When the text only states the new value, without saying that anything changed or was wrong, answer unrelated, even though the two facts disagree.
- Decide from the source text and the facts given. Do not work out dates: they are decided elsewhere.
- Give exactly one verdict for each stored fact, and name it by its number.`;

function describeDate(timestamp: Timestamp | null): string {
  return timestamp ?? 'unknown';
}

/** The value a stored fact relates its subject to, as a name or a literal. */
function describeStoredObject(candidate: FactWithSources): string {
  const { object } = candidate.fact;
  if (object.kind === 'value') return object.value;
  return candidate.objectEntity?.name ?? object.entityId;
}

/** The value the new fact relates its subject to, as a name or a literal. */
function describeNewObject(input: ConflictJudgeInput): string {
  const { object } = input.fact;
  if (object.kind === 'value') return object.value;
  return input.objectEntityName ?? object.entityId;
}

/** The part of the prompt that changes with every call: the text, the new fact, and the numbered candidates. */
export function formatJudgeInput(input: ConflictJudgeInput, asked: readonly FactWithSources[]): string {
  const subject = asked[0]?.subject.name ?? input.fact.subjectEntityId;
  const stored = asked.map((candidate, index) =>
    [
      `${index + 1}. Statement: ${candidate.fact.statement}`,
      `   Value: ${describeStoredObject(candidate)}`,
      `   Valid from: ${describeDate(candidate.fact.validFrom)}`,
      `   Valid to: ${describeDate(candidate.fact.validTo)}`,
      `   Recorded: ${candidate.fact.createdAt}`,
    ].join('\n'),
  );
  return [
    `Subject: ${subject}`,
    `Predicate: ${input.fact.predicate}`,
    `Source text, observed ${input.observedAt}:\n${input.sourceText}`,
    [
      'New fact:',
      `   Statement: ${input.fact.statement}`,
      `   Value: ${describeNewObject(input)}`,
      `   Valid from: ${describeDate(input.fact.validFrom)}`,
      `   Valid to: ${describeDate(input.fact.validTo)}`,
    ].join('\n'),
    `Stored facts:\n${stored.join('\n')}`,
  ].join('\n\n');
}
