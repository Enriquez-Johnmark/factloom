// Runs the judge cases of FL-041 through a conflict judge and reports expected against given
// verdicts, with the two rates the work item asks for. No target is set for either rate.
import { join } from 'node:path';
import {
  type ConflictJudge,
  type ConflictJudgeInput,
  type Domain,
  type FactObject,
  type FactWithSources,
  normaliseEntityName,
  parseDateInput,
  type Timestamp,
} from '@factloom/core';
import { JUDGE_VERDICTS, type JudgeCase, type JudgeVerdictName } from './judge-case.ts';

const NAMESPACE = 'eval:judge';

/** What the judge gave for one candidate: a verdict, or `llm_failed` when it could not decide. */
export type GivenVerdict = JudgeVerdictName | 'llm_failed';

export type JudgedCandidate = {
  readonly caseName: string;
  readonly storedValue: string;
  readonly expected: JudgeVerdictName;
  readonly given: GivenVerdict;
};

type CaseObject = JudgeCase['new_fact']['object'];

/** A date the case schema has already checked, as a timestamp. */
function toTimestamp(text: string): Timestamp {
  const parsed = parseDateInput(text);
  if (!parsed.ok) throw new Error(`The case schema let through a date it should refuse: "${text}".`);
  return parsed.value;
}

function toNullableTimestamp(text: string | null): Timestamp | null {
  return text === null ? null : toTimestamp(text);
}

/** One identifier per name, whatever the type, as entity resolution reuses an entity by name. */
function entityId(name: string): string {
  return `entity-${normaliseEntityName(name)}`;
}

function toFactObject(object: CaseObject): FactObject {
  return 'value' in object
    ? { kind: 'value', value: object.value }
    : { kind: 'entity', entityId: entityId(object.name) };
}

function describeObject(object: CaseObject): string {
  return 'value' in object ? object.value : object.name;
}

/** A candidate of a case as `findConflictCandidates` would return it. */
function toCandidate(judgeCase: JudgeCase, index: number): FactWithSources {
  const candidate = judgeCase.candidates[index];
  if (candidate === undefined) throw new Error(`No candidate ${index} in "${judgeCase.name}".`);
  const recordedAt = toTimestamp(candidate.recorded_at);
  const entity = (name: string, type: string) => ({
    id: entityId(name),
    namespace: NAMESPACE,
    type,
    name,
    createdAt: recordedAt,
  });
  return {
    fact: {
      id: `fact-${index + 1}`,
      namespace: NAMESPACE,
      subjectEntityId: entityId(judgeCase.subject.name),
      predicate: judgeCase.predicate,
      object: toFactObject(candidate.object),
      statement: candidate.statement,
      confidence: 0.9,
      validFrom: toNullableTimestamp(candidate.valid_from),
      validTo: toNullableTimestamp(candidate.valid_to),
      createdAt: recordedAt,
      invalidatedAt: null,
      purgedAt: null,
      supersededByFactId: null,
    },
    subject: entity(judgeCase.subject.name, judgeCase.subject.type),
    objectEntity: 'value' in candidate.object ? null : entity(candidate.object.name, candidate.object.type),
    sources: [],
  };
}

/** The input the judge receives for a case, with the predicate's cardinality from the domain. */
export function buildJudgeInput(judgeCase: JudgeCase, domain: Domain): ConflictJudgeInput {
  const predicate = domain.predicates.find((definition) => definition.name === judgeCase.predicate);
  if (predicate === undefined)
    throw new Error(`The predicate "${judgeCase.predicate}" is not in the domain.`);
  const { new_fact: newFact } = judgeCase;
  return {
    fact: {
      subjectEntityId: entityId(judgeCase.subject.name),
      predicate: judgeCase.predicate,
      object: toFactObject(newFact.object),
      statement: newFact.statement,
      confidence: 0.9,
      validFrom: toNullableTimestamp(newFact.valid_from),
      validTo: toNullableTimestamp(newFact.valid_to),
    },
    objectEntityName: 'value' in newFact.object ? null : newFact.object.name,
    sourceText: judgeCase.text,
    observedAt: toTimestamp(judgeCase.observed_at),
    cardinality: predicate.cardinality,
    candidates: judgeCase.candidates.map((_, index) => toCandidate(judgeCase, index)),
  };
}

/** Judges every case, in order, and lists the verdict given for each candidate. */
export async function judgeCases(
  cases: readonly JudgeCase[],
  domain: Domain,
  judge: ConflictJudge,
): Promise<JudgedCandidate[]> {
  const rows: JudgedCandidate[] = [];
  for (const judgeCase of cases) {
    const verdicts = await judge(buildJudgeInput(judgeCase, domain));
    judgeCase.candidates.forEach((candidate, index) => {
      const given = verdicts.ok ? verdicts.value[index]?.kind : 'llm_failed';
      if (given === undefined) throw new Error(`The judge gave too few verdicts for "${judgeCase.name}".`);
      rows.push({
        caseName: judgeCase.name,
        storedValue: describeObject(candidate.object),
        expected: candidate.expected,
        given,
      });
    });
  }
  return rows;
}

const CHANGES: readonly GivenVerdict[] = ['succession', 'correction'];

/** A share of a count, or null when there is nothing to share. */
export type Rate = { readonly count: number; readonly of: number; readonly ratio: number | null };

function rate(rows: readonly JudgedCandidate[], isCounted: (row: JudgedCandidate) => boolean): Rate {
  const count = rows.filter(isCounted).length;
  return { count, of: rows.length, ratio: rows.length === 0 ? null : count / rows.length };
}

/**
 * The two rates of FL-041. A false change is a candidate expected `duplicate` or `unrelated`
 * that was given `succession` or `correction`: it would end or invalidate a true fact. A
 * missed change is a candidate expected `succession` or `correction` given anything else.
 */
export function measureJudgeRates(rows: readonly JudgedCandidate[]): {
  readonly falseChange: Rate;
  readonly missedChange: Rate;
} {
  const expectingNoChange = rows.filter((row) => !CHANGES.includes(row.expected));
  const expectingChange = rows.filter((row) => CHANGES.includes(row.expected));
  return {
    falseChange: rate(expectingNoChange, (row) => CHANGES.includes(row.given)),
    missedChange: rate(expectingChange, (row) => !CHANGES.includes(row.given)),
  };
}

function formatRate(rate: Rate): string {
  return `${rate.count} of ${rate.of} (${rate.ratio === null ? 'n/a' : rate.ratio.toFixed(3)})`;
}

/**
 * The report as text: one line per candidate, the table of expected against given verdicts,
 * and the two rates. The same rows give the same bytes, so two replayed runs print the same.
 */
export function formatJudgeReport(rows: readonly JudgedCandidate[]): string {
  const lines = rows.map(
    (row) =>
      `${row.expected === row.given ? 'SAME' : 'DIFF'}  ${row.caseName}  (stored ${row.storedValue}: expected ${row.expected}, given ${row.given})`,
  );
  const columns: readonly GivenVerdict[] = [...JUDGE_VERDICTS, 'llm_failed'];
  const width = Math.max(...columns.map((column) => column.length)) + 2;
  const cell = (text: string) => text.padStart(width);
  lines.push('', `${'expected \\ given'.padEnd(width)}${columns.map(cell).join('')}`);
  for (const expected of JUDGE_VERDICTS) {
    const counts = columns.map(
      (given) => rows.filter((row) => row.expected === expected && row.given === given).length,
    );
    lines.push(`${expected.padEnd(width)}${counts.map((count) => cell(String(count))).join('')}`);
  }
  const { falseChange, missedChange } = measureJudgeRates(rows);
  lines.push(
    '',
    `Changes given where none was expected: ${formatRate(falseChange)}.`,
    `Changes expected and not given: ${formatRate(missedChange)}.`,
  );
  return lines.join('\n');
}

/** Where the recordings of the judge cases are. */
export const JUDGE_RECORDINGS_DIRECTORY = join(import.meta.dirname, 'recordings', 'judge');

/** The command that records them, named by the error for a missing recording. */
export const JUDGE_RECORD_COMMAND = 'pnpm --filter @factloom/mcp-server run record:judge';
