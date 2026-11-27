import { describe, expect, it } from 'vitest';
import {
  type CheckResult,
  type Configuration,
  compareRuns,
  decideOutcome,
  median,
  type PlayedSession,
} from './compare-runs.ts';
import type { SessionUsage } from './read-claude-stream.ts';

function usage(
  tokens: {
    readonly uncached: number;
    readonly cacheCreation: number;
    readonly cacheRead: number;
    readonly output: number;
  },
  toolCalls: Record<string, number>,
): SessionUsage {
  return {
    agentVersion: '2.1.332',
    model: 'claude-test-model',
    modelsUsed: ['claude-test-model'],
    mcpServers: [],
    uncachedInputTokens: tokens.uncached,
    cacheCreationInputTokens: tokens.cacheCreation,
    cacheReadInputTokens: tokens.cacheRead,
    outputTokens: tokens.output,
    toolCalls,
    resultSubtype: 'success',
    isError: false,
    turns: 1,
    resultEvents: 1,
  };
}

function played(
  taskId: string,
  configuration: Configuration,
  session: 1 | 2,
  sessionUsage: SessionUsage,
): PlayedSession {
  return { taskId, configuration, session, usage: sessionUsage };
}

// Three tasks whose figures are worked out by hand in the comments.
const SESSIONS: readonly PlayedSession[] = [
  // a, without: input 1000 + 2000 = 3000, output 50 + 150 = 200, tool calls 2 + 4 = 6.
  played(
    'a',
    'without',
    1,
    usage({ uncached: 100, cacheCreation: 0, cacheRead: 900, output: 50 }, { Read: 2 }),
  ),
  played(
    'a',
    'without',
    2,
    usage({ uncached: 200, cacheCreation: 100, cacheRead: 1700, output: 150 }, { Read: 3, Grep: 1 }),
  ),
  // a, with: input 500 + 1500 = 2000, output 50 + 50 = 100, tool calls 1 + 2 = 3.
  played(
    'a',
    'with',
    1,
    usage(
      { uncached: 100, cacheCreation: 0, cacheRead: 400, output: 50 },
      { mcp__kronomind__record_fact: 1 },
    ),
  ),
  played(
    'a',
    'with',
    2,
    usage(
      { uncached: 100, cacheCreation: 100, cacheRead: 1300, output: 50 },
      { mcp__kronomind__recall: 1, Read: 1 },
    ),
  ),
  // b, without: input 1500, output 400, tool calls 2.
  played('b', 'without', 1, usage({ uncached: 500, cacheCreation: 0, cacheRead: 0, output: 100 }, {})),
  played(
    'b',
    'without',
    2,
    usage({ uncached: 1000, cacheCreation: 0, cacheRead: 0, output: 300 }, { Bash: 2 }),
  ),
  // b, with: input 1700, output 400, tool calls 4.
  played(
    'b',
    'with',
    1,
    usage({ uncached: 600, cacheCreation: 0, cacheRead: 0, output: 100 }, { mcp__kronomind__record_fact: 1 }),
  ),
  played(
    'b',
    'with',
    2,
    usage(
      { uncached: 1100, cacheCreation: 0, cacheRead: 0, output: 300 },
      { Bash: 2, mcp__kronomind__recall: 1 },
    ),
  ),
  // c, without: input 2000, output 0, tool calls 1. With: input 1900, output 0, tool calls 1.
  played('c', 'without', 1, usage({ uncached: 1000, cacheCreation: 0, cacheRead: 0, output: 0 }, {})),
  played(
    'c',
    'without',
    2,
    usage({ uncached: 1000, cacheCreation: 0, cacheRead: 0, output: 0 }, { Read: 1 }),
  ),
  played('c', 'with', 1, usage({ uncached: 900, cacheCreation: 0, cacheRead: 0, output: 0 }, {})),
  played('c', 'with', 2, usage({ uncached: 1000, cacheCreation: 0, cacheRead: 0, output: 0 }, { Read: 1 })),
];

const CHECKS: readonly CheckResult[] = [
  { taskId: 'a', configuration: 'without', passed: true },
  { taskId: 'a', configuration: 'with', passed: true },
  { taskId: 'b', configuration: 'without', passed: false },
  { taskId: 'b', configuration: 'with', passed: true },
  { taskId: 'c', configuration: 'without', passed: true },
  { taskId: 'c', configuration: 'with', passed: true },
];

const COMPARISON = compareRuns({ taskIds: ['a', 'b', 'c'], sessions: SESSIONS, checks: CHECKS });

describe('the comparison of two runs', () => {
  it('adds the two sessions of a task, counting cached input as input', () => {
    const [a] = COMPARISON.tasks;

    expect(a?.without).toEqual({ inputTokens: 3000, outputTokens: 200, toolCalls: 6, passed: true });
    expect(a?.with).toEqual({ inputTokens: 2000, outputTokens: 100, toolCalls: 3, passed: true });
  });

  it('gives each task the difference with Kronomind minus without', () => {
    expect(COMPARISON.tasks.map((task) => task.difference)).toEqual([
      { inputTokens: -1000, outputTokens: -100, toolCalls: -3 },
      { inputTokens: 200, outputTokens: 0, toolCalls: 2 },
      { inputTokens: -100, outputTokens: 0, toolCalls: 0 },
    ]);
  });

  it('gives each task its change in input and output tokens together, as a share', () => {
    const changes = COMPARISON.tasks.map((task) => task.totalTokenChange);

    // a: (2100 - 3200) / 3200; b: (2100 - 1900) / 1900; c: (1900 - 2000) / 2000.
    expect(changes[0]).toBeCloseTo(-0.34375, 10);
    expect(changes[1]).toBeCloseTo(0.1052631579, 10);
    expect(changes[2]).toBeCloseTo(-0.05, 10);
  });

  it('totals each configuration over the tasks', () => {
    expect(COMPARISON.totals).toEqual({
      without: { inputTokens: 6500, outputTokens: 600, toolCalls: 9 },
      with: { inputTokens: 5600, outputTokens: 500, toolCalls: 8 },
      difference: { inputTokens: -900, outputTokens: -100, toolCalls: -1 },
    });
    expect(COMPARISON.cacheReadInputTokens).toEqual({ without: 2600, with: 1700 });
    expect(COMPARISON.passed).toEqual({ without: 2, with: 3 });
  });

  it('takes the median of the per-task differences', () => {
    expect(COMPARISON.medians.inputTokens).toBe(-100);
    expect(COMPARISON.medians.outputTokens).toBe(0);
    expect(COMPARISON.medians.toolCalls).toBe(0);
    expect(COMPARISON.medians.totalTokenChange).toBeCloseTo(-0.05, 10);
  });

  it('counts the tool calls of each configuration by tool', () => {
    expect(COMPARISON.toolCallsByTool.without).toEqual({ Read: 6, Grep: 1, Bash: 2 });
    expect(COMPARISON.toolCallsByTool.with).toEqual({
      mcp__kronomind__record_fact: 2,
      mcp__kronomind__recall: 2,
      Read: 2,
      Bash: 2,
    });
  });

  it('calls a median change of five percent no clear difference', () => {
    expect(COMPARISON.outcome).toBe('no clear difference');
  });

  it('leaves out of every figure a task missing a session or a check', () => {
    const partial = compareRuns({
      taskIds: ['a', 'd', 'e'],
      sessions: [
        ...SESSIONS.filter((session) => session.taskId === 'a'),
        played('d', 'without', 1, usage({ uncached: 1, cacheCreation: 0, cacheRead: 0, output: 1 }, {})),
        played('d', 'without', 2, usage({ uncached: 1, cacheCreation: 0, cacheRead: 0, output: 1 }, {})),
        played('e', 'without', 1, usage({ uncached: 1, cacheCreation: 0, cacheRead: 0, output: 1 }, {})),
        played('e', 'without', 2, usage({ uncached: 1, cacheCreation: 0, cacheRead: 0, output: 1 }, {})),
        played('e', 'with', 1, usage({ uncached: 1, cacheCreation: 0, cacheRead: 0, output: 1 }, {})),
        played('e', 'with', 2, usage({ uncached: 1, cacheCreation: 0, cacheRead: 0, output: 1 }, {})),
      ],
      checks: [
        ...CHECKS.filter((check) => check.taskId === 'a'),
        { taskId: 'e', configuration: 'with', passed: true },
      ],
    });

    expect(partial.incompleteTaskIds).toEqual(['d', 'e']);
    expect(partial.tasks.map((task) => task.taskId)).toEqual(['a']);
    expect(partial.totals.without).toEqual({ inputTokens: 3000, outputTokens: 200, toolCalls: 6 });
  });

  it('has no outcome when no task is complete', () => {
    const empty = compareRuns({ taskIds: ['a'], sessions: [], checks: [] });

    expect(empty.outcome).toBeNull();
    expect(empty.medians.totalTokenChange).toBeNull();
  });
});

describe('the median', () => {
  it('is the middle value of an odd number of values', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([-5])).toBe(-5);
  });

  it('is the mean of the two middle values of an even number of values', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([-10, 10])).toBe(0);
  });

  it('is absent for no values', () => {
    expect(median([])).toBeNull();
  });
});

describe('the outcome', () => {
  it('is a saving at a median change of minus ten percent or less with as many checks passed', () => {
    expect(decideOutcome({ medianTotalTokenChange: -0.1, passedWith: 7, passedWithout: 7 })).toBe('saving');
    expect(decideOutcome({ medianTotalTokenChange: -0.4, passedWith: 8, passedWithout: 7 })).toBe('saving');
  });

  it('is a cost at a median change of ten percent or more', () => {
    expect(decideOutcome({ medianTotalTokenChange: 0.1, passedWith: 9, passedWithout: 7 })).toBe('cost');
  });

  it('is no clear difference inside the band', () => {
    expect(decideOutcome({ medianTotalTokenChange: 0.099, passedWith: 7, passedWithout: 7 })).toBe(
      'no clear difference',
    );
    expect(decideOutcome({ medianTotalTokenChange: -0.099, passedWith: 7, passedWithout: 7 })).toBe(
      'no clear difference',
    );
  });

  it('is a cost when fewer checks pass with Kronomind, however many tokens it saves', () => {
    expect(decideOutcome({ medianTotalTokenChange: -0.5, passedWith: 6, passedWithout: 7 })).toBe('cost');
  });
});
