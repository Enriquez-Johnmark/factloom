import type { LlmClient } from '@factloom/core';
import {
  checkForSecrets,
  describeDependencyVersion,
  findSymbolNames,
  PATH_VALUED_PREDICATES,
  readDependencyVersion,
} from '@factloom/graph-rag';
import {
  archiveUnusedFacts,
  createLlmVerificationRung,
  createNameCheckRung,
  createSimilarityStage,
  createStructuredValueRung,
  findDuplicateEntities,
  type MaintenanceJob,
  NAME_STAGE,
  type RepositoryReader,
  repairMovedAnchors,
  verifyAnchoredFacts,
} from '@factloom/maintenance';
import type { ServerDeps } from './create-factloom-server.ts';

/** Whether a text holds something the secret check of FL-022 matches. */
function containsSecret(text: string): boolean {
  return !checkForSecrets([{ name: 'file', value: text }]).ok;
}

/**
 * The rungs of one verification run, in order: from the software development domain, the
 * name check of FL-071 and the version check of FL-062, which reads a dependency's version
 * from its `package.json`; then the LLM rung of FL-051, last, made anew for each run because
 * it counts its calls.
 */
function buildVerificationRungs(llm: LlmClient | null) {
  return [
    createNameCheckRung(findSymbolNames),
    createStructuredValueRung({
      pins_version: {
        readValue: (found, text) => readDependencyVersion(text, found.subject.name),
        describeSuccessor: (found, version) => describeDependencyVersion(found.subject.name, version),
      },
    }),
    createLlmVerificationRung({ llm, containsSecret }),
  ];
}

/**
 * The maintenance jobs, in the order they run, bound to the composition root's dependencies.
 * The archiving job runs last, after the jobs that repair and verify. Every change a job makes carries the trigger
 * `maintenance`. The anchor repair runs after verification, so that a file found missing in
 * this run is looked for in the same run.
 */
export function buildMaintenanceJobs(
  deps: Pick<ServerDeps, 'store' | 'embedder' | 'domain' | 'namespace' | 'now' | 'newId'> & {
    readonly repository: RepositoryReader;
    /** How many days a fact must go unrecalled before it is archived. */
    readonly archiveAfterDays: number;
    /** The LLM for the last verification rung and for entity matching, or null when no key is set. */
    readonly llm: LlmClient | null;
  },
): readonly MaintenanceJob[] {
  const { namespace } = deps;
  return [
    {
      name: 'verify_anchored_facts',
      run: () => verifyAnchoredFacts({ ...deps, rungs: buildVerificationRungs(deps.llm) }, { namespace }),
    },
    // A map fact whose file was renamed is continued at the new path (FL-082).
    {
      name: 'repair_moved_anchors',
      run: () => repairMovedAnchors({ ...deps, pathPredicates: PATH_VALUED_PREDICATES }, { namespace }),
    },
    {
      name: 'find_duplicate_entities',
      // The name stage of FL-053, then the similarity and LLM stages of FL-064, made anew for
      // each run because they count their calls. With no key, similar pairs are only reported.
      run: () =>
        findDuplicateEntities(
          {
            ...deps,
            stages: [
              NAME_STAGE,
              createSimilarityStage({ store: deps.store, embedder: deps.embedder, llm: deps.llm, namespace }),
            ],
          },
          { namespace },
        ),
    },
    {
      name: 'archive_unused_facts',
      run: () =>
        archiveUnusedFacts(
          { ...deps, archivePeriodMs: deps.archiveAfterDays * 24 * 60 * 60 * 1000 },
          { namespace },
        ),
    },
  ];
}
