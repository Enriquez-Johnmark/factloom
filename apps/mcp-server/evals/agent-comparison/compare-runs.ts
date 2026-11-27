// The arithmetic of the report of FL-074: per-task figures with and without Kronomind, their
// differences, the totals, the medians, and which of the three outcomes the figures show.
import type { SessionUsage } from './read-claude-stream.ts';

/** Whether the Kronomind server was registered for a run. */
export type Configuration = 'without' | 'with';

/** One session as it was played, with what the agent reported. */
export type PlayedSession = {
  readonly taskId: string;
  readonly configuration: Configuration;
  readonly session: 1 | 2;
  readonly usage: SessionUsage;
};

/** Whether a task's check passed after its second session, in one configuration. */
export type CheckResult = {
  readonly taskId: string;
  readonly configuration: Configuration;
  readonly passed: boolean;
};

/** The figures the report compares. Input tokens include those written to and read from the cache. */
export type Figures = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly toolCalls: number;
};

export type TaskFigures = Figures & { readonly passed: boolean };

export type TaskComparison = {
  readonly taskId: string;
  readonly without: TaskFigures;
  readonly with: TaskFigures;
  /** With Kronomind minus without, for each figure. */
  readonly difference: Figures;
  /** The difference in input and output tokens together, as a share of the figure without. */
  readonly totalTokenChange: number | null;
};

export type Outcome = 'saving' | 'no clear difference' | 'cost';

export type Comparison = {
  /** The tasks played in both configurations, both sessions each, with both checks run. */
  readonly tasks: readonly TaskComparison[];
  /** Tasks of the set that are missing a session or a check in either configuration. */
  readonly incompleteTaskIds: readonly string[];
  readonly totals: { readonly without: Figures; readonly with: Figures; readonly difference: Figures };
  readonly cacheReadInputTokens: { readonly without: number; readonly with: number };
  readonly passed: { readonly without: number; readonly with: number };
  /** Medians of the per-task differences; null when no task is complete. */
  readonly medians: {
    readonly inputTokens: number | null;
    readonly outputTokens: number | null;
    readonly toolCalls: number | null;
    readonly totalTokenChange: number | null;
  };
  readonly toolCallsByTool: {
    readonly without: Readonly<Record<string, number>>;
    readonly with: Readonly<Record<string, number>>;
  };
  /** Null when no task is complete, so there is nothing to compare. */
  readonly outcome: Outcome | null;
};

/**
 * A median change in tokens within this share either way is reported as no clear difference.
 * Set before any run, so that the result cannot move it: ten tasks show a direction, and a
 * change of a few percent between two runs of an agent is within what repeating a run can give.
 */
export const NO_CLEAR_DIFFERENCE_BAND = 0.1;

/** The figures of one session, as the agent reported them. */
export function countSessionFigures(usage: SessionUsage): Figures {
  return {
    inputTokens: usage.uncachedInputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens,
    outputTokens: usage.outputTokens,
    toolCalls: Object.values(usage.toolCalls).reduce((total, count) => total + count, 0),
  };
}

/** Adds figures together; no figures add up to zero. */
export function addFigures(figures: readonly Figures[]): Figures {
  return figures.reduce(
    (total, next) => ({
      inputTokens: total.inputTokens + next.inputTokens,
      outputTokens: total.outputTokens + next.outputTokens,
      toolCalls: total.toolCalls + next.toolCalls,
    }),
    { inputTokens: 0, outputTokens: 0, toolCalls: 0 },
  );
}

/** Subtracts the figures without Kronomind from those with it. */
export function subtractFigures(withKronomind: Figures, without: Figures): Figures {
  return {
    inputTokens: withKronomind.inputTokens - without.inputTokens,
    outputTokens: withKronomind.outputTokens - without.outputTokens,
    toolCalls: withKronomind.toolCalls - without.toolCalls,
  };
}

/** The median: the middle value, or the mean of the two middle values. Null for no values. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? Number.NaN;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[middle - 1] ?? Number.NaN) + upper) / 2;
}

/**
 * Decides the outcome. Fewer checks passed with Kronomind is a cost whatever the tokens show,
 * because a cheaper answer that fails its check is not a saving. Otherwise a median change in
 * tokens at or below minus the band is a saving, at or above the band a cost, and anything
 * between is no clear difference.
 */
export function decideOutcome(input: {
  readonly medianTotalTokenChange: number | null;
  readonly passedWith: number;
  readonly passedWithout: number;
}): Outcome | null {
  if (input.medianTotalTokenChange === null) return null;
  if (input.passedWith < input.passedWithout) return 'cost';
  if (input.medianTotalTokenChange <= -NO_CLEAR_DIFFERENCE_BAND) return 'saving';
  if (input.medianTotalTokenChange >= NO_CLEAR_DIFFERENCE_BAND) return 'cost';
  return 'no clear difference';
}

/** Compares the sessions and checks of both configurations, task by task, in the order given. */
export function compareRuns(input: {
  readonly taskIds: readonly string[];
  readonly sessions: readonly PlayedSession[];
  readonly checks: readonly CheckResult[];
}): Comparison {
  const tasks: TaskComparison[] = [];
  const incompleteTaskIds: string[] = [];
  for (const taskId of input.taskIds) {
    const without = figuresOfTask(input, taskId, 'without');
    const withKronomind = figuresOfTask(input, taskId, 'with');
    if (without === null || withKronomind === null) {
      incompleteTaskIds.push(taskId);
      continue;
    }
    tasks.push(compareTask(taskId, without, withKronomind));
  }
  const completeIds = new Set(tasks.map((task) => task.taskId));
  const completeSessions = input.sessions.filter((session) => completeIds.has(session.taskId));
  const totalsWithout = addFigures(tasks.map((task) => task.without));
  const totalsWith = addFigures(tasks.map((task) => task.with));
  const passed = {
    without: tasks.filter((task) => task.without.passed).length,
    with: tasks.filter((task) => task.with.passed).length,
  };
  const medianTotalTokenChange = median(
    tasks.flatMap((task) => (task.totalTokenChange === null ? [] : [task.totalTokenChange])),
  );
  return {
    tasks,
    incompleteTaskIds,
    totals: {
      without: totalsWithout,
      with: totalsWith,
      difference: subtractFigures(totalsWith, totalsWithout),
    },
    cacheReadInputTokens: {
      without: sumCacheRead(completeSessions, 'without'),
      with: sumCacheRead(completeSessions, 'with'),
    },
    passed,
    medians: {
      inputTokens: median(tasks.map((task) => task.difference.inputTokens)),
      outputTokens: median(tasks.map((task) => task.difference.outputTokens)),
      toolCalls: median(tasks.map((task) => task.difference.toolCalls)),
      totalTokenChange: medianTotalTokenChange,
    },
    toolCallsByTool: {
      without: countToolCallsByTool(completeSessions, 'without'),
      with: countToolCallsByTool(completeSessions, 'with'),
    },
    outcome: decideOutcome({
      medianTotalTokenChange,
      passedWith: passed.with,
      passedWithout: passed.without,
    }),
  };
}

function figuresOfTask(
  input: { readonly sessions: readonly PlayedSession[]; readonly checks: readonly CheckResult[] },
  taskId: string,
  configuration: Configuration,
): TaskFigures | null {
  const sessions = input.sessions.filter(
    (session) => session.taskId === taskId && session.configuration === configuration,
  );
  const check = input.checks.find(
    (result) => result.taskId === taskId && result.configuration === configuration,
  );
  const hasBothSessions = [1, 2].every((number) => sessions.some((session) => session.session === number));
  if (!hasBothSessions || sessions.length !== 2 || check === undefined) return null;
  return {
    ...addFigures(sessions.map((session) => countSessionFigures(session.usage))),
    passed: check.passed,
  };
}

function compareTask(taskId: string, without: TaskFigures, withKronomind: TaskFigures): TaskComparison {
  const totalWithout = without.inputTokens + without.outputTokens;
  const totalWith = withKronomind.inputTokens + withKronomind.outputTokens;
  return {
    taskId,
    without,
    with: withKronomind,
    difference: subtractFigures(withKronomind, without),
    totalTokenChange: totalWithout === 0 ? null : (totalWith - totalWithout) / totalWithout,
  };
}

function sumCacheRead(sessions: readonly PlayedSession[], configuration: Configuration): number {
  return sessions
    .filter((session) => session.configuration === configuration)
    .reduce((total, session) => total + session.usage.cacheReadInputTokens, 0);
}

function countToolCallsByTool(
  sessions: readonly PlayedSession[],
  configuration: Configuration,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const session of sessions) {
    if (session.configuration !== configuration) continue;
    for (const [tool, count] of Object.entries(session.usage.toolCalls)) {
      counts[tool] = (counts[tool] ?? 0) + count;
    }
  }
  return counts;
}
