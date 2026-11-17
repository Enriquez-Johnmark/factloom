import { type LlmClient, ok, type VerificationOutcome } from '@factloom/core';
import {
  formatVerificationInput,
  VERIFICATION_INSTRUCTIONS,
  VerificationAnswerSchema,
} from './verification-prompt.ts';
import { decided, type RungDecision, type VerificationRung } from './verify-anchored-facts.ts';

/** The largest file text, in characters, that is sent to the LLM. A larger one stays undecided. */
export const MAX_VERIFIED_TEXT_LENGTH = 50_000;

/** The most LLM calls one run makes. The facts beyond wait for the next run. */
export const MAX_LLM_CALLS_PER_RUN = 20;

const OUTCOME_OF_ANSWER: Readonly<Record<'supported' | 'contradicted' | 'unclear', VerificationOutcome>> = {
  supported: 'confirmed',
  contradicted: 'contradicted',
  unclear: 'inconclusive',
};

const byLlm = (outcome: VerificationOutcome, note: RungDecision['note'] = null): RungDecision => ({
  outcome,
  method: 'llm',
  successor: null,
  note,
});

/**
 * The last rung of the ladder, for a fact whose file changed and that no deterministic rung
 * decided: asks an LLM whether the file at HEAD still supports the fact. Create one for each
 * run, since it counts its calls. With no LLM client the fact stays `inconclusive` and is
 * counted as undecided; beyond `maxCalls` it is left for the next run. A file over the size
 * limit, or one that `containsSecret` matches, is not sent. A failed call is `inconclusive`
 * and counted as failed.
 */
export function createLlmVerificationRung(options: {
  readonly llm: LlmClient | null;
  readonly containsSecret: (text: string) => boolean;
  readonly maxCalls?: number;
}): VerificationRung {
  const maxCalls = options.maxCalls ?? MAX_LLM_CALLS_PER_RUN;
  let calls = 0;
  return {
    name: 'llm_verification',
    placement: 'after_content_changed',
    async check({ found, anchor, head, repository }) {
      if (options.llm === null) return ok({ ...decided('inconclusive'), note: 'undecided' });
      const text = await repository.readText(head, anchor.path);
      if (!text.ok) return text;
      if (text.value === null) return ok(null);
      // What leaves the machine: nothing too large, and nothing the secret check matches.
      if (text.value.length > MAX_VERIFIED_TEXT_LENGTH || options.containsSecret(text.value)) {
        return ok(decided('inconclusive'));
      }
      if (calls >= maxCalls) return ok({ ...decided('inconclusive'), note: 'deferred' });
      calls += 1;
      const answer = await options.llm.generateObject({
        task: 'verification',
        instructions: VERIFICATION_INSTRUCTIONS,
        input: formatVerificationInput({
          statement: found.fact.statement,
          path: anchor.path,
          text: text.value,
        }),
        schema: VerificationAnswerSchema,
      });
      if (!answer.ok) return ok(byLlm('inconclusive', 'failed'));
      return ok(byLlm(OUTCOME_OF_ANSWER[answer.value.answer]));
    },
  };
}
