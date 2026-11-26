// Plays one session through Claude Code's non-interactive command line and returns what it
// printed. The flags are from https://code.claude.com/docs/en/headless and
// https://code.claude.com/docs/en/cli-reference, read on 2026-11-25, and from `claude --help` of
// Claude Code 2.1.332, run on the same day without starting a session.
import { spawn } from 'node:child_process';
import type { Configuration } from './compare-runs.ts';
import type { SessionUsage } from './read-claude-stream.ts';

/** The name the Factloom server is registered under, so its tools are `mcp__factloom__<tool>`. */
export const FACTLOOM_SERVER_NAME = 'factloom';

/**
 * Tools the agent may use without a prompt, the same in both configurations so that the
 * permission rules do not differ. Edits are allowed by the permission mode. `Bash(npm test *)`
 * also matches `npm test` with no arguments, per the permission rule syntax of the headless page.
 * `mcp__factloom__*` matches every tool of the server and nothing when it is not registered.
 */
export const ALLOWED_TOOLS = [
  'Bash(node *)',
  'Bash(npm test *)',
  'Bash(npm run *)',
  'Bash(git *)',
  `mcp__${FACTLOOM_SERVER_NAME}__*`,
];

/**
 * The settings of the run with Factloom: Claude Code's auto memory turned off, as the
 * registration guide tells a user to do (FL-079). With both memories, the agent of the first run
 * kept everything in auto memory and never called Factloom. The key is from
 * https://code.claude.com/docs/en/memory.md, read on 2026-11-26. The run without Factloom keeps
 * auto memory, as shipped (FL-074, functional requirement 3).
 */
export const FACTLOOM_RUN_SETTINGS = JSON.stringify({ autoMemoryEnabled: false });

/** What stands in for each prompt in the recorded arguments: the prompts are in the task set. */
export const PROMPT_PLACEHOLDER = '<prompt>';

/** What stands in for the path of the server configuration, which is a temporary file. */
export const MCP_CONFIG_PLACEHOLDER = '<mcp-config.json>';

/** A session that has not ended after this long is interrupted. */
const SESSION_TIMEOUT = 30 * 60_000;

/** After an interrupt, how long the agent has to write its result before it is stopped. */
const INTERRUPT_GRACE = 30_000;

/**
 * The arguments of one non-interactive session. The prompt comes right after `-p`, because
 * `--allowedTools` and `--mcp-config` take several values and would take a prompt after them as
 * one; `--mcp-config` is last for the same reason. Both configurations pass
 * `--strict-mcp-config`, so that only Factloom, when it is registered here, is loaded, and no
 * server from the person's own configuration. The run with Factloom also turns auto memory off.
 */
export function buildClaudeArguments(input: {
  readonly prompt: string;
  readonly model: string | null;
  readonly mcpConfigPath: string | null;
}): string[] {
  return [
    '-p',
    input.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'acceptEdits',
    '--permission-prompts',
    'none',
    '--strict-mcp-config',
    ...(input.model === null ? [] : ['--model', input.model]),
    '--allowedTools',
    ALLOWED_TOOLS.join(','),
    ...(input.mcpConfigPath === null
      ? []
      : ['--settings', FACTLOOM_RUN_SETTINGS, '--mcp-config', input.mcpConfigPath]),
  ];
}

/** The arguments as the results record them: no prompt and no temporary path. */
export function describeClaudeArguments(args: readonly string[]): string[] {
  return args.map((arg, index) => {
    if (index > 0 && args[index - 1] === '-p') return PROMPT_PLACEHOLDER;
    if (index > 0 && args[index - 1] === '--mcp-config') return MCP_CONFIG_PLACEHOLDER;
    return arg;
  });
}

/**
 * The server configuration that registers Factloom, over stdio, with its own database and
 * namespace. `ANTHROPIC_API_KEY` is set to empty, which the server reads as no key, so that
 * `remember` makes no model call of its own: such a call would spend tokens that the agent's
 * usage output does not show.
 */
export function buildFactloomMcpConfig(input: {
  readonly nodePath: string;
  readonly serverEntry: string;
  readonly databasePath: string;
  readonly namespace: string;
}): string {
  return JSON.stringify(
    {
      mcpServers: {
        [FACTLOOM_SERVER_NAME]: {
          type: 'stdio',
          command: input.nodePath,
          args: [input.serverEntry],
          env: {
            FACTLOOM_NAMESPACE: input.namespace,
            FACTLOOM_DB: input.databasePath,
            ANTHROPIC_API_KEY: '',
          },
        },
      },
    },
    null,
    2,
  );
}

/**
 * Says what is wrong with the servers a session reported in its init event, or null when they
 * are as the configuration needs: Factloom connected with it, and absent without it.
 */
export function findServerProblem(usage: SessionUsage, configuration: Configuration): string | null {
  const factloom = usage.mcpServers.find((server) => server.name === FACTLOOM_SERVER_NAME);
  if (configuration === 'without') {
    return factloom === undefined ? null : 'The Factloom server was loaded in a run without it.';
  }
  if (factloom === undefined) return 'The Factloom server was not loaded in a run with it.';
  if (factloom.status !== 'connected') return `The Factloom server's status was ${factloom.status}.`;
  return null;
}

export type FinishedSession = {
  readonly exitCode: number | null;
  readonly output: string;
  readonly hasTimedOut: boolean;
};

/**
 * Runs `claude` with the arguments in the working tree and collects what it prints on standard
 * output. Standard error is not kept. The environment is the person's own, so the agent signs in
 * as it always does; the runner never reads, prints or stores a key from it. The connectors that
 * Claude Code fetches from claude.ai are turned off in both configurations, so that only the
 * servers given here are loaded.
 */
export async function playClaudeSession(input: {
  readonly args: readonly string[];
  readonly workingDirectory: string;
}): Promise<FinishedSession> {
  const child = spawn('claude', input.args, {
    cwd: input.workingDirectory,
    env: { ...process.env, ENABLE_CLAUDEAI_MCP_SERVERS: 'false' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8');
  });
  let hasTimedOut = false;
  // SIGINT ends the turn and lets the agent write its result; SIGTERM would leave it unfinished.
  const interrupt = setTimeout(() => {
    hasTimedOut = true;
    child.kill('SIGINT');
    setTimeout(() => child.kill('SIGTERM'), INTERRUPT_GRACE).unref();
  }, SESSION_TIMEOUT);
  const exitCode = await new Promise<number | null>((resolve) => {
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code));
  });
  clearTimeout(interrupt);
  return { exitCode, output, hasTimedOut };
}
