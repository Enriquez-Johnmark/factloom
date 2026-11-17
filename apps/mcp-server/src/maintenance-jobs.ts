import type { MaintenanceJob } from '@factloom/maintenance';
import type { ServerDeps } from './create-factloom-server.ts';

/**
 * The maintenance jobs, in the order they run, bound to the composition root's dependencies.
 * None exists yet: FL-050, FL-053, FL-054 and FL-073 each add one here. Every change a job
 * makes carries the trigger `maintenance`.
 */
export function buildMaintenanceJobs(
  _deps: Pick<ServerDeps, 'store' | 'namespace' | 'now' | 'newId'>,
): readonly MaintenanceJob[] {
  return [];
}
