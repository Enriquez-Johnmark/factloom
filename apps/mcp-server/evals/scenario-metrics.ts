// The four numbers self-correction is measured by (TESTING.md, "What is measured"), the
// scenarios that may fail until FL-042, and the printed report. The functions are pure.
import type { Rate } from './run-judge-eval.ts';
import type { AskResult, ExpectationResult, HistoryResult, ScenarioResult } from './run-scenario.ts';

/**
 * The scenarios that needed self-correction, by file name. Until FL-042 made `remember` resolve
 * a conflict, they were run and reported, and their failure did not fail the check. A listed
 * scenario that passes does, so that the list cannot outlive its reason. FL-042 emptied it.
 */
export const SCENARIOS_FAILING_UNTIL_FL_042: readonly string[] = [];

function toRate(count: number, of: number): Rate {
  return { count, of, ratio: of === 0 ? null : count / of };
}

function asksOf(results: readonly ScenarioResult[]): AskResult[] {
  return results.flatMap((result) =>
    result.expectations.filter((entry): entry is AskResult => entry.kind === 'ask'),
  );
}

function historiesOf(results: readonly ScenarioResult[]): HistoryResult[] {
  return results.flatMap((result) =>
    result.expectations.filter((entry): entry is HistoryResult => entry.kind === 'history'),
  );
}

/** Of the asks about now, the share that returned a value listed in `must_not_return`. */
export function measureStalenessRate(results: readonly ScenarioResult[]): Rate {
  const current = asksOf(results).filter((ask) => ask.current);
  return toRate(current.filter((ask) => ask.staleValues.length > 0).length, current.length);
}

/** Of the values the asks about now expect, the share recorded as a fact that is no longer live. */
export function measureFalseInvalidationRate(results: readonly ScenarioResult[]): Rate {
  const current = asksOf(results).filter((ask) => ask.current);
  const expected = current.reduce((sum, ask) => sum + ask.entry.returns.length, 0);
  const invalidated = current.reduce((sum, ask) => sum + ask.invalidatedValues.length, 0);
  return toRate(invalidated, expected);
}

/** Of the supersessions expected, the share whose earlier fact is still live. */
export function measureMissedInvalidationRate(results: readonly ScenarioResult[]): Rate {
  const histories = historiesOf(results);
  const expected = histories.reduce((sum, history) => sum + history.entry.superseded.length, 0);
  const missed = histories.reduce((sum, history) => sum + history.missed.length, 0);
  return toRate(missed, expected);
}

/** Of the asks with an as-of or a known-at date, the share that passed. */
export function measureHistoricalAccuracy(results: readonly ScenarioResult[]): Rate {
  const historical = asksOf(results).filter((ask) => !ask.current);
  return toRate(historical.filter((ask) => ask.passed).length, historical.length);
}

/**
 * Whether a scenario's result is acceptable to the check: a scenario must pass, and one in
 * the list of FL-042 must fail. The message says what is wrong when it is not acceptable.
 */
export function judgeScenarioOutcome(
  result: ScenarioResult,
  isListedUntilFl042: boolean,
): { readonly acceptable: boolean; readonly message: string } {
  if (isListedUntilFl042 && result.passed) {
    return {
      acceptable: false,
      message: `"${result.name}" passes but is listed as failing until FL-042. Remove it from SCENARIOS_FAILING_UNTIL_FL_042.`,
    };
  }
  if (!isListedUntilFl042 && !result.passed)
    return { acceptable: false, message: `"${result.name}" failed.` };
  return { acceptable: true, message: '' };
}

function formatRate(rate: Rate): string {
  return `${rate.count} of ${rate.of} (${rate.ratio === null ? 'n/a' : rate.ratio.toFixed(3)})`;
}

function describeEntry(entry: ExpectationResult): string {
  switch (entry.kind) {
    case 'ask': {
      const { subject, predicate, as_of, known_at } = entry.entry.ask;
      const dates = [
        as_of === undefined ? null : `as_of ${as_of}`,
        known_at === undefined ? null : `known_at ${known_at}`,
      ]
        .filter((part) => part !== null)
        .join(', ');
      const expected = `[${entry.entry.returns.join(', ')}]${entry.entry.sources === undefined ? '' : `, ${entry.entry.sources} sources`}`;
      const found = `[${entry.found.join(', ')}]${entry.foundSources === null ? '' : `, ${entry.foundSources} sources`}`;
      const stale = entry.staleValues.length === 0 ? '' : `; stale: ${entry.staleValues.join(', ')}`;
      return `ask ${subject.name} ${predicate}${dates === '' ? '' : ` (${dates})`}: expected ${expected}, found ${found}${stale}`;
    }
    case 'history': {
      const pairs = (list: HistoryResult['found']) =>
        `[${list.map((pair) => `${pair.from} ${pair.kind}`).join(', ')}]`;
      const rows = entry.entry.fact_rows === undefined ? '' : `, ${entry.entry.fact_rows} rows`;
      return `history ${entry.entry.history.subject.name} ${entry.entry.history.predicate}: expected ${pairs(entry.entry.superseded)}${rows}, found ${pairs(entry.found)}, ${entry.foundRows} rows`;
    }
    case 'entities':
      return `entities named ${entry.entry.entities.name}: expected ${entry.entry.count}, found ${entry.found}`;
    default: {
      const unhandled: never = entry;
      throw new Error(`Unhandled expectation: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * The report as text: one line per scenario, the four numbers, and each failed scenario with
 * its failed entries, expected against found. The same results give the same bytes.
 */
export function formatScenarioReport(
  runs: readonly { readonly file: string; readonly result: ScenarioResult }[],
): string {
  const lines = runs.map(({ file, result }) => {
    const listed = SCENARIOS_FAILING_UNTIL_FL_042.includes(file) ? '  (listed until FL-042)' : '';
    return `${result.passed ? 'PASS' : 'FAIL'}  ${result.name}${listed}`;
  });
  const results = runs.map((run) => run.result);
  lines.push(
    '',
    `Staleness rate: ${formatRate(measureStalenessRate(results))}.`,
    `False invalidation rate: ${formatRate(measureFalseInvalidationRate(results))}.`,
    `Missed invalidation rate: ${formatRate(measureMissedInvalidationRate(results))}.`,
    `Historical accuracy: ${formatRate(measureHistoricalAccuracy(results))}.`,
  );
  for (const { result } of runs.filter((run) => !run.result.passed)) {
    lines.push('', `Failed: ${result.name}`);
    if (result.stepFailure !== null) {
      lines.push(
        `  step ${result.stepFailure.step} failed with ${result.stepFailure.code}: ${result.stepFailure.message}`,
      );
    }
    for (const entry of result.expectations.filter((expectation) => !expectation.passed)) {
      lines.push(`  ${describeEntry(entry)}`);
    }
  }
  return lines.join('\n');
}
