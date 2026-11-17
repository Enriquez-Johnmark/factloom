// Helpers for the tests that run a server entry as a child process and speak to it over
// stdio, as a host does. Not a test file. They import no test framework.
import { type ChildProcess, spawn } from 'node:child_process';
import { z } from 'zod';

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

const ResponseSchema = z.object({ jsonrpc: z.literal('2.0'), id: z.number() }).loose();

/**
 * Runs one server process as a host does: it is initialised, each request is sent once the
 * one before it has been answered, and standard input is then closed. Returns the answer to
 * each request, both outputs, the exit code, and how long after the start each answer came.
 * Throws, with what the server wrote to standard error, if it stops or a request takes longer
 * than `timeout` milliseconds.
 */
export async function runServerRequests(session: {
  readonly entry: string;
  readonly variables: Readonly<Record<string, string>>;
  readonly home: string;
  readonly requests: readonly { readonly method: string; readonly params: unknown }[];
  readonly timeout: number;
}) {
  const startedAt = Date.now();
  const server = startServerProcess(session.entry, session.variables, session.home);
  let finished: FinishedServer | null = null;
  void server.finished.then((result) => {
    finished = result;
  });
  const responseTo = (id: number) =>
    parseOutputLines(server.readStandardOutput())
      .map((line) => ResponseSchema.safeParse(line))
      .find((parsed) => parsed.success && parsed.data.id === id)?.data;
  const awaitResponse = async (id: number) => {
    await waitFor(() => responseTo(id) !== undefined || finished !== null, session.timeout);
    const response = responseTo(id);
    if (response === undefined) {
      throw new Error(`The server stopped before answering request ${id}: ${finished?.standardError ?? ''}`);
    }
    return response;
  };
  server.send(INITIALIZE_REQUEST);
  await awaitResponse(1);
  server.send(INITIALIZED_NOTIFICATION);
  const answers: unknown[] = [];
  const answeredAt: number[] = [];
  for (const [index, request] of session.requests.entries()) {
    const id = index + 2;
    server.send({ jsonrpc: '2.0', id, ...request });
    answers.push((await awaitResponse(id)).result);
    answeredAt.push(Date.now() - startedAt);
  }
  server.close();
  return { answers, answeredAt, ...(await server.finished) };
}
