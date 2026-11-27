import {
  type ConflictJudge,
  type ConflictVerdict,
  type FactDraft,
  type FactId,
  type FactWithSources,
  JUDGE_CANDIDATE_LIMIT,
  type Timestamp,
} from '@kronomind/core';
import type { PlannedFact } from './plan-facts.ts';

/** What `remember` does with a fact that conflicts with stored facts, once the judge has spoken. */
export type ConflictResolution =
  | { readonly kind: 'skip' }
  | { readonly kind: 'restates'; readonly factId: FactId }
  | {
      readonly kind: 'supersedes';
      readonly storedFactId: FactId;
      /** The new fact, with its start set to the moment of change when the text gave none. */
      readonly draft: FactDraft;
      /** A succession carries when the stored fact ended; a correction has no such moment. */
      readonly supersession:
        | { readonly kind: 'succession'; readonly changedAt: Timestamp }
        | { readonly kind: 'correction' };
    };

const SKIP: ConflictResolution = { kind: 'skip' };

function isChange(verdict: ConflictVerdict): boolean {
  return verdict.kind === 'succession' || verdict.kind === 'correction';
}

/**
 * Asks the judge about a new fact and the stored facts it conflicts with, and turns the
 * verdicts into what to do. Anything uncertain is a skip, as in phase 1: a failed judge, more
 * candidates than one call takes, more than one stored fact to give way, a stored fact judged
 * unrelated that would still overlap, and a succession whose moment of change is not after
 * the stored fact's start. A failure to judge never changes memory.
 */
export async function resolveConflict(
  judge: ConflictJudge,
  input: {
    readonly planned: PlannedFact;
    readonly conflicting: readonly FactWithSources[];
    readonly sourceText: string;
    readonly observedAt: Timestamp;
  },
): Promise<ConflictResolution> {
  const { planned, conflicting } = input;
  if (conflicting.length === 0 || conflicting.length > JUDGE_CANDIDATE_LIMIT) return SKIP;
  const verdicts = await judge({
    fact: planned.draft.fact,
    objectEntityName: planned.objectEntityName,
    sourceText: input.sourceText,
    observedAt: input.observedAt,
    cardinality: planned.singleValued ? 'single' : 'multi',
    candidates: conflicting,
  });
  if (!verdicts.ok || verdicts.value.length !== conflicting.length) return SKIP;

  const changes = verdicts.value.filter(isChange);
  if (changes.length === 0) {
    const duplicate = verdicts.value.findIndex((verdict) => verdict.kind === 'duplicate');
    const restated = conflicting[duplicate];
    return restated === undefined ? SKIP : { kind: 'restates', factId: restated.fact.id };
  }
  // One stored fact gives way, and only when nothing else would still be in the way.
  const [verdict] = verdicts.value;
  const [stored] = conflicting;
  if (conflicting.length !== 1 || verdict === undefined || stored === undefined) return SKIP;

  if (verdict.kind === 'correction') {
    return {
      kind: 'supersedes',
      storedFactId: stored.fact.id,
      draft: planned.draft,
      supersession: { kind: 'correction' },
    };
  }
  if (verdict.kind !== 'succession') return SKIP;
  const { changedAt } = verdict;
  if (stored.fact.validFrom !== null && changedAt <= stored.fact.validFrom) return SKIP;
  // A successor with no start would overlap the ended fact; it became true when the other ended.
  const fact =
    planned.draft.fact.validFrom === null
      ? { ...planned.draft.fact, validFrom: changedAt }
      : planned.draft.fact;
  return {
    kind: 'supersedes',
    storedFactId: stored.fact.id,
    draft: { ...planned.draft, fact },
    supersession: { kind: 'succession', changedAt },
  };
}
