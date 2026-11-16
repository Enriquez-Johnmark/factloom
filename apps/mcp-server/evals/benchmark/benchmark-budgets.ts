/** The 95th percentile and others: nearest rank on the sorted durations, in milliseconds. */
export function percentile(durations: readonly number[], rank: number): number {
  if (durations.length === 0) throw new Error('A percentile needs at least one duration.');
  const sorted = [...durations].sort((first, second) => first - second);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1));
  return sorted[index] ?? Number.NaN;
}

export type BudgetName = 'recall_10k_p95' | 'recall_100k_p95' | 'record_fact_p95' | 'server_start_median';

/**
 * The budgets of REQ-35, in milliseconds, each with a tolerance as a share of the budget.
 * The tolerance of 20 percent is a starting value for the variation of hosted runners; the
 * first runs confirm or revise it (FL-066).
 */
export const BENCHMARK_BUDGETS: Readonly<
  Record<BudgetName, { readonly budget: number; readonly tolerance: number }>
> = {
  recall_10k_p95: { budget: 150, tolerance: 0.2 },
  recall_100k_p95: { budget: 500, tolerance: 0.2 },
  record_fact_p95: { budget: 50, tolerance: 0.2 },
  server_start_median: { budget: 2000, tolerance: 0.2 },
};

/** One row of the table: a measured value, and its budget when it has one. */
export type BenchmarkRow = {
  readonly label: string;
  readonly value: number | null;
  /** Null for a row that is reported and not budgeted, such as `remember`. */
  readonly budgetName: BudgetName | null;
  /** Why a row has no value, such as a missing API key. */
  readonly note?: string;
};

export type JudgedRow = BenchmarkRow & {
  readonly outcome: 'met' | 'warning' | 'missed' | 'reported' | 'not measured';
};

/**
 * Compares each row with its budget: met at or below the budget; a warning above it but
 * within the tolerance; missed beyond the tolerance. A row with no budget is reported.
 */
export function judgeRow(
  row: BenchmarkRow,
  budgets: Readonly<
    Record<BudgetName, { readonly budget: number; readonly tolerance: number }>
  > = BENCHMARK_BUDGETS,
): JudgedRow {
  if (row.value === null) return { ...row, outcome: 'not measured' };
  if (row.budgetName === null) return { ...row, outcome: 'reported' };
  const { budget, tolerance } = budgets[row.budgetName];
  if (row.value <= budget) return { ...row, outcome: 'met' };
  return { ...row, outcome: row.value <= budget * (1 + tolerance) ? 'warning' : 'missed' };
}

/** The table of a run, the machine it ran on, and the budgets missed. */
export function formatBenchmarkTable(
  rows: readonly JudgedRow[],
  machine: readonly string[],
  budgets: Readonly<
    Record<BudgetName, { readonly budget: number; readonly tolerance: number }>
  > = BENCHMARK_BUDGETS,
): string {
  const lines = [
    'Machine:',
    ...machine.map((line) => `  ${line}`),
    '',
    '| Measure | Value (ms) | Budget (ms) | Tolerance | Outcome |',
    '|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const budget = row.budgetName === null ? null : budgets[row.budgetName];
    const value = row.value === null ? (row.note ?? 'not measured') : row.value.toFixed(1);
    const budgetText = budget === null ? 'none' : String(budget.budget);
    const toleranceText = budget === null ? 'none' : `${Math.round(budget.tolerance * 100)}%`;
    lines.push(`| ${row.label} | ${value} | ${budgetText} | ${toleranceText} | ${row.outcome} |`);
  }
  const missed = rows.filter((row) => row.outcome === 'missed');
  lines.push(
    '',
    missed.length === 0
      ? 'Every budget is met.'
      : `Budgets missed: ${missed.map((row) => row.label).join('; ')}.`,
  );
  return lines.join('\n');
}
