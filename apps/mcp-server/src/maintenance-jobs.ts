import {
  findDuplicateEntities,
  type MaintenanceJob,
  NAME_STAGE,
  type RepositoryReader,
  repairMovedAnchors,
  verifyAnchoredFacts,
} from '@factloom/maintenance';
import type { ServerDeps } from './create-factloom-server.ts';

/**
 * The maintenance jobs, in the order they run, bound to the composition root's dependencies.
 * FL-073 adds one here. Every change a job makes carries the trigger
 * `maintenance`. The anchor repair runs after verification, so that a file found missing in
 * this run is looked for in the same run.
 */
export function buildMaintenanceJobs(
  deps: Pick<ServerDeps, 'store' | 'embedder' | 'domain' | 'namespace' | 'now' | 'newId'> & {
    readonly repository: RepositoryReader;
  },
): readonly MaintenanceJob[] {
  const { namespace } = deps;
  return [
    {
      name: 'verify_anchored_facts',
      // The rungs of FL-071 and FL-062 come from the software development domain.
      run: () => verifyAnchoredFacts({ ...deps, rungs: [] }, { namespace }),
    },
    { name: 'repair_moved_anchors', run: () => repairMovedAnchors(deps, { namespace }) },
    // FL-064 adds the embedding and LLM stages after the name stage.
    {
      name: 'find_duplicate_entities',
      run: () => findDuplicateEntities({ ...deps, stages: [NAME_STAGE] }, { namespace }),
    },
  ];
}
