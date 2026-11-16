import { describe, expect, it } from 'vitest';
import { formatBenchmarkTable, judgeRow, percentile } from './benchmark-budgets.ts';

describe('the benchmark budgets', () => {
  it('gives the 95th percentile of a list of durations', () => {
    const durations = Array.from({ length: 100 }, (_, index) => 100 - index);

    expect(percentile(durations, 95)).toBe(95);
    expect(percentile(durations, 50)).toBe(50);
    expect(percentile([7], 95)).toBe(7);
  });

  it('reports a value above its budget and its tolerance as missed', () => {
    expect(
      judgeRow({ label: 'recall, 10,000 facts, p95', value: 181, budgetName: 'recall_10k_p95' }).outcome,
    ).toBe('missed');
  });

  it('warns and does not fail for a value above its budget within its tolerance', () => {
    const row = judgeRow({ label: 'recall, 10,000 facts, p95', value: 179, budgetName: 'recall_10k_p95' });

    expect(row.outcome).toBe('warning');
    expect(formatBenchmarkTable([row], ['test machine'])).toContain('Every budget is met.');
  });

  it('meets a value at its budget', () => {
    expect(judgeRow({ label: 'record_fact', value: 50, budgetName: 'record_fact_p95' }).outcome).toBe('met');
  });

  it('does not budget the remember row', () => {
    expect(judgeRow({ label: 'remember', value: 99_999, budgetName: null }).outcome).toBe('reported');
    expect(judgeRow({ label: 'remember', value: null, budgetName: null, note: 'no key' }).outcome).toBe(
      'not measured',
    );
  });

  it('names each budget missed', () => {
    const rows = [
      judgeRow({ label: 'recall, 10,000 facts, p95', value: 1000, budgetName: 'recall_10k_p95' }),
      judgeRow({ label: 'server start, median', value: 100, budgetName: 'server_start_median' }),
    ];

    expect(formatBenchmarkTable(rows, ['test machine'])).toContain(
      'Budgets missed: recall, 10,000 facts, p95.',
    );
  });
});
