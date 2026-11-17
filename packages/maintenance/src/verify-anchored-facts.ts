import {
  type FactWithSources,
  listStaleFacts,
  type OperationDeps,
  ok,
  type Result,
  recordVerification,
  toTimestamp,
  type VerificationOutcome,
} from '@factloom/core';
import { type Anchor, findAnchor } from './find-anchor.ts';
import type { RepositoryReader } from './repository-reader.ts';
import type { JobCounts } from './run-maintenance.ts';

/** The age after which a fact is stale and due for verification: seven days. */
export const VERIFICATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** The most stale facts one run considers. The rest wait for the next run. */
const STALE_FACTS_PER_RUN = 500;

/**
 * A rung that a domain adds to the ladder. `before_content_check` runs once the path is known
 * to exist; `after_content_changed` runs when the file differs from the anchor's commit. It
 * returns an outcome to decide, or null to leave the decision to the rungs after it.
 */
export type VerificationRung = {
  readonly name: string;
  readonly placement: 'before_content_check' | 'after_content_changed';
  readonly check: (input: {
    readonly found: FactWithSources;
    readonly anchor: Anchor;
    readonly head: string;
    readonly repository: RepositoryReader;
  }) => Promise<Result<VerificationOutcome | null>>;
};

export type VerifyAnchoredFactsDeps = Pick<OperationDeps, 'store' | 'now' | 'newId'> & {
  readonly repository: RepositoryReader;
  readonly rungs: readonly VerificationRung[];
};

/** Runs the domain's rungs of one placement in order, and returns the first decision. */
async function runRungs(
  rungs: readonly VerificationRung[],
  placement: VerificationRung['placement'],
  input: Parameters<VerificationRung['check']>[0],
): Promise<Result<VerificationOutcome | null>> {
  for (const rung of rungs) {
    if (rung.placement !== placement) continue;
    const decided = await rung.check(input);
    if (!decided.ok || decided.value !== null) return decided;
  }
  return ok(null);
}

/**
 * The outcome of the ladder for one anchored fact, or null when the fact is out of scope
 * because its commit is not on this branch. Rung 1: the commit is an ancestor of `HEAD`.
 * Rung 2: the path exists at `HEAD`, else `source_missing`. Then the domain's rungs placed
 * before the content check. Rung 3: the content is the same as at the anchor's commit, so
 * `confirmed`; if not, the domain's rungs placed after it, else `inconclusive`.
 */
async function climbLadder(
  deps: VerifyAnchoredFactsDeps,
  found: FactWithSources,
  anchor: Anchor,
  head: string,
): Promise<Result<VerificationOutcome | null>> {
  const { repository } = deps;
  const onBranch = await repository.isAncestorOfHead(anchor.commit);
  if (!onBranch.ok || !onBranch.value) return onBranch.ok ? ok(null) : onBranch;
  const exists = await repository.pathExists(head, anchor.path);
  if (!exists.ok) return exists;
  if (!exists.value) return ok('source_missing');
  const input = { found, anchor, head, repository };
  const before = await runRungs(deps.rungs, 'before_content_check', input);
  if (!before.ok || before.value !== null) return before;
  const [then, now] = await Promise.all([
    repository.readContentId(anchor.commit, anchor.path),
    repository.readContentId(head, anchor.path),
  ]);
  if (!then.ok) return then;
  if (!now.ok) return now;
  if (then.value !== null && then.value === now.value) return ok('confirmed');
  const after = await runRungs(deps.rungs, 'after_content_changed', input);
  if (!after.ok || after.value !== null) return after;
  return ok('inconclusive');
}

/**
 * The verification job: checks the stale facts of a namespace against the repository their
 * sources point at, and records each outcome with method `deterministic`. It changes no fact.
 * A fact whose file is gone is flagged for a person and stays live. A fact with no anchor, or
 * from a commit that is not on this branch, is examined and nothing is recorded. If the
 * repository cannot be read, the job fails before recording anything.
 */
export async function verifyAnchoredFacts(
  deps: VerifyAnchoredFactsDeps,
  input: { readonly namespace: string },
): Promise<Result<JobCounts>> {
  const head = await deps.repository.readHead();
  if (!head.ok) return head;
  const notVerifiedSince = toTimestamp(new Date(Date.parse(deps.now()) - VERIFICATION_INTERVAL_MS));
  const stale = await listStaleFacts(deps, {
    namespace: input.namespace,
    notVerifiedSince,
    confidenceBelow: null,
    limit: STALE_FACTS_PER_RUN,
  });
  if (!stale.ok) return stale;

  let failed = 0;
  const flaggedItems: { id: string; reason: string }[] = [];
  for (const found of stale.value) {
    const anchor = findAnchor(found.sources);
    if (anchor === null) continue;
    const outcome = await climbLadder(deps, found, anchor, head.value);
    if (!outcome.ok) return outcome;
    if (outcome.value === null) continue;
    const recorded = await recordVerification(deps, {
      namespace: input.namespace,
      trigger: 'maintenance',
      reasonCode: 'verification_due',
      factId: found.fact.id,
      outcome: outcome.value,
      method: 'deterministic',
    });
    // A fact invalidated meanwhile by another process was examined, not failed.
    if (!recorded.ok) {
      if (recorded.error.code !== 'already_invalidated') failed += 1;
      continue;
    }
    if (outcome.value === 'source_missing')
      flaggedItems.push({ id: found.fact.id, reason: 'source_missing' });
  }
  return ok({
    examined: stale.value.length,
    changed: 0,
    flagged: flaggedItems.length,
    failed,
    flaggedItems,
  });
}
