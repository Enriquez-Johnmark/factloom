import {
  adjustConfidence,
  endFact,
  type FactWithSources,
  listStaleFacts,
  type OperationDeps,
  ok,
  type Result,
  recordVerification,
  type Timestamp,
  toTimestamp,
  type VerificationMethod,
  type VerificationOutcome,
} from '@factloom/core';
import { type Anchor, findAnchor } from './find-anchor.ts';
import type { RepositoryReader } from './repository-reader.ts';
import type { JobCounts } from './run-maintenance.ts';

/** The age after which a fact is stale and due for verification: seven days. */
export const VERIFICATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** The most stale facts one run considers. The rest wait for the next run. */
const STALE_FACTS_PER_RUN = 500;

/** What a rung found for a fact that its file contradicts: the value now, and when it changed. */
export type Successor = {
  readonly value: string;
  readonly statement: string;
  /** The committer time of the first commit after the anchor in which the value differs. */
  readonly changedAt: Timestamp;
};

/**
 * A rung's decision: the outcome, how it was reached, and for a value that changed, what
 * replaces the fact. `note` says what else the run reports: `failed` for a check that could
 * not be made, recorded as `inconclusive`; `undecided` for a check that cannot run here, such
 * as an LLM with no key, also recorded; `deferred` for a fact left for the next run, recorded
 * not at all.
 */
export type RungDecision = {
  readonly outcome: VerificationOutcome;
  readonly method: VerificationMethod;
  readonly successor: Successor | null;
  readonly note: 'failed' | 'undecided' | 'deferred' | null;
};

/** How much an LLM verdict of `contradicted` lowers a fact's confidence (FL-051). */
export const CONFIDENCE_STEP = 0.2;

/**
 * A rung that a domain adds to the ladder. `before_content_check` runs once the path is known
 * to exist; `after_content_changed` runs when the file differs from the anchor's commit. It
 * returns a decision, or null to leave the decision to the rungs after it.
 */
export type VerificationRung = {
  readonly name: string;
  readonly placement: 'before_content_check' | 'after_content_changed';
  readonly check: (input: {
    readonly found: FactWithSources;
    readonly anchor: Anchor;
    readonly head: string;
    readonly repository: RepositoryReader;
  }) => Promise<Result<RungDecision | null>>;
};

export type VerifyAnchoredFactsDeps = OperationDeps & {
  readonly repository: RepositoryReader;
  readonly rungs: readonly VerificationRung[];
};

/** A decision with no successor. */
export const decided = (outcome: VerificationOutcome): RungDecision => ({
  outcome,
  method: 'deterministic',
  successor: null,
  note: null,
});

/** Runs the domain's rungs of one placement in order, and returns the first decision. */
async function runRungs(
  rungs: readonly VerificationRung[],
  placement: VerificationRung['placement'],
  input: Parameters<VerificationRung['check']>[0],
): Promise<Result<RungDecision | null>> {
  for (const rung of rungs) {
    if (rung.placement !== placement) continue;
    const decision = await rung.check(input);
    if (!decision.ok || decision.value !== null) return decision;
  }
  return ok(null);
}

/**
 * The decision of the ladder for one anchored fact, or null when the fact is out of scope
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
): Promise<Result<RungDecision | null>> {
  const { repository } = deps;
  const onBranch = await repository.isAncestorOfHead(anchor.commit);
  if (!onBranch.ok || !onBranch.value) return onBranch.ok ? ok(null) : onBranch;
  const exists = await repository.pathExists(head, anchor.path);
  if (!exists.ok) return exists;
  if (!exists.value) return ok(decided('source_missing'));
  const input = { found, anchor, head, repository };
  const before = await runRungs(deps.rungs, 'before_content_check', input);
  if (!before.ok || before.value !== null) return before;
  const [then, now] = await Promise.all([
    repository.readContentId(anchor.commit, anchor.path),
    repository.readContentId(head, anchor.path),
  ]);
  if (!then.ok) return then;
  if (!now.ok) return now;
  if (then.value !== null && then.value === now.value) return ok(decided('confirmed'));
  const after = await runRungs(deps.rungs, 'after_content_changed', input);
  if (!after.ok || after.value !== null) return after;
  return ok(decided('inconclusive'));
}

/**
 * Ends a contradicted fact whose value changed, with the new value as its successor and the
 * file at `HEAD` as the source. Returns whether a change was made; a fact that memory changed
 * meanwhile (`conflict`, `already_invalidated`) was only examined.
 */
async function endChangedFact(
  deps: VerifyAnchoredFactsDeps,
  found: FactWithSources,
  change: { readonly anchor: Anchor; readonly head: string; readonly successor: Successor },
): Promise<Result<boolean>> {
  const { fact } = found;
  const ended = await endFact(deps, {
    namespace: fact.namespace,
    trigger: 'maintenance',
    reasonCode: 'source_changed',
    factId: fact.id,
    validTo: change.successor.changedAt,
    source: {
      kind: 'file',
      locator: change.anchor.path,
      version: change.head,
      content: null,
      observedAt: deps.now(),
    },
    successor: {
      fact: {
        subjectEntityId: fact.subjectEntityId,
        predicate: fact.predicate,
        object: { kind: 'value', value: change.successor.value },
        statement: change.successor.statement,
        confidence: fact.confidence,
        validFrom: null,
        validTo: null,
      },
      newEntities: [],
    },
  });
  if (ended.ok) return ok(true);
  if (ended.error.code === 'conflict' || ended.error.code === 'already_invalidated') return ok(false);
  return ended;
}

/**
 * The verification job: checks the stale facts of a namespace against the repository their
 * sources point at, and records each outcome with method `deterministic`, before any change.
 * A contradicted fact whose value a rung read anew is ended, with the new value as successor,
 * under policy `automatic`. Any other contradicted fact, and one whose file is gone, is flagged
 * for a person and stays live. A fact with no anchor, or from a commit that is not on this
 * branch, is examined and nothing is recorded. If the repository cannot be read, the job fails
 * before recording anything.
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

  let changed = 0;
  let failed = 0;
  let undecided = 0;
  const flaggedItems: { id: string; reason: string }[] = [];
  for (const found of stale.value) {
    const anchor = findAnchor(found.sources);
    if (anchor === null) continue;
    const decision = await climbLadder(deps, found, anchor, head.value);
    if (!decision.ok) return decision;
    if (decision.value === null) continue;
    const { outcome, method, successor, note } = decision.value;
    if (note === 'deferred') {
      undecided += 1;
      continue;
    }
    if (note === 'undecided') undecided += 1;
    const recorded = await recordVerification(deps, {
      namespace: input.namespace,
      trigger: 'maintenance',
      reasonCode: 'verification_due',
      factId: found.fact.id,
      outcome,
      method,
    });
    // A fact invalidated meanwhile by another process was examined, not failed.
    if (!recorded.ok) {
      if (recorded.error.code !== 'already_invalidated') failed += 1;
      continue;
    }
    if (note === 'failed') failed += 1;
    // An LLM verdict changes no fact: it lowers the confidence, and a person looks.
    if (outcome === 'contradicted' && method === 'llm') {
      const lowered = await adjustConfidence(deps, {
        namespace: input.namespace,
        trigger: 'maintenance',
        reasonCode: 'verification_failed',
        factId: found.fact.id,
        confidence: Math.max(0, found.fact.confidence - CONFIDENCE_STEP),
      });
      if (!lowered.ok && lowered.error.code !== 'already_invalidated') failed += 1;
      flaggedItems.push({ id: found.fact.id, reason: 'contradicted' });
      continue;
    }
    if (outcome === 'contradicted' && successor !== null && deps.domain.correctionPolicy === 'automatic') {
      const ended = await endChangedFact(deps, found, { anchor, head: head.value, successor });
      if (!ended.ok) failed += 1;
      else if (ended.value) changed += 1;
      continue;
    }
    // A file gone or a fact the file contradicts is left for a person.
    if (outcome === 'source_missing' || outcome === 'contradicted') {
      flaggedItems.push({ id: found.fact.id, reason: outcome });
    }
  }
  return ok({
    examined: stale.value.length,
    changed,
    flagged: flaggedItems.length,
    failed,
    undecided,
    flaggedItems,
  });
}
