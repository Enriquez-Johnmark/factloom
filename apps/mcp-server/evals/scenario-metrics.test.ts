import { describe, expect, it } from 'vitest';
import type { AskResult, HistoryResult, ScenarioResult } from './run-scenario.ts';
import {
  formatScenarioReport,
  measureFalseInvalidationRate,
  measureHistoricalAccuracy,
  measureMissedInvalidationRate,
  measureStalenessRate,
} from './scenario-metrics.ts';

const SUBJECT = { name: 'shop-api', type: 'repository' };

/** A checked ask, built by hand: about now unless a date is given. */
function ask(fields: {
  readonly returns: readonly string[];
  readonly found: readonly string[];
  readonly asOf?: string;
  readonly stale?: readonly string[];
  readonly invalidated?: readonly string[];
  readonly passed?: boolean;
}): AskResult {
  return {
    kind: 'ask',
    entry: {
      ask: {
        subject: SUBJECT,
        predicate: 'deploys_to',
        ...(fields.asOf === undefined ? {} : { as_of: fields.asOf }),
      },
      returns: [...fields.returns],
    },
    current: fields.asOf === undefined,
    found: fields.found,
    foundSources: null,
    passed: fields.passed ?? true,
    staleValues: fields.stale ?? [],
    invalidatedValues: fields.invalidated ?? [],
  };
}

function history(expected: readonly string[], missed: readonly string[]): HistoryResult {
  const pairs = expected.map((from) => ({ from, kind: 'succession' as const }));
  return {
    kind: 'history',
    entry: { history: { subject: SUBJECT, predicate: 'deploys_to' }, superseded: pairs },
    found: [],
    foundRows: 0,
    passed: missed.length === 0,
    missed: pairs.filter((pair) => missed.includes(pair.from)),
  };
}

function scenario(name: string, expectations: ScenarioResult['expectations']): ScenarioResult {
  return { name, stepFailure: null, expectations, passed: expectations.every((entry) => entry.passed) };
}

// Two scenarios. Asks about now: four, one of which returned a stale value. Values they expect:
// five, two of them invalidated. Supersessions expected: three, one missed. Asks about the past:
// three, two passed.
const RESULTS: readonly ScenarioResult[] = [
  scenario('first', [
    ask({ returns: ['Vitest'], found: ['Jest', 'Vitest'], stale: ['Jest'], passed: false }),
    ask({ returns: ['pnpm', 'node'], found: ['pnpm'], invalidated: ['node'], passed: false }),
    ask({ returns: ['Jest'], found: ['Jest'], asOf: '2026-02-01' }),
    history(['Jest', 'npm'], ['Jest']),
  ]),
  scenario('second', [
    ask({ returns: ['5432'], found: [], invalidated: ['5432'], passed: false }),
    ask({ returns: ['Fly.io'], found: ['Fly.io'] }),
    ask({ returns: ['Heroku'], found: ['Heroku'], asOf: '2024-06-01' }),
    ask({ returns: ['5433'], found: ['5432'], asOf: '2026-01-20', passed: false }),
    history(['5433'], []),
  ]),
];

describe('the scenario metrics', () => {
  it('measures staleness as the share of asks about now that returned a value they must not', () => {
    expect(measureStalenessRate(RESULTS)).toEqual({ count: 1, of: 4, ratio: 0.25 });
  });

  it('measures false invalidation as the share of expected current values whose fact was invalidated', () => {
    expect(measureFalseInvalidationRate(RESULTS)).toEqual({ count: 2, of: 5, ratio: 0.4 });
  });

  it('measures missed invalidation as the share of expected supersessions whose earlier fact is still live', () => {
    expect(measureMissedInvalidationRate(RESULTS)).toEqual({ count: 1, of: 3, ratio: 1 / 3 });
  });

  it('measures historical accuracy as the share of asks about the past that passed', () => {
    expect(measureHistoricalAccuracy(RESULTS)).toEqual({ count: 2, of: 3, ratio: 2 / 3 });
  });

  it('gives no ratio when nothing was measured', () => {
    expect(measureStalenessRate([])).toEqual({ count: 0, of: 0, ratio: null });
  });

  it('names the stale value of a failed ask in the report', () => {
    const first = RESULTS[0];
    if (first === undefined) throw new Error('RESULTS has two scenarios.');
    const report = formatScenarioReport([{ file: 'first.yaml', result: first }]);
    expect(report).toContain('FAIL  first');
    expect(report).toContain('stale: Jest');
  });
});
