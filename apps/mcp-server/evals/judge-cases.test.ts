import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { err, type LlmClient } from '@factloom/core';
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { judgeConflicts } from '@factloom/maintenance';
import { describe, expect, it } from 'vitest';
import { JUDGE_CASES_DIRECTORY, type JudgeCase, loadJudgeCases, parseJudgeCase } from './judge-case.ts';
import { buildJudgeInput } from './run-judge-eval.ts';

/**
 * The FL-027 scenarios whose second text gives a fact about the same subject as the first.
 * The others have one text (a date in the text, no date in the text), a second fact about
 * another subject (a known name under a different entity type), or a change reported by
 * `changeFact` rather than a text (retraction), so the judge never sees them.
 */
const SCENARIOS_WITH_A_SECOND_FACT = [
  'correction',
  'multi-valued-predicate',
  'older-fact-arriving-late',
  'plan',
  'restatement',
  'succession',
  'unrelated-fact',
];

/** The cases whose every candidate a deterministic rule decides, so no LLM is asked. */
const CASES_DECIDED_BY_RULE = [
  'Duplicate by rule despite the wording: the status is Accepted',
  'Multi-valued predicate: a second convention',
  'Restatement: the package manager is stated twice',
  'Unrelated fact about the same subject: a package manager after a test framework',
];

/** An LLM client whose every call fails, so a case that needs the LLM gives `llm_failed`. */
const FAILING_LLM: LlmClient = {
  generateObject: () => Promise.resolve(err('llm_failed', 'No LLM in this test.')),
};

function loadCases(): JudgeCase[] {
  const cases = loadJudgeCases(JUDGE_CASES_DIRECTORY, softwareDevelopmentDomain);
  if (!cases.ok) throw new Error(cases.error.message);
  return cases.value;
}

const VALID = `
name: "Succession: an example"
observed_at: 2026-04-02
text: We switched to Vitest.
subject: { type: repository, name: shop-api }
predicate: uses_test_framework
new_fact:
  object: { type: dependency, name: Vitest }
  statement: shop-api uses Vitest.
  valid_from: null
  valid_to: null
candidates:
  - object: { type: dependency, name: Jest }
    statement: shop-api uses Jest.
    valid_from: null
    valid_to: null
    recorded_at: 2026-01-10
    expected: succession
`;

describe('the judge cases', () => {
  it('reads a valid case', () => {
    expect(parseJudgeCase(VALID, softwareDevelopmentDomain).ok).toBe(true);
  });

  it('refuses a verdict outside the four of decision D-12', () => {
    const parsed = parseJudgeCase(
      VALID.replace('expected: succession', 'expected: refinement'),
      softwareDevelopmentDomain,
    );

    expect(parsed.ok).toBe(false);
  });

  it('refuses a predicate that the domain does not have', () => {
    const parsed = parseJudgeCase(
      VALID.replace('predicate: uses_test_framework', 'predicate: uses_linter'),
      softwareDevelopmentDomain,
    );

    expect(parsed.ok).toBe(false);
  });

  it('every case file is valid against the software development domain', () => {
    expect(loadCases().length).toBeGreaterThan(0);
  });

  it('every scenario with a second fact about the same subject has a case built from it', () => {
    const scenarios = new Set(loadCases().flatMap((judgeCase) => judgeCase.scenario ?? []));

    expect([...scenarios].sort()).toEqual(SCENARIOS_WITH_A_SECOND_FACT);
  });

  it('every scenario a case names is a scenario file', () => {
    for (const judgeCase of loadCases()) {
      if (judgeCase.scenario === undefined) continue;
      expect(existsSync(join(import.meta.dirname, 'scenarios', `${judgeCase.scenario}.yaml`))).toBe(true);
    }
  });

  it('at least four cases expect no change although their wording invites one', () => {
    const misleading = loadCases().filter(
      (judgeCase) =>
        judgeCase.misleading_wording === true &&
        judgeCase.candidates.length > 0 &&
        judgeCase.candidates.every(({ expected }) => expected === 'duplicate' || expected === 'unrelated'),
    );

    expect(misleading.length).toBeGreaterThanOrEqual(4);
  });

  it('every case that the rules decide gets its expected verdicts without an LLM', async () => {
    const decided: string[] = [];
    for (const judgeCase of loadCases()) {
      const verdicts = await judgeConflicts(
        { llm: FAILING_LLM },
        buildJudgeInput(judgeCase, softwareDevelopmentDomain),
      );
      if (!verdicts.ok) continue;
      decided.push(judgeCase.name);
      expect(
        verdicts.value.map(({ kind }) => kind),
        judgeCase.name,
      ).toEqual(judgeCase.candidates.map(({ expected }) => expected));
    }

    expect(decided.sort()).toEqual(CASES_DECIDED_BY_RULE);
  });
});
