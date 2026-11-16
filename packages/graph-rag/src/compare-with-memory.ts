import { findConflictCandidates, type Namespace, type OperationDeps, ok, type Result } from '@factloom/core';
import { type Comparison, compareWithCandidates } from './compare-with-candidates.ts';
import type { PlannedFact } from './plan-facts.ts';

/**
 * How many live facts with one subject and predicate are compared with a new fact. A
 * single-valued predicate has at most one live fact per valid period, so a few cover the
 * overlapping ones; a multi-valued predicate needs enough to find an equal object.
 */
const CONFLICT_CANDIDATE_LIMIT = 50;

/**
 * Compares a planned fact with the live facts that share its subject and predicate. A fact
 * about an entity this call creates is new without a lookup.
 */
export async function compareWithMemory(
  deps: Pick<OperationDeps, 'store' | 'now'>,
  input: { readonly namespace: Namespace; readonly planned: PlannedFact },
): Promise<Result<Comparison>> {
  const { planned } = input;
  if (planned.hasNewSubject) return ok({ kind: 'new' });
  const { fact } = planned.draft;
  const candidates = await findConflictCandidates(deps, {
    namespace: input.namespace,
    subjectEntityId: fact.subjectEntityId,
    predicate: fact.predicate,
    validFrom: fact.validFrom,
    validTo: fact.validTo,
    limit: CONFLICT_CANDIDATE_LIMIT,
  });
  if (!candidates.ok) return candidates;
  return ok(compareWithCandidates({ ...fact, singleValued: planned.singleValued }, candidates.value));
}
