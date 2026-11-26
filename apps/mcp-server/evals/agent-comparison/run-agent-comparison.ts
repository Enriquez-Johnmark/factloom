// The runner of FL-074, started by hand, never by `pnpm check` or `pnpm eval`: it needs a
// signed-in Claude Code and spends real tokens. Run from apps/mcp-server:
//
//   pnpm run compare:agent                                  prints the usage, does nothing else
//   pnpm run compare:agent --dry-run                        prepares every task, starts no agent
//   pnpm run compare:agent --run --configuration without    plays the ten tasks without Factloom
//   pnpm run compare:agent --run --configuration with       plays them with Factloom registered
//   pnpm run compare:agent --report <results directory>     rebuilds report.md from the run logs
//
// Each task is played from a clean copy of the fixture repository, its two sessions in that
// one copy, one after the other; with Factloom, each task gets a new database file and a new
// namespace. The runner never reads, prints or stores a key or a session token: the agent signs
// in from the person's own environment, and only the agent's stream-json output is kept.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { toTimestamp } from '@factloom/core';
import { AGENT_TASKS, type AgentTask } from './agent-tasks.ts';
import {
  type Baseline,
  appendRunLogEntry,
  findRunLogPath,
  RESULTS_DIRECTORY,
  hideHomeDirectory,
  writeCheckedFile,
  writeReport,
} from './comparison-results.ts';
import type { Configuration } from './compare-runs.ts';
import {
  buildClaudeArguments,
  buildFactloomHookEnvironment,
  buildFactloomMcpConfig,
  buildFactloomRunSettings,
  describeClaudeArguments,
  findServerProblem,
  MCP_CONFIG_PLACEHOLDER,
  playClaudeSession,
} from './play-claude-session.ts';
import { readClaudeStream } from './read-claude-stream.ts';
import { runTaskCheck } from './run-task-check.ts';
import { DEFAULT_TASK_SET_NAME, findTaskSet, TASK_SET_NAMES, type TaskSet } from './task-sets.ts';
import { SERVER_ENTRY, warmUpFactloomServer } from './warm-up-factloom-server.ts';

const USAGE = `Plays a task set through Claude Code, with and without Factloom, and writes the report:
the ${AGENT_TASKS.length} memory tasks of FL-074 by default, or with --task-set another set (${TASK_SET_NAMES.join(', ')}).

Usage, from apps/mcp-server:
  pnpm run compare:agent --dry-run [--task-set <name>] [--configuration without|with]
      Prepares each task's working tree and server configuration, prints the command each
      session would run, checks that each task's check fails on the untouched fixture, and
      removes everything. Starts no agent and spends no tokens.
  pnpm run compare:agent --run [--task-set <name>] --configuration without|with [--baseline as-shipped|claude-md] [--model <model>] [--tasks <id,id>] [--results <directory>] [--keep]
      Plays every task of the set in one configuration: two sessions each of a signed-in Claude
      Code, which spend real tokens. Run it once per configuration, into the same results directory.
      A task that carries a first-session commit has its first session's work committed with it.
      --baseline claude-md starts the run without Factloom from the set's hand-written CLAUDE.md map.
  pnpm run compare:agent --report <results directory>
      Rebuilds report.md from the run logs in the directory. Starts no agent.

Needs: the claude command on PATH, signed in; Node.js; for --configuration with, network
access to huggingface.co the first time, to download Factloom's embedding model. --model is
passed to claude as it is, such as sonnet; without it, Claude Code uses its default model, and
the report names the model each session reported. The results go to
evals/agent-comparison/results/<date>, with -<task set> after the date for a set other than the
default, unless --results says otherwise.`;

const options = {
  'dry-run': { type: 'boolean' },
  run: { type: 'boolean' },
  report: { type: 'string' },
  configuration: { type: 'string' },
  'task-set': { type: 'string' },
  baseline: { type: 'string' },
  model: { type: 'string' },
  tasks: { type: 'string' },
  results: { type: 'string' },
  keep: { type: 'boolean' },
  help: { type: 'boolean' },
} as const;

/** Writes a line for the person running the comparison. Standard output is kept for the usage. */
function say(message: string): void {
  process.stderr.write(`${message}\n`);
}

function stop(message: string): never {
  say(message);
  process.exit(1);
}

function readConfigurations(value: string | undefined, isRequired: boolean): Configuration[] {
  if (value === undefined) {
    if (isRequired) stop('--run needs --configuration without or --configuration with.');
    return ['without', 'with'];
  }
  if (value === 'without' || value === 'with') return [value];
  return stop(`--configuration is without or with, not ${value}.`);
}

/** The baseline of a run: as shipped, or, for a run without Factloom of a set that has one, its CLAUDE.md map. */
function readBaseline(value: string | undefined, configuration: Configuration, taskSet: TaskSet): Baseline {
  if (value === undefined || value === 'as-shipped') return 'as-shipped';
  if (value !== 'claude-md') return stop(`--baseline is as-shipped or claude-md, not ${value}.`);
  if (configuration !== 'without') return stop('--baseline claude-md is for the run without Factloom.');
  if (taskSet.claudeMdBaseline === null) return stop(`The task set ${taskSet.name} has no CLAUDE.md map.`);
  return 'claude-md';
}

function readTaskSet(value: string | undefined): TaskSet {
  const taskSet = findTaskSet(value ?? DEFAULT_TASK_SET_NAME);
  return taskSet ?? stop(`--task-set is one of ${TASK_SET_NAMES.join(', ')}, not ${value ?? ''}.`);
}

function selectTasks(value: string | undefined, taskSet: TaskSet): AgentTask[] {
  if (value === undefined) return [...taskSet.tasks];
  const ids = value.split(',').map((id) => id.trim());
  const unknown = ids.filter((id) => !taskSet.tasks.some((task) => task.id === id));
  if (unknown.length > 0) stop(`Unknown task: ${unknown.join(', ')}.`);
  return taskSet.tasks.filter((task) => ids.includes(task.id));
}

function readAgentVersion(): string | null {
  try {
    return execFileSync('claude', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** A working tree and, with Factloom, the server configuration of one task's run. */
function prepareTaskRun(task: AgentTask, configuration: Configuration, runStamp: string, taskSet: TaskSet) {
  const workingDirectory = taskSet.prepareCopy();
  // Outside the working tree, so the agent does not find the database among the files.
  const serverDirectory = mkdtempSync(join(tmpdir(), 'factloom-agent-comparison-'));
  let mcpConfigPath: string | null = null;
  let environment: Readonly<Record<string, string>> = {};
  if (configuration === 'with') {
    mcpConfigPath = join(serverDirectory, 'mcp-config.json');
    const server = {
      nodePath: process.execPath,
      serverEntry: SERVER_ENTRY,
      databasePath: join(serverDirectory, 'factloom.db'),
      namespace: `eval:agent-comparison:${task.id}:${runStamp}`,
      repositoryDirectory: workingDirectory,
    };
    writeFileSync(mcpConfigPath, buildFactloomMcpConfig(server));
    environment = buildFactloomHookEnvironment(server);
  }
  const remove = () => {
    rmSync(workingDirectory, { recursive: true, force: true });
    rmSync(serverDirectory, { recursive: true, force: true });
  };
  return { workingDirectory, serverDirectory, mcpConfigPath, environment, remove };
}

async function dryRun(
  configurations: readonly Configuration[],
  tasks: readonly AgentTask[],
  taskSet: TaskSet,
): Promise<void> {
  const version = readAgentVersion();
  say(version === null ? 'claude was not found on PATH.' : `claude --version: ${version}`);
  say(`Factloom server entry: ${SERVER_ENTRY}${existsSync(SERVER_ENTRY) ? '' : ' (missing)'}`);
  let unexpected = 0;
  for (const configuration of configurations) {
    for (const task of tasks) {
      const prepared = prepareTaskRun(task, configuration, 'dry-run', taskSet);
      try {
        const args = (prompt: string) =>
          describeClaudeArguments(
            buildClaudeArguments({
              prompt,
              model: null,
              mcpConfigPath: prepared.mcpConfigPath,
              factloomSettings: buildFactloomRunSettings({ runsMaintenance: taskSet.runsMaintenance }),
            }),
          );
        say(`\n${task.id}, ${configuration} Factloom, in a copy at ${prepared.workingDirectory}`);
        say(`  session 1: claude ${args(task.firstSession).join(' ')}`);
        say(`  session 2: claude ${args(task.secondSession).join(' ')}`);
        if (prepared.mcpConfigPath !== null) {
          say(
            `  ${MCP_CONFIG_PLACEHOLDER}: ${JSON.stringify(JSON.parse(readFileSync(prepared.mcpConfigPath, 'utf8')))}`,
          );
        }
        const check = await runTaskCheck(prepared.workingDirectory, task.id, taskSet.checksDirectory);
        if (check.passed) unexpected += 1;
        say(
          `  check on the untouched fixture: ${check.passed ? 'passes, which it must not' : 'fails, as it must'}`,
        );
      } finally {
        prepared.remove();
      }
    }
  }
  say(
    `\n${tasks.length} tasks, ${tasks.length * 2} sessions per configuration. No agent was started.` +
      (unexpected === 0 ? '' : ` ${unexpected} checks passed on the untouched fixture.`),
  );
  if (unexpected > 0) process.exitCode = 1;
}

/**
 * Plays one session, keeps its raw output if the secret check allows, and logs what it used.
 * Returns whether the agent's output could be read, and what is wrong with its servers if
 * anything is.
 */
async function playAndRecord(input: {
  readonly resultsDirectory: string;
  readonly configuration: Configuration;
  readonly task: AgentTask;
  readonly session: 1 | 2;
  readonly args: readonly string[];
  readonly workingDirectory: string;
  readonly environment: Readonly<Record<string, string>>;
}): Promise<{ readonly isReadable: boolean; readonly serverProblem: string | null }> {
  const { resultsDirectory, configuration, task, session } = input;
  say(`${task.id}, ${configuration} Factloom, session ${session}: playing`);
  const finished = await playClaudeSession({
    args: input.args,
    workingDirectory: input.workingDirectory,
    environment: input.environment,
  });
  const rawPath = join(resultsDirectory, 'raw', `${task.id}-${configuration}-${session}.jsonl`);
  const withheld = writeCheckedFile(rawPath, hideHomeDirectory(finished.output, homedir()));
  const read = readClaudeStream(finished.output);
  const usage = read.ok ? read.value : null;
  const serverProblem = usage === null ? null : findServerProblem(usage, configuration);
  const problems = [
    withheld === null ? null : `The raw output was withheld: ${withheld}`,
    read.ok ? null : read.error.message,
    serverProblem,
    finished.hasTimedOut ? 'The session was interrupted after 30 minutes.' : null,
  ].filter((problem) => problem !== null);
  const problem = problems.length === 0 ? null : problems.join(' ');
  appendRunLogEntry(resultsDirectory, configuration, {
    kind: 'session',
    taskId: task.id,
    session,
    rawFile: withheld === null ? relative(resultsDirectory, rawPath) : null,
    exitCode: finished.exitCode,
    hasTimedOut: finished.hasTimedOut,
    usage,
    problem,
  });
  if (usage !== null) {
    const calls = Object.values(usage.toolCalls).reduce((total, count) => total + count, 0);
    say(
      `  ${usage.model}: ${usage.uncachedInputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens} input tokens, ${usage.outputTokens} output tokens, ${calls} tool calls`,
    );
  }
  if (problem !== null) say(`  ${problem}`);
  return { isReadable: usage !== null, serverProblem };
}

async function run(input: {
  readonly configuration: Configuration;
  readonly baseline: Baseline;
  readonly taskSet: TaskSet;
  readonly tasks: readonly AgentTask[];
  readonly model: string | null;
  readonly resultsDirectory: string;
  readonly keep: boolean;
}): Promise<void> {
  const { configuration, resultsDirectory } = input;
  if (existsSync(findRunLogPath(resultsDirectory, configuration))) {
    stop(
      `${findRunLogPath(resultsDirectory, configuration)} exists already. Give another --results directory.`,
    );
  }
  const agentVersion = readAgentVersion() ?? stop('claude was not found on PATH.');
  if (configuration === 'with') {
    say('Starting the Factloom server once, so that its embedding model is downloaded before any session.');
    await warmUpFactloomServer();
  }
  const startedAt = toTimestamp(new Date());
  const runStamp = startedAt.replace(/[^0-9]/gu, '');
  const factloomSettings = buildFactloomRunSettings({ runsMaintenance: input.taskSet.runsMaintenance });
  const exampleArgs = buildClaudeArguments({
    prompt: '',
    model: input.model,
    mcpConfigPath: configuration === 'with' ? 'path' : null,
    factloomSettings,
  });
  appendRunLogEntry(resultsDirectory, configuration, {
    kind: 'run',
    configuration,
    taskSet: input.taskSet.name,
    baseline: input.baseline,
    startedAt,
    agentVersion,
    agentArguments: describeClaudeArguments(exampleArgs),
    nodeVersion: process.version,
    platform: `${process.platform} ${process.arch}`,
  });
  for (const [index, task] of input.tasks.entries()) {
    const prepared = prepareTaskRun(task, configuration, runStamp, input.taskSet);
    try {
      // The map is written once, before the first session, and never updated, as in practice.
      if (configuration === 'without' && input.baseline === 'claude-md') {
        input.taskSet.claudeMdBaseline?.(prepared.workingDirectory);
      }
      for (const session of [1, 2] as const) {
        const prompt = session === 1 ? task.firstSession : task.secondSession;
        const played = await playAndRecord({
          resultsDirectory,
          configuration,
          task,
          session,
          args: buildClaudeArguments({
            prompt,
            model: input.model,
            mcpConfigPath: prepared.mcpConfigPath,
            factloomSettings,
          }),
          workingDirectory: prepared.workingDirectory,
          environment: prepared.environment,
        });
        // A first session that cannot be read is a set-up problem, so it costs one session only.
        if (index === 0 && session === 1 && !played.isReadable) {
          stop('Stopped after the first session, whose output could not be read. See the run log.');
        }
        // Without the right servers, the sessions would not compare what the report says.
        if (played.serverProblem !== null) stop(`Stopped: ${played.serverProblem}`);
        // The reason goes into the git history in both configurations (FL-081).
        const { commitFirstSession } = input.taskSet;
        if (session === 1 && task.firstSessionCommit !== undefined && commitFirstSession !== null) {
          commitFirstSession(prepared.workingDirectory, task.firstSessionCommit);
        }
        // A teammate's commit between the sessions, the same in both configurations (FL-082).
        if (session === 1) input.taskSet.betweenSessions?.(prepared.workingDirectory, task.id);
      }
      const check = await runTaskCheck(prepared.workingDirectory, task.id, input.taskSet.checksDirectory);
      const checkPath = join(resultsDirectory, 'checks', `${task.id}-${configuration}.txt`);
      const withheld = writeCheckedFile(checkPath, hideHomeDirectory(check.output, homedir()));
      appendRunLogEntry(resultsDirectory, configuration, {
        kind: 'check',
        taskId: task.id,
        passed: check.passed,
        outputFile: withheld === null ? relative(resultsDirectory, checkPath) : null,
      });
      say(`  check: ${check.passed ? 'passed' : 'failed'}`);
      writeReport(resultsDirectory);
    } finally {
      if (input.keep) say(`  kept ${prepared.workingDirectory} and ${prepared.serverDirectory}`);
      else prepared.remove();
    }
  }
  appendRunLogEntry(resultsDirectory, configuration, {
    kind: 'finished',
    finishedAt: toTimestamp(new Date()),
  });
  say(`Report: ${writeReport(resultsDirectory)}`);
}

function readOptions() {
  try {
    return parseArgs({ args: process.argv.slice(2).filter((arg) => arg !== '--'), options, strict: true })
      .values;
  } catch (error) {
    return stop(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
  }
}

const values = readOptions();

if (values.report !== undefined) {
  say(`Report: ${writeReport(values.report)}`);
} else if (values['dry-run'] === true) {
  const taskSet = readTaskSet(values['task-set']);
  await dryRun(readConfigurations(values.configuration, false), selectTasks(values.tasks, taskSet), taskSet);
} else if (values.run === true) {
  const [configuration] = readConfigurations(values.configuration, true);
  if (configuration === undefined) stop('--run needs --configuration without or --configuration with.');
  const taskSet = readTaskSet(values['task-set']);
  const date = toTimestamp(new Date()).slice(0, 10);
  const defaultDirectory = taskSet.name === DEFAULT_TASK_SET_NAME ? date : `${date}-${taskSet.name}`;
  await run({
    configuration,
    baseline: readBaseline(values.baseline, configuration, taskSet),
    taskSet,
    tasks: selectTasks(values.tasks, taskSet),
    model: values.model ?? null,
    resultsDirectory: values.results ?? join(RESULTS_DIRECTORY, defaultDirectory),
    keep: values.keep === true,
  });
} else {
  process.stdout.write(`${USAGE}\n`);
}
