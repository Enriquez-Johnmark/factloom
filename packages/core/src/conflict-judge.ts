import type { PredicateDefinition } from './domain.ts';
import type { FactWithSources } from './fact.ts';
import type { NewFact } from './operations/operation-inputs.ts';
import type { Result } from './result.ts';
import type { Timestamp } from './timestamp.ts';

/**
 * How many candidates a caller asks `findConflictCandidates` for when it passes them to a
 * conflict judge, so that one LLM call stays small. It starts at 10, the number of similar
 * memories retrieved in the experiments of the Mem0 paper (contradiction detection research,
 * finding 10).
 */
export const JUDGE_CANDIDATE_LIMIT = 10;

/**
 * What a new fact is to one stored candidate. A succession carries the moment the value
 * changed, which code computes; the LLM is never asked for a date.
 */
export type ConflictVerdict =
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'succession'; readonly changedAt: Timestamp }
  | { readonly kind: 'correction' }
  | { readonly kind: 'unrelated' };

/** A new fact, after entity resolution, and the stored facts it could conflict with. */
export type ConflictJudgeInput = {
  readonly fact: NewFact;
  /** The name of the fact's object entity, for the prompt. Null when the object is a value. */
  readonly objectEntityName: string | null;
  /** The text the fact was extracted from. */
  readonly sourceText: string;
  /** When the source was observed. The moment of change when the fact has no `validFrom`. */
  readonly observedAt: Timestamp;
  readonly cardinality: PredicateDefinition['cardinality'];
  /** As `findConflictCandidates` returns them. */
  readonly candidates: readonly FactWithSources[];
};

/**
 * Gives one verdict per candidate, in the order of the candidates, or `llm_failed` when it
 * could not decide. It changes nothing. `@kronomind/maintenance` implements it; a use case
 * receives one as a dependency, and a test passes a plain function.
 */
export type ConflictJudge = (input: ConflictJudgeInput) => Promise<Result<readonly ConflictVerdict[]>>;
