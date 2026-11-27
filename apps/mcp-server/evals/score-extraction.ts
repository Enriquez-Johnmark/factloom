// Scores extracted facts against an extraction case. A fact matches when its subject name,
// predicate, object and both dates agree; the statement is not compared, and the entity type is
// reported apart because entity resolution reuses an existing entity of any type.
import { normaliseEntityName, parseDateInput, type Result } from '@kronomind/core';
import type { CaseFact, ExtractionCase } from './extraction-case.ts';

/** A fact as an extraction run returns it: the shape of a case fact. */
export type ExtractedFact = CaseFact;

export type CaseScore = {
  readonly name: string;
  /** True when the function given to the run returned a failure for this case. */
  readonly failed: boolean;
  readonly expected: number;
  readonly extracted: number;
  readonly matched: number;
  /** Matched over extracted, or null when nothing was extracted. */
  readonly precision: number | null;
  /** Matched over expected, or null when nothing was expected. */
  readonly recall: number | null;
  readonly forbiddenExtracted: number;
  /** Matches whose subject or object entity has another type than expected. */
  readonly typeDifferences: number;
};

export type ExtractionReport = {
  readonly cases: readonly CaseScore[];
  readonly total: Omit<CaseScore, 'name' | 'failed'> & { readonly failedCases: number };
};

/** The extraction step under test: a text and when it was written, to facts or a failure. */
export type ExtractFacts = (
  text: string,
  observedAt: string,
  repositoryName: string | null,
) => Promise<Result<readonly ExtractedFact[]>>;

/** A date as a comparable timestamp, so that a calendar date and its full form are equal. */
function comparableDate(text: string | null): string | null {
  if (text === null) return null;
  const parsed = parseDateInput(text);
  return parsed.ok ? parsed.value : text;
}

function objectKey(fact: CaseFact): string {
  return normaliseEntityName('value' in fact.object ? fact.object.value : fact.object.name);
}

/** What a match is decided on: normalised subject name, predicate, normalised object, and both dates. */
function matchKey(fact: CaseFact): string {
  return JSON.stringify([
    normaliseEntityName(fact.subject.name),
    fact.predicate,
    objectKey(fact),
    comparableDate(fact.valid_from),
    comparableDate(fact.valid_to),
  ]);
}

/** Whether an extracted fact matches an expected one, by the rule the scorer counts with. */
export function matchesCaseFact(expected: CaseFact, extracted: CaseFact): boolean {
  return matchKey(expected) === matchKey(extracted);
}

function sameTypes(expected: CaseFact, extracted: CaseFact): boolean {
  const objectType = (fact: CaseFact): string | null => ('type' in fact.object ? fact.object.type : null);
  return expected.subject.type === extracted.subject.type && objectType(expected) === objectType(extracted);
}

const ratio = (part: number, whole: number): number | null => (whole === 0 ? null : part / whole);

/** Scores the facts extracted for one case. Each expected fact is matched at most once. */
export function scoreCase(extractionCase: ExtractionCase, extracted: readonly ExtractedFact[]): CaseScore {
  const unmatched = [...extractionCase.expected];
  let matched = 0;
  let typeDifferences = 0;
  for (const fact of extracted) {
    const index = unmatched.findIndex((expected) => matchKey(expected) === matchKey(fact));
    if (index === -1) continue;
    const [expected] = unmatched.splice(index, 1);
    matched += 1;
    if (expected !== undefined && !sameTypes(expected, fact)) typeDifferences += 1;
  }
  const forbidden = new Set((extractionCase.forbidden ?? []).map(matchKey));
  return {
    name: extractionCase.name,
    failed: false,
    expected: extractionCase.expected.length,
    extracted: extracted.length,
    matched,
    precision: ratio(matched, extracted.length),
    recall: ratio(matched, extractionCase.expected.length),
    forbiddenExtracted: extracted.filter((fact) => forbidden.has(matchKey(fact))).length,
    typeDifferences,
  };
}

/**
 * Runs every case through the given extraction step, once each, and builds the report. A case
 * whose step returns a failure is reported as failed, with nothing extracted. Totals are summed
 * over the cases, so a case with nothing extracted or nothing expected adds nothing to a ratio.
 */
export async function runExtractionCases(
  cases: readonly ExtractionCase[],
  extract: ExtractFacts,
): Promise<ExtractionReport> {
  const scores: CaseScore[] = [];
  for (const extractionCase of cases) {
    const result = await extract(
      extractionCase.text,
      extractionCase.observed_at,
      extractionCase.repository ?? null,
    );
    scores.push(
      result.ok
        ? scoreCase(extractionCase, result.value)
        : { ...scoreCase(extractionCase, []), failed: true },
    );
  }
  const sum = (pick: (score: CaseScore) => number): number =>
    scores.reduce((total, score) => total + pick(score), 0);
  const expected = sum((score) => score.expected);
  const extracted = sum((score) => score.extracted);
  const matched = sum((score) => score.matched);
  return {
    cases: scores,
    total: {
      expected,
      extracted,
      matched,
      precision: ratio(matched, extracted),
      recall: ratio(matched, expected),
      forbiddenExtracted: sum((score) => score.forbiddenExtracted),
      typeDifferences: sum((score) => score.typeDifferences),
      failedCases: scores.filter((score) => score.failed).length,
    },
  };
}
