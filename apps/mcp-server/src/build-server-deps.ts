import { actOnFeedback, judgeConflicts } from '@factloom/maintenance';
import type { ServerDeps } from './create-factloom-server.ts';

/**
 * Builds the dependencies of the use cases behind the tools: the given parts, which the
 * caller reads from the environment, and the two functions of product 2 that the use cases
 * receive, the conflict judge for `remember` (FL-042), through the same LLM client, and the
 * feedback responder for `giveFeedback` (FL-060). It opens and starts nothing, so a test can
 * call it.
 */
export function buildServerDeps(parts: Omit<ServerDeps, 'judge' | 'feedbackResponder'>): ServerDeps {
  return {
    ...parts,
    judge: (input) => judgeConflicts({ llm: parts.llm }, input),
    feedbackResponder: actOnFeedback,
  };
}
