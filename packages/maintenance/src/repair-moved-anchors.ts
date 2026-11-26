import {
  endFact,
  type FactWithSources,
  type Namespace,
  type OperationDeps,
  ok,
  type Result,
  recordFacts,
  recordVerification,
} from '@factloom/core';
import { findAnchor } from './find-anchor.ts';
import type { RepositoryReader } from './repository-reader.ts';
import type { JobCounts } from './run-maintenance.ts';

/** A file renamed more often than this between two runs is left flagged. */
const MAX_RENAMES_FOLLOWED = 10;

/** The most orphaned facts one run considers. */
const ORPHANED_FACTS_PER_RUN = 500;

export type RepairMovedAnchorsDeps = OperationDeps & {
  readonly repository: RepositoryReader;
  /**
   * The domain's predicates whose value is a path from the repository root, such as
   * `defined_in` (FL-082). A fact under one of them whose value is the moved path is ended and
   * continued at the new path, not only given a source there. None by default.
   */
  readonly pathPredicates?: readonly string[];
};

/** Follows renames from a path to one that exists at HEAD, or null when git shows none. */
async function followRenames(
  repository: RepositoryReader,
  head: string,
  path: string,
): Promise<Result<string | null>> {
  let current = path;
  for (let step = 0; step < MAX_RENAMES_FOLLOWED; step += 1) {
    const next = await repository.findRenamedPath(current);
    if (!next.ok || next.value === null) return next;
    current = next.value;
    const exists = await repository.pathExists(head, current);
    if (!exists.ok) return exists;
    if (exists.value) return ok(current);
  }
  return ok(null);
}

type Move = {
  readonly from: { readonly path: string; readonly commit: string };
  readonly to: string;
  readonly head: string;
};

/** Records whether the moved file is unchanged since the anchor's commit, for a fact. */
async function verifyMoved(
  deps: RepairMovedAnchorsDeps,
  input: { readonly namespace: Namespace; readonly factId: string; readonly moved: Move },
): Promise<Result<null>> {
  const { moved } = input;
  const [then, now] = await Promise.all([
    deps.repository.readContentId(moved.from.commit, moved.from.path),
    deps.repository.readContentId(moved.head, moved.to),
  ]);
  if (!then.ok) return then;
  if (!now.ok) return now;
  const verified = await recordVerification(deps, {
    namespace: input.namespace,
    trigger: 'maintenance',
    reasonCode: 'anchor_moved',
    factId: input.factId,
    outcome: then.value !== null && then.value === now.value ? 'confirmed' : 'inconclusive',
    method: 'deterministic',
  });
  return verified.ok ? ok(null) : verified;
}

/**
 * Whether a fact states the moved path itself as its value, under a predicate that holds a
 * path. Its value and statement must change with the file, which a new source alone does not do.
 */
function holdsMovedPath(deps: RepairMovedAnchorsDeps, found: FactWithSources, moved: Move): boolean {
  const { predicate, object } = found.fact;
  return (
    (deps.pathPredicates ?? []).includes(predicate) &&
    object.kind === 'value' &&
    object.value === moved.from.path
  );
}

/**
 * Ends a fact that holds the moved path when git moved the file, the committer time of the last
 * commit to touch the old path, and continues it at the new path with the path in its statement
 * replaced, as a succession with the reason `anchor_moved` and the file at HEAD as its source.
 * Returns null when the move is not after the fact's start, so the caller re-anchors it instead.
 */
async function succeedAtNewPath(
  deps: RepairMovedAnchorsDeps,
  found: FactWithSources,
  moved: Move,
): Promise<Result<null> | null> {
  const commits = await deps.repository.listCommitsTouching(moved.from.path, moved.from.commit);
  if (!commits.ok) return commits;
  const movedAt = commits.value.at(-1)?.committedAt ?? deps.now();
  const { fact } = found;
  if (fact.validFrom !== null && movedAt <= fact.validFrom) return null;
  const ended = await endFact(deps, {
    namespace: fact.namespace,
    trigger: 'maintenance',
    reasonCode: 'anchor_moved',
    factId: fact.id,
    validTo: movedAt,
    source: { kind: 'file', locator: moved.to, version: moved.head, content: null, observedAt: deps.now() },
    successor: {
      fact: {
        subjectEntityId: fact.subjectEntityId,
        predicate: fact.predicate,
        object: { kind: 'value', value: moved.to },
        statement: fact.statement.replaceAll(moved.from.path, moved.to),
        confidence: fact.confidence,
        validFrom: movedAt,
        validTo: null,
      },
      newEntities: [],
    },
  });
  if (!ended.ok) return ended;
  if (ended.value.successorFactId === null) return ok(null);
  return verifyMoved(deps, { namespace: fact.namespace, factId: ended.value.successorFactId, moved });
}

/** Attaches a source at the new path, at HEAD, and records a verification of the moved file. */
async function repair(
  deps: RepairMovedAnchorsDeps,
  found: FactWithSources,
  moved: Move,
): Promise<Result<null>> {
  if (holdsMovedPath(deps, found, moved)) {
    const succeeded = await succeedAtNewPath(deps, found, moved);
    if (succeeded !== null) return succeeded;
  }
  const namespace = found.fact.namespace;
  const context = { namespace, trigger: 'maintenance', reasonCode: 'anchor_moved' } as const;
  const attached = await recordFacts(deps, {
    ...context,
    source: { kind: 'file', locator: moved.to, version: moved.head, content: null, observedAt: deps.now() },
    drafts: [],
    restatedFactIds: [found.fact.id],
  });
  if (!attached.ok) return attached;
  return verifyMoved(deps, { namespace, factId: found.fact.id, moved });
}

/**
 * The anchor repair job: for each orphaned fact with a file anchor, asks git where the file
 * went. A fact is orphaned with an anchor only when its latest verification found the file
 * missing: a purged source keeps no locator. If it was renamed, the fact gains a source at the new
 * path at HEAD, through a restatement with the reason `anchor_moved`, and a fresh verification.
 * No fact row is written. If git shows no rename, the fact is left as it is and flagged. If the
 * repository cannot be read, the job fails before changing anything.
 */
export async function repairMovedAnchors(
  deps: RepairMovedAnchorsDeps,
  input: { readonly namespace: Namespace },
): Promise<Result<JobCounts>> {
  const head = await deps.repository.readHead();
  if (!head.ok) return head;
  const orphaned = await deps.store.listOrphanedFacts({
    namespace: input.namespace,
    limit: ORPHANED_FACTS_PER_RUN,
  });
  if (!orphaned.ok) return orphaned;

  let examined = 0;
  let changed = 0;
  let failed = 0;
  const flaggedItems: { id: string; reason: string }[] = [];
  for (const found of orphaned.value) {
    const anchor = findAnchor(found.sources);
    if (anchor === null) continue;
    examined += 1;
    const moved = await followRenames(deps.repository, head.value, anchor.path);
    if (!moved.ok) return moved;
    if (moved.value === null) {
      flaggedItems.push({ id: found.fact.id, reason: 'source_missing' });
      continue;
    }
    const repaired = await repair(deps, found, { from: anchor, to: moved.value, head: head.value });
    // A fact invalidated meanwhile by another process was examined, not failed.
    if (repaired.ok) changed += 1;
    else if (repaired.error.code !== 'already_invalidated') failed += 1;
  }
  return ok({ examined, changed, flagged: flaggedItems.length, failed, undecided: 0, flaggedItems });
}
