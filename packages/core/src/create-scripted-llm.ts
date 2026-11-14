import type { LlmClient } from './llm-client.ts';
import { err, ok } from './result.ts';

/**
 * Creates an `LlmClient` for tests that gives the listed responses in order. Each response
 * is parsed with the request's schema, as a real client's output would be; one that does not
 * match becomes `llm_failed`. A call beyond the list throws, so a test fails if the code
 * under test calls the LLM more often than expected. With no responses, any call throws.
 */
export function createScriptedLlm(responses: readonly unknown[]): LlmClient {
  let calls = 0;
  return {
    generateObject(request) {
      if (calls >= responses.length) {
        throw new Error(
          `The scripted LLM was called ${calls + 1} times for the task "${request.task}", but only ${responses.length} responses were given.`,
        );
      }
      const response = responses[calls];
      calls += 1;
      const parsed = request.schema.safeParse(response);
      if (parsed.success) return Promise.resolve(ok(parsed.data));
      return Promise.resolve(
        err('llm_failed', `The LLM response did not match the schema for the task "${request.task}".`, {
          cause: parsed.error,
        }),
      );
    },
  };
}
