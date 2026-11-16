import {
  type FactDraft,
  type FactId,
  type FactObject,
  type FactWithSources,
  periodsOverlap,
  type Timestamp,
} from '@factloom/core';

/** A fact about to be recorded, as far as the comparison needs it. */
export type ComparedFact = {
  readonly object: FactObject;
  readonly validFrom: Timestamp | null;
  readonly validTo: Timestamp | null;
  /** The cardinality of the fact's predicate in the domain. */
  readonly singleValued: boolean;
};

/** What a fact is, given the live facts with its subject and predicate. */
export type Comparison =
  | { readonly kind: 'conflicts'; readonly conflictingFactIds: readonly FactId[] }
  | { readonly kind: 'restates'; readonly factId: FactId }
  | { readonly kind: 'new' };

/** Two objects are the same when they are the same entity, or values that are equal strings. */
export function isSameObject(first: FactObject, second: FactObject): boolean {
  if (first.kind === 'entity' && second.kind === 'entity') return first.entityId === second.entityId;
  if (first.kind === 'value' && second.kind === 'value') return first.value === second.value;
  return false;
}

/**
 * Applies the two deterministic rules of phase 1 (MCP-TOOLS.md, "remember") to a fact and the
 * live facts with its subject and predicate, newest first. Under a single-valued predicate, a
 * candidate with another object whose valid period overlaps is a conflict. Otherwise an
 * overlapping candidate with the same object is restated, and the newest such one is named.
 */
export function compareWithCandidates(
  fact: ComparedFact,
  candidates: readonly FactWithSources[],
): Comparison {
  const overlapping = candidates.filter((candidate) => periodsOverlap(candidate.fact, fact));
  if (fact.singleValued) {
    const conflicting = overlapping.filter((candidate) => !isSameObject(candidate.fact.object, fact.object));
    if (conflicting.length > 0) {
      return { kind: 'conflicts', conflictingFactIds: conflicting.map((candidate) => candidate.fact.id) };
    }
  }
  const restated = overlapping.find((candidate) => isSameObject(candidate.fact.object, fact.object));
  return restated === undefined ? { kind: 'new' } : { kind: 'restates', factId: restated.fact.id };
}

/** Whether two drafts state the same thing: same subject, predicate and object, overlapping in time. */
export function isSameFact(first: FactDraft, second: FactDraft): boolean {
  return (
    first.fact.subjectEntityId === second.fact.subjectEntityId &&
    first.fact.predicate === second.fact.predicate &&
    isSameObject(first.fact.object, second.fact.object) &&
    periodsOverlap(first.fact, second.fact)
  );
}

/** Whether two new facts break the single-value rule together. */
export function conflictsWithEachOther(
  first: { readonly draft: FactDraft; readonly singleValued: boolean },
  second: { readonly draft: FactDraft },
): boolean {
  const a = first.draft.fact;
  const b = second.draft.fact;
  return (
    first.singleValued &&
    a.subjectEntityId === b.subjectEntityId &&
    a.predicate === b.predicate &&
    !isSameObject(a.object, b.object) &&
    periodsOverlap(a, b)
  );
}
