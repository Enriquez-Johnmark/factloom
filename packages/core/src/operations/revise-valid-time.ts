import type { Change, ChangeSet } from '../change-set.ts';
import type { Fact, FactId, FactWithSources } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { err, ok, type Result } from '../result.ts';
import type { Timestamp } from '../timestamp.ts';
import { buildSource } from './build-source.ts';
import type { ChangeContext, NewSource } from './operation-inputs.ts';
import { readLiveFact } from './read-live-fact.ts';

/** The new valid period of one fact. Both bounds are given, and either may be unknown. */
export type ValidTimeRevision = {
  readonly factId: FactId;
  readonly validFrom: Timestamp | null;
  readonly validTo: Timestamp | null;
};

export type ReviseValidTimeInput = ChangeContext & {
  /** Why we believe the periods were wrong. Attached to every copy. */
  readonly source: NewSource;
  readonly revisions: readonly ValidTimeRevision[];
};

/** Refuses an empty list, a fact listed twice, and a period that does not end after it starts. */
function checkRevisions(revisions: readonly ValidTimeRevision[]): Result<null> {
  if (revisions.length === 0) return err('invalid_input', 'Give at least one revision.');
  const seen = new Set<FactId>();
  for (const { factId, validFrom, validTo } of revisions) {
    if (seen.has(factId)) {
      return err('invalid_input', `The fact ${factId} is listed twice. Give one period for each fact.`);
    }
    seen.add(factId);
    if (validFrom !== null && validTo !== null && validTo <= validFrom) {
      return err(
        'invalid_input',
        `The valid period of ${factId} must end after it starts: ${validFrom} to ${validTo} was given.`,
      );
    }
  }
  return ok(null);
}

/** Reads every fact to revise, in order, stopping at the first that is missing or no longer live. */
async function readLiveFacts(
  deps: Pick<OperationDeps, 'store'>,
  input: ReviseValidTimeInput,
): Promise<Result<readonly FactWithSources[]>> {
  const found: FactWithSources[] = [];
  for (const { factId } of input.revisions) {
    const read = await readLiveFact(deps, { namespace: input.namespace, factId });
    if (!read.ok) return read;
    found.push(read.value);
  }
  return ok(found);
}

/**
 * Changes the valid period of one or more facts in one commit. A fact row is never edited, so
 * each fact is invalidated and superseded by a copy with the new period, which keeps the
 * original's sources and gains the one given. The single-value rule is checked once, on the
 * result, so the boundary between two neighbouring facts can be moved by revising both.
 */
export async function reviseValidTime(
  deps: OperationDeps,
  input: ReviseValidTimeInput,
): Promise<Result<{ readonly revisedFactIds: readonly FactId[] }>> {
  const checked = checkRevisions(input.revisions);
  if (!checked.ok) return checked;
  const originals = await readLiveFacts(deps, input);
  if (!originals.ok) return originals;

  const now = deps.now();
  const source = await buildSource(deps, {
    namespace: input.namespace,
    source: input.source,
    createdAt: now,
  });
  const changes: Change[] = [{ kind: 'record_source', source }];
  const revisedFactIds: FactId[] = [];
  originals.value.forEach((original, index) => {
    const revision = input.revisions[index];
    if (revision === undefined) throw new Error('A revision was read but not given.');
    const copy: Fact = {
      ...original.fact,
      id: deps.newId(),
      validFrom: revision.validFrom,
      validTo: revision.validTo,
      createdAt: now,
      invalidatedAt: null,
      supersededByFactId: null,
    };
    const predicate = deps.domain.predicates.find((known) => known.name === copy.predicate);
    const [firstSourceId, ...otherSourceIds] = [...original.sources.map((known) => known.id), source.id];
    changes.push(
      {
        kind: 'record_fact',
        fact: copy,
        sourceIds: [firstSourceId ?? source.id, ...otherSourceIds],
        // The statement is unchanged, so its vector is copied and not computed again.
        embedding: { copyFromFactId: original.fact.id },
        singleValued: predicate?.cardinality === 'single',
      },
      { kind: 'invalidate_fact', factId: original.fact.id, supersededByFactId: copy.id },
    );
    revisedFactIds.push(copy.id);
  });

  const changeSet: ChangeSet = {
    namespace: input.namespace,
    operationId: deps.newId(),
    operation: 'revision',
    trigger: input.trigger,
    reasonCode: input.reasonCode,
    explainedBySourceId: source.id,
    occurredAt: now,
    changes,
  };
  const committed = await deps.store.commit(changeSet);
  if (!committed.ok) return committed;
  return ok({ revisedFactIds });
}
