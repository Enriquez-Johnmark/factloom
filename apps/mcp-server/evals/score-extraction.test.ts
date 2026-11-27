import { err, ok } from '@kronomind/core';
import { describe, expect, it } from 'vitest';
import type { CaseFact, ExtractionCase } from './extraction-case.ts';
import { type ExtractedFact, type ExtractFacts, runExtractionCases, scoreCase } from './score-extraction.ts';

/** A fact about a repository whose object is a dependency entity. */
function usesFramework(repository: string, framework: string, validFrom: string | null = null): CaseFact {
  return {
    subject: { type: 'repository', name: repository },
    predicate: 'uses_test_framework',
    object: { type: 'dependency', name: framework },
    valid_from: validFrom,
    valid_to: null,
  };
}

/** A fact about a repository whose object is a value. */
function deploysTo(repository: string, target: string): CaseFact {
  return {
    subject: { type: 'repository', name: repository },
    predicate: 'deploys_to',
    object: { value: target },
    valid_from: null,
    valid_to: null,
  };
}

function extractionCase(
  name: string,
  expected: readonly CaseFact[],
  forbidden: readonly CaseFact[] = [],
): ExtractionCase {
  return {
    name,
    kinds: ['one-plain-fact'],
    observed_at: '2026-03-02',
    text: `The text of ${name}.`,
    expected: expected.map((fact) => ({ ...fact, required: true })),
    forbidden: [...forbidden],
  };
}

/** A stub extraction step that answers each case's text with the facts given for it. */
function stubExtraction(answers: Record<string, readonly ExtractedFact[] | 'fails'>): ExtractFacts {
  return (text) => {
    const answer = answers[text];
    if (answer === undefined) throw new Error(`No answer for "${text}".`);
    return Promise.resolve(answer === 'fails' ? err('llm_failed', 'The model did not answer.') : ok(answer));
  };
}

describe('scoreCase', () => {
  it('counts a fact as matched when subject, predicate, object and dates agree', () => {
    const fact = usesFramework('shop-api', 'Vitest', '2026-02-03');

    const score = scoreCase(extractionCase('a', [fact]), [fact]);

    expect(score).toMatchObject({ expected: 1, extracted: 1, matched: 1, precision: 1, recall: 1 });
  });

  it('does not match a fact whose valid_from differs', () => {
    const score = scoreCase(extractionCase('a', [usesFramework('shop-api', 'Vitest', '2026-02-03')]), [
      usesFramework('shop-api', 'Vitest', '2026-02-04'),
    ]);

    expect(score).toMatchObject({ matched: 0, precision: 0, recall: 0 });
  });

  it('does not match a fact whose valid_to differs', () => {
    const ended = { ...usesFramework('shop-api', 'Mocha'), valid_to: '2026-01-01' };

    const score = scoreCase(extractionCase('a', [ended]), [usesFramework('shop-api', 'Mocha')]);

    expect(score.matched).toBe(0);
  });

  it('does not match a fact whose object differs', () => {
    const score = scoreCase(extractionCase('a', [usesFramework('shop-api', 'Vitest')]), [
      usesFramework('shop-api', 'Jest'),
    ]);

    expect(score.matched).toBe(0);
  });

  it('matches across upper case and spacing', () => {
    const score = scoreCase(extractionCase('a', [deploysTo('shop-api', 'Cloudflare Pages')]), [
      deploysTo('  SHOP-API ', 'cloudflare   pages'),
    ]);

    expect(score.matched).toBe(1);
  });

  it('matches a calendar date with the same moment written in full', () => {
    const score = scoreCase(extractionCase('a', [usesFramework('shop-api', 'Vitest', '2026-02-03')]), [
      usesFramework('shop-api', 'Vitest', '2026-02-03T00:00:00.000Z'),
    ]);

    expect(score.matched).toBe(1);
  });

  it('matches each expected fact at most once', () => {
    const fact = deploysTo('shop-api', 'Fly.io');

    const score = scoreCase(extractionCase('a', [fact]), [fact, fact]);

    expect(score).toMatchObject({ extracted: 2, matched: 1, precision: 0.5, recall: 1 });
  });

  it('reports a match whose entity type differs without refusing the match', () => {
    const asRepository = {
      ...usesFramework('shop-api', 'Vitest'),
      object: { type: 'repository', name: 'Vitest' },
    };

    const score = scoreCase(extractionCase('a', [usesFramework('shop-api', 'Vitest')]), [asRepository]);

    expect(score).toMatchObject({ matched: 1, typeDifferences: 1 });
  });

  it('reports precision as not applicable when nothing is extracted', () => {
    const score = scoreCase(extractionCase('a', [deploysTo('shop-api', 'Fly.io')]), []);

    expect(score).toMatchObject({ precision: null, recall: 0 });
  });

  it('reports recall as not applicable when nothing is expected', () => {
    const score = scoreCase(extractionCase('a', []), [deploysTo('shop-api', 'Fly.io')]);

    expect(score).toMatchObject({ precision: 0, recall: null });
  });

  it('counts a forbidden fact that was extracted', () => {
    const plan = deploysTo('shop-api', 'Kubernetes');

    const score = scoreCase(extractionCase('a', [], [plan]), [plan, deploysTo('shop-api', 'Fly.io')]);

    expect(score.forbiddenExtracted).toBe(1);
  });
});

describe('runExtractionCases', () => {
  it('reports precision and recall for the set', async () => {
    const vitest = usesFramework('shop-api', 'Vitest');
    const flyIo = deploysTo('shop-api', 'Fly.io');
    const render = deploysTo('billing-worker', 'Render');
    const kubernetes = deploysTo('docs-site', 'Kubernetes');
    const cases = [
      extractionCase('two expected', [vitest, flyIo]),
      extractionCase('one expected', [render]),
      extractionCase('a plan', [], [kubernetes]),
    ];
    const extract = stubExtraction({
      // One right, one wrong, and Fly.io missing.
      'The text of two expected.': [vitest, usesFramework('shop-api', 'Jest')],
      // Render missing, nothing extracted.
      'The text of one expected.': [],
      // The forbidden plan and one wrong fact.
      'The text of a plan.': [kubernetes, deploysTo('docs-site', 'Netlify')],
    });

    const report = await runExtractionCases(cases, extract);

    // Hand-computed. Per case: matched/extracted and matched/expected.
    expect(report.cases.map(({ precision, recall }) => [precision, recall])).toEqual([
      [1 / 2, 1 / 2],
      [null, 0],
      [0, null],
    ]);
    // For the set: 1 matched of 4 extracted, and of 3 expected.
    expect(report.total).toEqual({
      expected: 3,
      extracted: 4,
      matched: 1,
      precision: 1 / 4,
      recall: 1 / 3,
      forbiddenExtracted: 1,
      typeDifferences: 0,
      failedCases: 0,
    });
  });

  it('reports a failed extraction as a failure and no extracted facts', async () => {
    const cases = [extractionCase('fails', [deploysTo('shop-api', 'Fly.io')])];

    const report = await runExtractionCases(cases, stubExtraction({ 'The text of fails.': 'fails' }));

    expect(report.cases[0]).toMatchObject({
      failed: true,
      extracted: 0,
      matched: 0,
      precision: null,
      recall: 0,
    });
    expect(report.total.failedCases).toBe(1);
  });

  it('calls the extraction step once per case with its text and observed_at', async () => {
    const calls: [string, string][] = [];
    const extract: ExtractFacts = (text, observedAt) => {
      calls.push([text, observedAt]);
      return Promise.resolve(ok([]));
    };

    await runExtractionCases([extractionCase('a', []), extractionCase('b', [])], extract);

    expect(calls).toEqual([
      ['The text of a.', '2026-03-02'],
      ['The text of b.', '2026-03-02'],
    ]);
  });
});
