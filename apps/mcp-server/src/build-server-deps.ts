import { actOnFeedback, judgeConflicts } from '@kronomind/maintenance';
import type { ServerDeps } from './create-factloom-server.ts';

/**
 * The repository a namespace is about: `shop-api` for `repo:shop-api`, and none for a namespace
 * of another form (FL-078). `remember` reads "we" in a text as that repository.
 */
export function findRepositoryName(namespace: string): string | null {
  const name = namespace.startsWith('repo:') ? namespace.slice('repo:'.length).trim() : '';
  return name === '' ? null : name;
}

/**
 * Builds the dependencies of the use cases behind the tools: the given parts, which the
 * caller reads from the environment, and the two functions of product 2 that the use cases
 * receive, the conflict judge for `remember` (FL-042), through the same LLM client, and the
 * feedback responder for `giveFeedback` (FL-060), and the repository name of a `repo:` namespace
 * for `remember` (FL-078). It opens and starts nothing, so a test can
 * call it.
 */
export function buildServerDeps(
  parts: Omit<ServerDeps, 'judge' | 'feedbackResponder' | 'repositoryName'>,
): ServerDeps {
  const repositoryName = findRepositoryName(parts.namespace);
  return {
    ...parts,
    ...(repositoryName === null ? {} : { repositoryName }),
    judge: (input) => judgeConflicts({ llm: parts.llm }, input),
    feedbackResponder: actOnFeedback,
  };
}
