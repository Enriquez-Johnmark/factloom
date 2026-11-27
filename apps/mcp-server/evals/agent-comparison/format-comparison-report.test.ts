import { describe, expect, it } from 'vitest';
import { type CheckResult, type Configuration, compareRuns, type PlayedSession } from './compare-runs.ts';
import {
  describeOutcome,
  formatComparisonReport,
  formatDifference,
  formatShare,
  type RunDescription,
} from './format-comparison-report.ts';

function session(
  configuration: Configuration,
  number: 1 | 2,
  input: number,
  toolCalls: Record<string, number>,
  model = 'claude-test-model',
): PlayedSession {
  return {
    taskId: 'refund-rounding',
    configuration,
    session: number,
    usage: {
      agentVersion: '2.1.332',
      model,
      modelsUsed: [model],
      mcpServers: [],
      uncachedInputTokens: input,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      outputTokens: 0,
      toolCalls,
      resultSubtype: 'success',
      isError: false,
      turns: 2,
      resultEvents: 1,
    },
  };
}

/** One task: 1,000 input tokens and 4 tool calls without Kronomind, the given figures with it. */
function oneTask(withInput: number, withCalls: number, passed: { without: boolean; with: boolean }) {
  const sessions = [
    session('without', 1, 400, { Read: 1 }),
    session('without', 2, 600, { Read: 3 }),
    session('with', 1, withInput / 2, {}),
    session('with', 2, withInput / 2, withCalls === 0 ? {} : { Read: withCalls }),
  ];
  const checks: CheckResult[] = [
    { taskId: 'refund-rounding', configuration: 'without', passed: passed.without },
    { taskId: 'refund-rounding', configuration: 'with', passed: passed.with },
  ];
  return { sessions, checks, comparison: compareRuns({ taskIds: ['refund-rounding'], sessions, checks }) };
}

const RUNS: readonly RunDescription[] = [
  { configuration: 'without', startedAt: '2026-11-30T10:00:00.000Z', agentArguments: ['-p', '<prompt>'] },
  { configuration: 'with', startedAt: '2026-12-01T09:00:00.000Z', agentArguments: ['-p', '<prompt>'] },
];

describe('the statement of the result', () => {
  it('states a saving with its size, the tool calls and the checks', () => {
    const { comparison } = oneTask(500, 1, { without: true, with: true });

    expect(describeOutcome(comparison)).toBe(
      'A saving. With Kronomind, the median task used 50.0% fewer tokens, input and output together, and 3 fewer tool calls; 1 of 1 checks passed with Kronomind and 1 of 1 without it.',
    );
  });

  it('states no clear difference with the band it falls in', () => {
    const { comparison } = oneTask(1050, 4, { without: true, with: true });

    expect(describeOutcome(comparison)).toBe(
      "No clear difference. With Kronomind, the median task's tokens, input and output together, changed by +5.0%, which is inside the 10% either way that this report counts as no clear difference; it made as many tool calls, and 1 of 1 checks passed with Kronomind and 1 of 1 without it.",
    );
  });

  it('states a cost in tokens', () => {
    const { comparison } = oneTask(1500, 6, { without: true, with: true });

    expect(describeOutcome(comparison)).toBe(
      'A cost. With Kronomind, the median task used 50.0% more tokens, input and output together, and 2 more tool calls; 1 of 1 checks passed with Kronomind and 1 of 1 without it.',
    );
  });

  it('states a cost when fewer checks pass, even with fewer tokens', () => {
    const { comparison } = oneTask(500, 1, { without: true, with: false });

    expect(describeOutcome(comparison)).toBe(
      'A cost. Fewer checks passed with Kronomind: 0 of 1 checks passed with Kronomind and 1 of 1 without it. A cheaper answer that fails its check is not a saving, so the change in tokens, -50.0% for the median task, does not count as one.',
    );
  });
});

describe('the report', () => {
  it('names the agent, the model, the dates, the task set and the number of tasks', () => {
    const { comparison, sessions, checks } = oneTask(500, 1, { without: true, with: true });

    const report = formatComparisonReport({
      comparison,
      runs: RUNS,
      sessions,
      checks,
      taskCount: 10,
      taskSetDescription: 'memory tasks of FL-074',
      taskSetChanges: [],
    });

    expect(report).toContain('| Agent | Claude Code 2.1.332 (without); 2.1.332 (with) |');
    expect(report).toContain('| Model | claude-test-model (without); claude-test-model (with) |');
    expect(report).toContain('| Date | 2026-11-30 (without); 2026-12-01 (with) |');
    expect(report).toContain(
      '| Tasks | 10 in the set of memory tasks of FL-074, 1 compared; each in two sessions per configuration |',
    );
    expect(report).toContain('None since the task set was committed.');
  });

  it('gives the totals and each task with and without Kronomind', () => {
    const { comparison, sessions, checks } = oneTask(500, 1, { without: true, with: false });

    const report = formatComparisonReport({
      comparison,
      runs: RUNS,
      sessions,
      checks,
      taskCount: 10,
      taskSetDescription: 'memory tasks of FL-074',
      taskSetChanges: [],
    });

    expect(report).toContain('| Input tokens | 1,000 | 500 | -500 |');
    expect(report).toContain('| Tool calls | 4 | 1 | -3 |');
    expect(report).toContain('| Checks passed | 1 of 1 | 0 of 1 | -1 |');
    expect(report).toContain('| refund-rounding | 1,000 | 500 | 0 | 0 | 4 | 1 | pass | fail | -50.0% |');
    expect(report).toContain('| `Read` | 4 | 1 |');
  });

  it('warns when the two configurations ran on different models', () => {
    const { checks } = oneTask(500, 1, { without: true, with: true });
    const sessions = [
      session('without', 1, 400, {}),
      session('without', 2, 600, {}),
      session('with', 1, 250, {}, 'claude-other-model'),
      session('with', 2, 250, {}, 'claude-other-model'),
    ];
    const comparison = compareRuns({ taskIds: ['refund-rounding'], sessions, checks });

    const report = formatComparisonReport({
      comparison,
      runs: RUNS,
      sessions,
      checks,
      taskCount: 10,
      taskSetDescription: 'memory tasks of FL-074',
      taskSetChanges: [{ date: '2026-12-02', taskId: 'refund-rounding', reason: 'A typo in the prompt.' }],
    });

    expect(report).toContain('the comparison is not like for like');
    expect(report).toContain('- 2026-12-02, refund-rounding: A typo in the prompt.');
  });
});

describe('the number formats', () => {
  it('signs differences and shares', () => {
    expect(formatDifference(1200)).toBe('+1,200');
    expect(formatDifference(-300)).toBe('-300');
    expect(formatDifference(0)).toBe('0');
    expect(formatDifference(2.5)).toBe('+2.5');
    expect(formatShare(-0.34375)).toBe('-34.4%');
    expect(formatShare(0.1052631579)).toBe('+10.5%');
    expect(formatShare(null)).toBe('none');
  });
});
