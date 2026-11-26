// The results directory of the comparison. Each run of one configuration writes:
//
//   run-<configuration>.jsonl   one line for the run, then one per session and per check as it ends
//   raw/<task>-<configuration>-<session>.jsonl   the agent's own stream-json output, unchanged
//   checks/<task>-<configuration>.txt            the output of the task's check
//   report.md                   rebuilt from every run log in the directory
//
// The run log is JSON Lines and appended to, so a run that stops keeps what it finished, and
// the formatter leaves it alone. Nothing is written that the secret check of graph-rag refuses:
// the raw output is the agent's transcript, so it is checked first, and withheld if it holds a
// credential.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { checkForSecrets } from '@factloom/graph-rag';
import { z } from 'zod';
import { type CheckResult, type Configuration, compareRuns, type PlayedSession } from './compare-runs.ts';
import { formatComparisonReport } from './format-comparison-report.ts';
import { SessionUsageSchema } from './read-claude-stream.ts';
import { DEFAULT_TASK_SET_NAME, findTaskSet, TASK_SET_NAMES, type TaskSet } from './task-sets.ts';

/** Where the owner's runs are kept, one directory per date unless another is given. */
export const RESULTS_DIRECTORY = join(import.meta.dirname, 'results');

const ConfigurationSchema = z.enum(['without', 'with']);

/** What a run without Factloom can start from: Claude Code as shipped, or with a `CLAUDE.md` map. */
export const BASELINES = ['as-shipped', 'claude-md'] as const;
export type Baseline = (typeof BASELINES)[number];

const RunEntrySchema = z.strictObject({
  kind: z.literal('run'),
  configuration: ConfigurationSchema,
  /** The task set played. A log written before FL-081 names none, and played the default. */
  taskSet: z.enum(TASK_SET_NAMES).default(DEFAULT_TASK_SET_NAME),
  /**
   * What the run without Factloom started from: Claude Code as shipped, or with the task set's
   * hand-written `CLAUDE.md` map (FL-082). A log written before FL-082 names none: as shipped.
   */
  baseline: z.enum(BASELINES).default('as-shipped'),
  startedAt: z.string(),
  /** What `claude --version` printed before the run. */
  agentVersion: z.string(),
  /** The agent's arguments, with the prompt and the temporary configuration path left out. */
  agentArguments: z.array(z.string()),
  nodeVersion: z.string(),
  platform: z.string(),
});

const SessionEntrySchema = z.strictObject({
  kind: z.literal('session'),
  taskId: z.string(),
  session: z.union([z.literal(1), z.literal(2)]),
  /** The raw output's path in the results directory, or null when it was withheld. */
  rawFile: z.string().nullable(),
  exitCode: z.number().int().nullable(),
  hasTimedOut: z.boolean(),
  /** What the agent reported, or null when its output could not be read. */
  usage: SessionUsageSchema.nullable(),
  /** Why the usage or the raw output is missing. Never holds any of the output itself. */
  problem: z.string().nullable(),
});

const CheckEntrySchema = z.strictObject({
  kind: z.literal('check'),
  taskId: z.string(),
  passed: z.boolean(),
  outputFile: z.string().nullable(),
});

const FinishedEntrySchema = z.strictObject({ kind: z.literal('finished'), finishedAt: z.string() });

export const RunLogEntrySchema = z.discriminatedUnion('kind', [
  RunEntrySchema,
  SessionEntrySchema,
  CheckEntrySchema,
  FinishedEntrySchema,
]);
export type RunLogEntry = z.infer<typeof RunLogEntrySchema>;
export type RunEntry = z.infer<typeof RunEntrySchema>;
export type SessionEntry = z.infer<typeof SessionEntrySchema>;
export type CheckEntry = z.infer<typeof CheckEntrySchema>;

/** One configuration's run, read back from its log. */
export type RunLog = {
  readonly run: RunEntry;
  readonly sessions: readonly SessionEntry[];
  readonly checks: readonly CheckEntry[];
  readonly finishedAt: string | null;
};

/** The path of a configuration's run log in a results directory. */
export function findRunLogPath(resultsDirectory: string, configuration: Configuration): string {
  return join(resultsDirectory, `run-${configuration}.jsonl`);
}

/**
 * Shows the home directory as `~` in an agent's output, so that the user name in its paths is
 * not published with the results. A path that only starts like the home directory, such as
 * `/Users/anabel` for `/Users/ana`, is left as it is.
 */
export function hideHomeDirectory(output: string, homeDirectory: string): string {
  if (homeDirectory === '') return output;
  const escaped = homeDirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return output.replace(new RegExp(`${escaped}(?=$|[/"'\\s:,\\\\])`, 'g'), '~');
}

/**
 * Writes a text file of the results unless the secret check refuses it. Returns null when it
 * was written, or the reason it was withheld, which names the kind of secret and not its value.
 */
export function writeCheckedFile(path: string, text: string): string | null {
  const checked = checkForSecrets([{ name: basename(path), value: text }]);
  if (!checked.ok) return checked.error.message;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return null;
}

/** Appends one entry to a configuration's run log. An entry holds figures and names, never output. */
export function appendRunLogEntry(
  resultsDirectory: string,
  configuration: Configuration,
  entry: RunLogEntry,
): void {
  const line = `${JSON.stringify(RunLogEntrySchema.parse(entry))}\n`;
  const checked = checkForSecrets([{ name: 'run log entry', value: line }]);
  if (!checked.ok) throw new Error(`The run log entry was not written: ${checked.error.message}`);
  mkdirSync(resultsDirectory, { recursive: true });
  appendFileSync(findRunLogPath(resultsDirectory, configuration), line);
}

/** Reads a configuration's run log, or returns null when the directory has none. */
export function readRunLog(resultsDirectory: string, configuration: Configuration): RunLog | null {
  const path = findRunLogPath(resultsDirectory, configuration);
  if (!existsSync(path)) return null;
  const entries = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => RunLogEntrySchema.parse(JSON.parse(line)));
  const [first] = entries;
  if (first?.kind !== 'run') throw new Error(`${basename(path)} does not start with its run entry.`);
  return {
    run: first,
    sessions: entries.filter((entry) => entry.kind === 'session'),
    checks: entries.filter((entry) => entry.kind === 'check'),
    finishedAt: entries.findLast((entry) => entry.kind === 'finished')?.finishedAt ?? null,
  };
}

/** The sessions and checks of the run logs, in the form the comparison takes. */
export function collectResults(logs: readonly RunLog[]): {
  readonly sessions: PlayedSession[];
  readonly checks: CheckResult[];
} {
  const sessions: PlayedSession[] = [];
  const checks: CheckResult[] = [];
  for (const log of logs) {
    const configuration = log.run.configuration;
    for (const entry of log.sessions) {
      if (entry.usage === null) continue;
      sessions.push({ taskId: entry.taskId, configuration, session: entry.session, usage: entry.usage });
    }
    for (const entry of log.checks) {
      checks.push({ taskId: entry.taskId, configuration, passed: entry.passed });
    }
  }
  return { sessions, checks };
}

/** The task set of a directory's run logs, which must all name the same one. */
function findReportTaskSet(logs: readonly RunLog[]): TaskSet {
  const names = [...new Set(logs.map((log) => log.run.taskSet))];
  if (names.length > 1)
    throw new Error(`The run logs were played with different task sets: ${names.join(', ')}.`);
  const taskSet = findTaskSet(names[0] ?? DEFAULT_TASK_SET_NAME);
  if (taskSet === null) throw new Error(`Unknown task set: ${names[0] ?? ''}.`);
  return taskSet;
}

/** Builds the report from the run logs in a results directory and writes it as report.md. */
export function writeReport(resultsDirectory: string): string {
  const logs = ConfigurationSchema.options.flatMap((configuration) => {
    const log = readRunLog(resultsDirectory, configuration);
    return log === null ? [] : [log];
  });
  const taskSet = findReportTaskSet(logs);
  const { sessions, checks } = collectResults(logs);
  const comparison = compareRuns({ taskIds: taskSet.tasks.map((task) => task.id), sessions, checks });
  const report = formatComparisonReport({
    comparison,
    runs: logs.map((log) => ({
      configuration: log.run.configuration,
      startedAt: log.run.startedAt,
      agentArguments: log.run.agentArguments,
    })),
    sessions,
    checks,
    taskCount: taskSet.tasks.length,
    taskSetDescription: logs.some((log) => log.run.baseline === 'claude-md')
      ? `${taskSet.description}, the run without Factloom starting from a hand-written CLAUDE.md map`
      : taskSet.description,
    taskSetChanges: taskSet.changes,
  });
  const path = join(resultsDirectory, 'report.md');
  const withheld = writeCheckedFile(path, report);
  if (withheld !== null) throw new Error(`The report was not written: ${withheld}`);
  return path;
}
