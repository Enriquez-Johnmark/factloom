import type { Domain, FactWithSources } from '@kronomind/core';

/**
 * The software development domain: what Factloom can say about a repository. It starts with
 * the few entity types and predicates the timeline scenarios use; each further one is added
 * when a scenario or a real use needs it. A predicate is specific, such as
 * `uses_test_framework` and not `uses` with a role, because two facts conflict only when
 * they share a subject and a single-valued predicate.
 */
export const softwareDevelopmentDomain: Domain = {
  name: 'software_development',
  entityTypes: ['repository', 'dependency', 'convention', 'decision', 'symbol'],
  predicates: [
    {
      name: 'uses_test_framework',
      description:
        'A repository runs its tests with a dependency, for example the repository uses_test_framework Vitest.',
      cardinality: 'single',
    },
    {
      name: 'uses_package_manager',
      description:
        'A repository installs its dependencies with a dependency, for example the repository uses_package_manager pnpm.',
      cardinality: 'single',
    },
    {
      name: 'deploys_to',
      description:
        'A repository is deployed to a named target, given as a value, for example the repository deploys_to "Fly.io".',
      cardinality: 'single',
    },
    {
      name: 'listens_on_port',
      description:
        'A dependency accepts connections on a port, given as a value, for example PostgreSQL listens_on_port "5432".',
      cardinality: 'single',
    },
    {
      name: 'follows_convention',
      description:
        'A repository follows a convention, for example the repository follows_convention "conventional commits".',
      cardinality: 'multi',
    },
    {
      name: 'has_status',
      description:
        'A decision has a status, given as a value, for example the decision "use SQLite first" has_status "accepted".',
      cardinality: 'single',
    },
    {
      name: 'pins_version',
      description:
        'A dependency is pinned at a version, given as a value, for example the dependency vitest pins_version "5.1.0".',
      cardinality: 'single',
    },
    {
      name: 'described_as',
      description:
        'A symbol does what a value says, for example the function parseDate described_as "parses a calendar date".',
      cardinality: 'multi',
    },
    // The code base map of FL-082 (ADR 0023): the path is the value, so a rename is a succession.
    {
      name: 'defined_in',
      description:
        'A symbol is defined in a file, given as its path from the repository root, for example the function parseDate defined_in "lib/dates.js".',
      cardinality: 'single',
    },
  ],
  extractionInstructions: [
    'The texts come from work on software: notes, commit messages, conversations with a coding agent.',
    'A repository is a code base, named as its folder or package is named, such as shop-api.',
    'A dependency is a library, a tool, a framework, a database or a service that a repository uses, such as Vitest, pnpm or PostgreSQL.',
    'A convention is a way of working that a repository follows, such as conventional commits.',
    'A decision is a choice the team made, named by what was chosen, such as "use SQLite first".',
    'A symbol is a function, class, type or constant in the code, named exactly as the code names it, such as parseDate.',
    'A deployment target, a port, a status and a version are values, not entities. Write a port as its digits only, and a version as the text gives it.',
    'Keep a name as the text writes it; do not expand or shorten it.',
  ].join('\n'),
  correctionPolicy: 'automatic',
};

/**
 * The predicates whose value is a path from the repository root. When maintenance finds such a
 * file renamed, it ends the fact and continues it at the new path (FL-082).
 */
export const PATH_VALUED_PREDICATES: readonly string[] = ['defined_in'];

/**
 * The entity types whose names are exact identifiers: a symbol is named exactly as the code
 * names it, so two symbols with different names are never duplicates (FL-084).
 */
export const EXACT_NAME_ENTITY_TYPES: readonly string[] = ['symbol'];

/**
 * The names a fact needs in its anchored file, for the name check of the verification job
 * (FL-071): the name of each of its entities that is a symbol. Empty for a fact that names
 * no symbol, which the check then leaves to the next rung.
 */
export function findSymbolNames(found: FactWithSources): readonly string[] {
  return [found.subject, found.objectEntity].flatMap((entity) =>
    entity !== null && entity.type === 'symbol' ? [entity.name] : [],
  );
}
