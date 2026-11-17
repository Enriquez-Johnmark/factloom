// Helpers for the tests that run a server entry as a child process and speak to it over
// stdio, as a host does. Not a test file. They import no test framework.
import { type ChildProcess, spawn } from 'node:child_process';

export type FinishedServer = {
  readonly code: number | null;
  readonly standardOutput: string;
  readonly standardError: string;
};

/**
 * Starts a server entry with the given variables and a home directory of its own, so that
 * nothing reaches the real one. Collects both outputs until the process ends.
 */
export function startServerProcess(
  entry: string,
  variables: Readonly<Record<string, string>>,
  home: string,
  args: readonly string[] = [],
) {
  const child: ChildProcess = spawn(process.execPath, [entry, ...args], {
    env: { PATH: process.env.PATH ?? '', HOME: home, ...variables },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let standardOutput = '';
  let standardError = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    standardOutput += chunk.toString('utf8');
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    standardError += chunk.toString('utf8');
  });
  const finished = new Promise<FinishedServer>((resolve) => {
    child.on('exit', (code) => resolve({ code, standardOutput, standardError }));
  });
  return {
    finished,
    readStandardOutput: () => standardOutput,
    /** Writes one JSON-RPC message, a line of JSON. */
    send: (message: unknown) => child.stdin?.write(`${JSON.stringify(message)}\n`),
    /** Closes standard input, as a host does when it goes. */
    close: () => child.stdin?.end(),
  };
}

/** The initialise request of the 2025 protocol era, as the MCP research sent it. */
export const INITIALIZE_REQUEST = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0.0.0' } },
} as const;

export const INITIALIZED_NOTIFICATION = { jsonrpc: '2.0', method: 'notifications/initialized' } as const;

/** Waits until a predicate holds, checking every 20 ms, for at most the given time. */
export async function waitFor(holds: () => boolean, timeout: number): Promise<void> {
  const start = Date.now();
  while (!holds()) {
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for the server.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Every line a server wrote to standard output, each parsed as JSON. */
export function parseOutputLines(standardOutput: string): unknown[] {
  return standardOutput
    .split('\n')
    .filter((line) => line !== '')
    .map((line): unknown => JSON.parse(line));
}
