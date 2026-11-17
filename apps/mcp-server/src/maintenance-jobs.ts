import { type MaintenanceJob, type RepositoryReader, verifyAnchoredFacts } from '@factloom/maintenance';
import type { ServerDeps } from './create-factloom-server.ts';

/**
 * The maintenance jobs, in the order they run, bound to the composition root's dependencies.
 * FL-053, FL-054 and FL-073 each add one here. Every change a job makes carries the trigger
 * `maintenance`.
 */
export function buildMaintenanceJobs(
  deps: Pick<ServerDeps, 'store' | 'namespace' | 'now' | 'newId'> & { readonly repository: RepositoryReader },
): readonly MaintenanceJob[] {
  return [
    {
      name: 'verify_anchored_facts',
      // The rungs of FL-071 and FL-062 come from the software development domain.
      run: () => verifyAnchoredFacts({ ...deps, rungs: [] }, { namespace: deps.namespace }),
    },
  ];
}
