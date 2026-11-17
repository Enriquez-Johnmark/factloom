import { describeDependencyVersion, findSymbolNames, readDependencyVersion } from '@factloom/graph-rag';
import {
  archiveUnusedFacts,
  createNameCheckRung,
  createStructuredValueRung,
  findDuplicateEntities,
  type MaintenanceJob,
  NAME_STAGE,
  type RepositoryReader,
  repairMovedAnchors,
  verifyAnchoredFacts,
} from '@factloom/maintenance';
import type { ServerDeps } from './create-factloom-server.ts';

/**
 * The rungs of the software development domain: the name check of FL-071, and the version
 * check of FL-062, which reads a dependency's version from its `package.json`.
 */
const VERIFICATION_RUNGS = [
  createNameCheckRung(findSymbolNames),
  createStructuredValueRung({
    pins_version: {
      readValue: (found, text) => readDependencyVersion(text, found.subject.name),
      describeSuccessor: (found, version) => describeDependencyVersion(found.subject.name, version),
    },
  }),
];

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
  },
): readonly MaintenanceJob[] {
  const { namespace } = deps;
  return [
    {
      name: 'verify_anchored_facts',
      run: () => verifyAnchoredFacts({ ...deps, rungs: VERIFICATION_RUNGS }, { namespace }),
    },
    { name: 'repair_moved_anchors', run: () => repairMovedAnchors(deps, { namespace }) },
    // FL-064 adds the embedding and LLM stages after the name stage.
    {
      name: 'find_duplicate_entities',
      run: () => findDuplicateEntities({ ...deps, stages: [NAME_STAGE] }, { namespace }),
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
