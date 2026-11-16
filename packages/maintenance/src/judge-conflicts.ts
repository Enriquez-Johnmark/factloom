import {
  type ConflictJudgeInput,
  type ConflictVerdict,
  err,
  type FactObject,
  type FactWithSources,
  type LlmClient,
  normaliseEntityName,
  ok,
  periodsOverlap,
  type Result,
} from '@factloom/core';
import {
  formatJudgeInput,
  JUDGE_INSTRUCTIONS,
  type JudgeAnswer,
  JudgeAnswerSchema,
} from './conflict-judge-prompt.ts';

export type JudgeConflictsDeps = { readonly llm: LlmClient };

/**
 * Two objects are the same when they are the same entity, or values equal in the normalised
 * form that stores use for names, so that "pnpm" and "PNPM " are one value. Entity names were
 * normalised already, by entity resolution.
 */
function isSameObject(first: FactObject, second: FactObject): boolean {
  if (first.kind === 'entity' && second.kind === 'entity') return first.entityId === second.entityId;
  if (first.kind === 'value' && second.kind === 'value') {
    return normaliseEntityName(first.value) === normaliseEntityName(second.value);
  }
  return false;
}

/** The verdict the deterministic rules give a candidate, or null when only the LLM can decide. */
function judgeByRule(input: ConflictJudgeInput, candidate: FactWithSources): ConflictVerdict | null {
  if (isSameObject(candidate.fact.object, input.fact.object)) return { kind: 'duplicate' };
  if (input.cardinality === 'multi') return { kind: 'unrelated' };
  if (!periodsOverlap(candidate.fact, input.fact)) return { kind: 'unrelated' };
  return null;
}

/**
 * Turns the model's answer into one verdict per asked candidate, in their order. An answer
 * that names a number out of range, names one twice or leaves one out is refused, because a
 * verdict on the wrong fact could end or invalidate a true one.
 */
function readAnswer(
  answer: JudgeAnswer,
  askedCount: number,
  input: ConflictJudgeInput,
): Result<readonly ConflictVerdict[]> {
  const byNumber = new Map<number, JudgeAnswer['verdicts'][number]['verdict']>();
  for (const { stored_fact: number, verdict } of answer.verdicts) {
    if (number < 1 || number > askedCount) {
      return err('llm_failed', `The judge named stored fact ${number}, but only ${askedCount} were given.`);
    }
    if (byNumber.has(number)) return err('llm_failed', `The judge named stored fact ${number} twice.`);
    byNumber.set(number, verdict);
  }
  const verdicts: ConflictVerdict[] = [];
  for (let number = 1; number <= askedCount; number += 1) {
    const verdict = byNumber.get(number);
    if (verdict === undefined)
      return err('llm_failed', `The judge gave no verdict for stored fact ${number}.`);
    verdicts.push(
      verdict === 'succession'
        ? { kind: 'succession', changedAt: input.fact.validFrom ?? input.observedAt }
        : { kind: verdict },
    );
  }
  return ok(verdicts);
}

/**
 * Decides, for a new fact and each stored candidate, whether the new fact duplicates it,
 * follows it, corrects it, or is unrelated to it. Rules decide what they can without the LLM;
 * the rest, all of one predicate that holds one value at a time, go to the LLM in one call.
 * Returns one verdict per candidate, in their order, or `llm_failed`, never a guess.
 */
export async function judgeConflicts(
  deps: JudgeConflictsDeps,
  input: ConflictJudgeInput,
): Promise<Result<readonly ConflictVerdict[]>> {
  const ruled = input.candidates.map((candidate) => ({ candidate, verdict: judgeByRule(input, candidate) }));
  const asked = ruled.filter(({ verdict }) => verdict === null).map(({ candidate }) => candidate);
  let answered: readonly ConflictVerdict[] = [];
  if (asked.length > 0) {
    const answer = await deps.llm.generateObject({
      task: 'conflict_detection',
      instructions: JUDGE_INSTRUCTIONS,
      input: formatJudgeInput(input, asked),
      schema: JudgeAnswerSchema,
    });
    if (!answer.ok) return answer;
    const read = readAnswer(answer.value, asked.length, input);
    if (!read.ok) return read;
    answered = read.value;
  }
  const remaining = [...answered];
  const verdicts: ConflictVerdict[] = [];
  for (const { verdict } of ruled) {
    const next = verdict ?? remaining.shift();
    if (next === undefined) throw new Error('The judge has fewer answers than candidates it asked about.');
    verdicts.push(next);
  }
  return ok(verdicts);
}
