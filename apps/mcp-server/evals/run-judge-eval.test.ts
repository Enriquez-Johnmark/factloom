import { type ConflictJudge, err, ok } from '@factloom/core';
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { describe, expect, it } from 'vitest';
import type { JudgeCase } from './judge-case.ts';
import { formatJudgeReport, type JudgedCandidate, judgeCases, measureJudgeRates } from './run-judge-eval.ts';

function row(expected: JudgedCandidate['expected'], given: JudgedCandidate['given']): JudgedCandidate {
  return { caseName: 'a case', storedValue: 'Jest', expected, given };
}

const CASE: JudgeCase = {
  name: 'Succession: Jest to Vitest',
  observed_at: '2026-04-02',
  text: 'We switched to Vitest on 26 March 2026.',
  subject: { type: 'repository', name: 'shop-api' },
  predicate: 'uses_test_framework',
  new_fact: {
    object: { type: 'dependency', name: 'Vitest' },
    statement: 'shop-api uses Vitest.',
    valid_from: '2026-03-26',
    valid_to: null,
  },
  candidates: [
    {
      object: { type: 'dependency', name: 'Jest' },
      statement: 'shop-api uses Jest.',
      valid_from: null,
      valid_to: null,
      recorded_at: '2026-01-10',
      expected: 'succession',
    },
    {
      object: { value: 'Mocha' },
      statement: 'shop-api uses Mocha.',
      valid_from: '2024-01-01',
      valid_to: '2025-01-01',
      recorded_at: '2026-01-10',
      expected: 'unrelated',
    },
  ],
};

describe('the judge eval', () => {
  it('counts a change given where none was expected, and a change expected and not given', () => {
    const rates = measureJudgeRates([
      row('unrelated', 'correction'),
      row('duplicate', 'duplicate'),
      row('unrelated', 'unrelated'),
      row('succession', 'unrelated'),
      row('correction', 'succession'),
    ]);

    expect(rates.falseChange).toEqual({ count: 1, of: 3, ratio: 1 / 3 });
    expect(rates.missedChange).toEqual({ count: 1, of: 2, ratio: 0.5 });
  });

  it('counts llm_failed as a change missed, and not as a change given', () => {
    const rates = measureJudgeRates([row('unrelated', 'llm_failed'), row('succession', 'llm_failed')]);

    expect(rates.falseChange.count).toBe(0);
    expect(rates.missedChange.count).toBe(1);
  });

  it('reports a rate as not applicable when no candidate expects it', () => {
    expect(measureJudgeRates([]).falseChange).toEqual({ count: 0, of: 0, ratio: null });
  });

  it('gives the judge the case’s candidates, dates and cardinality, and lists one row per candidate', async () => {
    const judge: ConflictJudge = (input) => {
      expect(input.cardinality).toBe('single');
      expect(input.fact.validFrom).toBe('2026-03-26T00:00:00.000Z');
      expect(input.candidates.map(({ fact }) => fact.validTo)).toEqual([null, '2025-01-01T00:00:00.000Z']);
      return Promise.resolve(
        ok([{ kind: 'succession', changedAt: input.observedAt } as const, { kind: 'correction' } as const]),
      );
    };

    const rows = await judgeCases([CASE], softwareDevelopmentDomain, judge);

    expect(rows).toEqual([
      { caseName: CASE.name, storedValue: 'Jest', expected: 'succession', given: 'succession' },
      { caseName: CASE.name, storedValue: 'Mocha', expected: 'unrelated', given: 'correction' },
    ]);
  });

  it('marks every candidate of a case llm_failed when the judge fails', async () => {
    const judge: ConflictJudge = () => Promise.resolve(err('llm_failed', 'No answer.'));

    const rows = await judgeCases([CASE], softwareDevelopmentDomain, judge);

    expect(rows.map(({ given }) => given)).toEqual(['llm_failed', 'llm_failed']);
  });

  it('prints one line per candidate, the table of verdicts and both rates', () => {
    const text = formatJudgeReport([row('succession', 'succession'), row('unrelated', 'correction')]);

    expect(text).toContain('SAME  a case  (stored Jest: expected succession, given succession)');
    expect(text).toContain('DIFF  a case  (stored Jest: expected unrelated, given correction)');
    expect(text).toMatch(/succession\s+0\s+1\s+0\s+0\s+0/);
    expect(text).toMatch(/unrelated\s+0\s+0\s+1\s+0\s+0/);
    expect(text).toContain('Changes given where none was expected: 1 of 1 (1.000).');
    expect(text).toContain('Changes expected and not given: 0 of 1 (0.000).');
  });
});
