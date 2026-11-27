import { type LlmClient, ok, type Result } from '@factloom/core';
import {
  type CodebaseReader,
  checkForSecrets,
  describeDependencyVersion,
  EXACT_NAME_ENTITY_TYPES,
  findSymbolNames,
  PATH_VALUED_PREDICATES,
  readDependencyVersion,
  recordCodebaseMap,
} from '@factloom/graph-rag';
import {
  archiveUnusedFacts,
  createLlmVerificationRung,
  createNameCheckRung,
  createSimilarityStage,
  createStructuredValueRung,
  findDuplicateEntities,
  type JobCounts,
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

/** Records the code base map (ADR 0024), its counts in the report's terms: what was skipped is undecided. */
async function runCodebaseMap(
  deps: Pick<ServerDeps, 'store' | 'embedder' | 'domain' | 'namespace' | 'now' | 'newId'> & {
    readonly repository: CodebaseReader;
  },
): Promise<Result<JobCounts>> {
  const counts = await recordCodebaseMap(deps, { namespace: deps.namespace });
  if (!counts.ok) return counts;
  const { recorded, moved, ended, failed, skipped } = counts.value;
  return ok({
    examined: counts.value.declarations,
    changed: recorded + moved + ended,
    flagged: 0,
    failed,
    undecided: skipped.ambiguous + skipped.secret + skipped.tooLarge + skipped.overLimit,
    flaggedItems: [],
  });
}

/**
 * The maintenance jobs, in the order they run, bound to the composition root's dependencies.
 * The archiving job runs last, after the jobs that repair and verify. Every change a job makes carries the trigger
 * `maintenance`. The anchor repair runs after verification, so that a file found missing in
 * this run is looked for in the same run.
 */
export function buildMaintenanceJobs(
  deps: Pick<ServerDeps, 'store' | 'embedder' | 'domain' | 'namespace' | 'now' | 'newId'> & {
    readonly repository: RepositoryReader & CodebaseReader;
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
    // After the repair, so a fact continued at a renamed file is already at its path (FL-084).
    { name: 'record_codebase_map', run: () => runCodebaseMap(deps) },
    {
      name: 'find_duplicate_entities',
      // The name stage of FL-053, then the similarity and LLM stages of FL-064, made anew for
      // each run because they count their calls. With no key, similar pairs are only reported.
      run: () =>
        findDuplicateEntities(
          {
            ...deps,
            // Symbols are named exactly as the code names them, so never duplicates (FL-084).
            exactEntityTypes: EXACT_NAME_ENTITY_TYPES,
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
