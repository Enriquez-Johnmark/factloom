// The prompt of the LLM verification rung (FL-051). The instructions are the same bytes on
// every call, so the provider can cache them; the fact and the file go in the input.
import { z } from 'zod';

/** What the model answers about one fact. */
export const VerificationAnswerSchema = z.strictObject({
  answer: z.enum(['supported', 'contradicted', 'unclear']),
});
export type VerificationAnswer = z.infer<typeof VerificationAnswerSchema>;

/** The stable part of the prompt. */
export const VERIFICATION_INSTRUCTIONS = `You check a fact that a memory holds about a code repository against one file of that repository, as the file is now.

The fact was learned from this file at an earlier commit. The file has changed since. Decide whether the file as it is now still supports the fact.

Answer one of:
- supported: the file states or plainly shows what the fact says.
- contradicted: the file states or plainly shows something that cannot be true together with the fact, such as another value for the same thing, or that the thing was removed.
- unclear: the file neither supports nor contradicts the fact, or you cannot tell.

Rules:
- Decide from the file text given, and nothing else. Do not guess what other files say.
- A fact that the file no longer mentions, without saying anything against it, is unclear, not contradicted.
- Answer contradicted only when the file says something that rules the fact out.`;

/** The part of the prompt that changes with every call. */
export function formatVerificationInput(input: {
  readonly statement: string;
  readonly path: string;
  readonly text: string;
}): string {
  return [`Fact: ${input.statement}`, `File: ${input.path}`, 'File text:', '<<<', input.text, '>>>'].join(
    '\n',
  );
}
