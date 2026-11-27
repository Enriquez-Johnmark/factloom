// The report of FL-074, in Markdown: the result in plain words, the totals, the medians, each
// task, the tool calls by tool, and each session, with the agent, the model, the date and the
// number of tasks.
import type { CheckResult, Comparison, Configuration, Outcome, PlayedSession } from './compare-runs.ts';
import { NO_CLEAR_DIFFERENCE_BAND } from './compare-runs.ts';
import type { TaskSetChange } from './agent-tasks.ts';

/** How one configuration was run. */
export type RunDescription = {
  readonly configuration: Configuration;
  readonly startedAt: string;
  /** The agent's arguments, with each prompt replaced by `<prompt>`. */
  readonly agentArguments: readonly string[];
};

const AGENT_NAME = 'Claude Code';

const LABELS: Readonly<Record<Configuration, string>> = {
  without: 'Without Kronomind',
  with: 'With Kronomind',
};

/** Formats a count with thousands separators, so that large token counts read easily. */
export function formatCount(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/** Formats a difference with its sign: +1,200, -300 or 0. */
export function formatDifference(value: number): string {
  return value > 0 ? `+${formatCount(value)}` : formatCount(value);
}

/** Formats a share as a signed percentage with one decimal, such as -34.4%. */
export function formatShare(share: number | null): string {
  if (share === null) return 'none';
  const percent = (share * 100).toFixed(1);
  return share > 0 ? `+${percent}%` : `${percent}%`;
}

/** Formats the size of a share, without its sign, such as 34.4%. */
function formatShareSize(share: number): string {
  return `${(Math.abs(share) * 100).toFixed(1)}%`;
}

function describeToolCallDifference(difference: number | null): string {
  if (difference === null || difference === 0) return 'as many tool calls';
  const count = formatCount(Math.abs(difference));
  const noun = Math.abs(difference) === 1 ? 'tool call' : 'tool calls';
  return difference < 0 ? `${count} fewer ${noun}` : `${count} more ${noun}`;
}

/**
 * States the result in plain words, for each of the three outcomes: a saving, no clear
 * difference, or a cost (functional requirement 5).
 */
export function describeOutcome(comparison: Comparison): string {
  const count = comparison.tasks.length;
  const outcome: Outcome | null = comparison.outcome;
  if (outcome === null) return 'No task was played in both configurations, so this report shows no result.';
  const change = comparison.medians.totalTokenChange ?? 0;
  const calls = describeToolCallDifference(comparison.medians.toolCalls);
  const checks = `${comparison.passed.with} of ${count} checks passed with Kronomind and ${comparison.passed.without} of ${count} without it`;
  const band = Math.round(NO_CLEAR_DIFFERENCE_BAND * 100);
  switch (outcome) {
    case 'saving':
      return `A saving. With Kronomind, the median task used ${formatShareSize(change)} fewer tokens, input and output together, and ${calls}; ${checks}.`;
    case 'no clear difference':
      return `No clear difference. With Kronomind, the median task's tokens, input and output together, changed by ${formatShare(change)}, which is inside the ${band}% either way that this report counts as no clear difference; it made ${calls}, and ${checks}.`;
    case 'cost':
      if (comparison.passed.with < comparison.passed.without) {
        return `A cost. Fewer checks passed with Kronomind: ${checks}. A cheaper answer that fails its check is not a saving, so the change in tokens, ${formatShare(change)} for the median task, does not count as one.`;
      }
      return `A cost. With Kronomind, the median task used ${formatShareSize(change)} more tokens, input and output together, and ${calls}; ${checks}.`;
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled outcome: ${String(unhandled)}`);
    }
  }
}

function listOf(values: readonly string[]): string {
  return [...new Set(values)].sort().join(', ') || 'none reported';
}

function describeRuns(runs: readonly RunDescription[], sessions: readonly PlayedSession[]) {
  const reported = (run: RunDescription, read: (usage: PlayedSession['usage']) => string) =>
    listOf(
      sessions.filter((session) => session.configuration === run.configuration).map((s) => read(s.usage)),
    );
  const versions = runs.map((run) => reported(run, (usage) => usage.agentVersion));
  const models = runs.map((run) => reported(run, (usage) => usage.model));
  const label = (values: readonly string[]) =>
    values.map((value, index) => `${value} (${runs[index]?.configuration ?? ''})`).join('; ');
  return {
    versions: label(versions),
    models: label(models),
    dates: label(runs.map((run) => run.startedAt.slice(0, 10))),
    isLikeForLike: new Set(models).size <= 1 && new Set(versions).size <= 1,
  };
}

function totalsTable(comparison: Comparison): string[] {
  const { totals, cacheReadInputTokens, passed } = comparison;
  const count = comparison.tasks.length;
  const row = (label: string, without: number, withKronomind: number) =>
    `| ${label} | ${formatCount(without)} | ${formatCount(withKronomind)} | ${formatDifference(withKronomind - without)} |`;
  return [
    '| Figure | Without Kronomind | With Kronomind | Difference |',
    '|---|---|---|---|',
    row('Input tokens', totals.without.inputTokens, totals.with.inputTokens),
    row('of which read from the cache', cacheReadInputTokens.without, cacheReadInputTokens.with),
    row('Output tokens', totals.without.outputTokens, totals.with.outputTokens),
    row('Tool calls', totals.without.toolCalls, totals.with.toolCalls),
    `| Checks passed | ${passed.without} of ${count} | ${passed.with} of ${count} | ${formatDifference(passed.with - passed.without)} |`,
  ];
}

function mediansTable(comparison: Comparison): string[] {
  const { medians } = comparison;
  const value = (median: number | null) => (median === null ? 'none' : formatDifference(median));
  return [
    '| Figure | Median of the per-task differences, with minus without |',
    '|---|---|',
    `| Input tokens | ${value(medians.inputTokens)} |`,
    `| Output tokens | ${value(medians.outputTokens)} |`,
    `| Tool calls | ${value(medians.toolCalls)} |`,
    `| Input and output tokens, as a share of the figure without | ${formatShare(medians.totalTokenChange)} |`,
  ];
}

function passText(passed: boolean): string {
  return passed ? 'pass' : 'fail';
}

function tasksTable(comparison: Comparison): string[] {
  return [
    '| Task | Input without | Input with | Output without | Output with | Tool calls without | Tool calls with | Check without | Check with | Token change |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...comparison.tasks.map((task) =>
      [
        '',
        task.taskId,
        formatCount(task.without.inputTokens),
        formatCount(task.with.inputTokens),
        formatCount(task.without.outputTokens),
        formatCount(task.with.outputTokens),
        formatCount(task.without.toolCalls),
        formatCount(task.with.toolCalls),
        passText(task.without.passed),
        passText(task.with.passed),
        formatShare(task.totalTokenChange),
        '',
      ]
        .join(' | ')
        .trim(),
    ),
  ];
}

function toolsTable(comparison: Comparison): string[] {
  const { without, with: withKronomind } = comparison.toolCallsByTool;
  const tools = [...new Set([...Object.keys(without), ...Object.keys(withKronomind)])].sort();
  if (tools.length === 0) return ['No tool was called.'];
  return [
    '| Tool | Without Kronomind | With Kronomind |',
    '|---|---|---|',
    ...tools.map((tool) => `| \`${tool}\` | ${without[tool] ?? 0} | ${withKronomind[tool] ?? 0} |`),
  ];
}

function sessionsTable(sessions: readonly PlayedSession[], checks: readonly CheckResult[]): string[] {
  const rows = sessions.map((session) => {
    const usage = session.usage;
    const input = usage.uncachedInputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens;
    const calls = Object.values(usage.toolCalls).reduce((total, count) => total + count, 0);
    const check =
      session.session === 2
        ? checks.find((c) => c.taskId === session.taskId && c.configuration === session.configuration)
        : undefined;
    const checkText = check === undefined ? '' : passText(check.passed);
    return `| ${session.taskId} | ${session.configuration} | ${session.session} | ${formatCount(input)} | ${formatCount(usage.outputTokens)} | ${calls} | ${usage.turns} | ${usage.resultSubtype} | ${checkText} |`;
  });
  return [
    '| Task | Configuration | Session | Input tokens | Output tokens | Tool calls | Turns | Result | Check |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ];
}

/** Writes the whole report. */
export function formatComparisonReport(input: {
  readonly comparison: Comparison;
  readonly runs: readonly RunDescription[];
  readonly sessions: readonly PlayedSession[];
  readonly checks: readonly CheckResult[];
  readonly taskCount: number;
  /** What the task set is, such as "memory tasks of FL-074". */
  readonly taskSetDescription: string;
  readonly taskSetChanges: readonly TaskSetChange[];
}): string {
  const { comparison } = input;
  const described = describeRuns(input.runs, input.sessions);
  const count = comparison.tasks.length;
  const notes: string[] = [];
  if (!described.isLikeForLike) {
    notes.push(
      'The two configurations ran on different models or agent versions, so the comparison is not like for like.',
    );
  }
  if (comparison.incompleteTaskIds.length > 0) {
    notes.push(
      `Left out of every figure, because a session or a check is missing in a configuration: ${comparison.incompleteTaskIds.join(', ')}.`,
    );
  }
  const changes =
    input.taskSetChanges.length === 0
      ? ['None since the task set was committed.']
      : input.taskSetChanges.map((change) => `- ${change.date}, ${change.taskId}: ${change.reason}`);
  return [
    '# Token and tool-call comparison with and without Kronomind',
    '',
    '| | |',
    '|---|---|',
    `| Agent | ${AGENT_NAME} ${described.versions} |`,
    `| Model | ${described.models} |`,
    `| Date | ${described.dates} |`,
    `| Tasks | ${input.taskCount} in the set of ${input.taskSetDescription}, ${count} compared; each in two sessions per configuration |`,
    '',
    '## Result',
    '',
    describeOutcome(comparison),
    '',
    `${count} tasks show a direction, not a law: this is not a claim of statistical significance.`,
    '',
    "Every figure is from the agent's own usage output: tokens from `modelUsage` in each session's result event, tool calls from the `tool_use` blocks of its assistant events. Input tokens include those written to and read from the prompt cache. Nothing is estimated. A task's figures are the sum of its two sessions.",
    ...notes.flatMap((note) => ['', note]),
    '',
    '## Totals',
    '',
    ...totalsTable(comparison),
    '',
    '## Medians',
    '',
    ...mediansTable(comparison),
    '',
    '## Per task',
    '',
    ...tasksTable(comparison),
    '',
    '## Tool calls by tool',
    '',
    ...toolsTable(comparison),
    '',
    '## Sessions',
    '',
    ...sessionsTable(input.sessions, input.checks),
    '',
    '## How it was run',
    '',
    ...input.runs.map(
      (run) =>
        `- ${LABELS[run.configuration]}, started ${run.startedAt}: \`claude ${run.agentArguments.join(' ')}\``,
    ),
    '',
    '## Changes to the task set',
    '',
    ...changes,
    '',
  ].join('\n');
}
