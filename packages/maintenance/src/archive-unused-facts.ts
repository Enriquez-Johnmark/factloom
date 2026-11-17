import {
  archiveFacts,
  type Namespace,
  type OperationDeps,
  ok,
  type Result,
  toTimestamp,
} from '@factloom/core';
import type { JobCounts } from './run-maintenance.ts';

/** The most unused facts one run considers. The rest wait for the next run. */
const UNUSED_FACTS_PER_RUN = 500;

export type ArchiveUnusedFactsDeps = Pick<OperationDeps, 'store' | 'domain' | 'now' | 'newId'> & {
  /** How long a fact must go unrecalled to be archived, in milliseconds. */
  readonly archivePeriodMs: number;
};

/**
 * The archiving job: archives the current facts that were recorded more than a period ago and
 * not recalled within it, with the reason `unused`, one commit per fact. The store returns no
 * fact until usage tracking has run for a whole period. Under the domain's policy
 * `human_approval` it archives nothing and reports each fact it would have archived.
 */
export async function archiveUnusedFacts(
  deps: ArchiveUnusedFactsDeps,
  input: { readonly namespace: Namespace },
): Promise<Result<JobCounts>> {
  const now = deps.now();
  const unusedSince = toTimestamp(new Date(Date.parse(now) - deps.archivePeriodMs));
  const unused = await deps.store.listUnusedFacts({
    namespace: input.namespace,
    currentAt: now,
    unusedSince,
    limit: UNUSED_FACTS_PER_RUN,
  });
  if (!unused.ok) return unused;

  let changed = 0;
  let failed = 0;
  const flaggedItems: { id: string; reason: string }[] = [];
  for (const { fact } of unused.value) {
    if (deps.domain.correctionPolicy === 'human_approval') {
      flaggedItems.push({ id: fact.id, reason: 'unused' });
      continue;
    }
    const archived = await archiveFacts(deps, {
      namespace: input.namespace,
      trigger: 'maintenance',
      reasonCode: 'unused',
      factIds: [fact.id],
    });
    // A fact invalidated or archived meanwhile by another process was examined, not failed.
    if (archived.ok) changed += 1;
    else if (archived.error.code !== 'already_invalidated' && archived.error.code !== 'already_exists')
      failed += 1;
  }
  return ok({ examined: unused.value.length, changed, flagged: flaggedItems.length, failed, flaggedItems });
}
