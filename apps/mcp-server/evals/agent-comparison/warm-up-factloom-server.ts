// Starts the Factloom server once before the runs with it, over stdio as a host does, and asks
// one recall. The first embedding downloads the model into ~/.factloom/models, which can take
// minutes; without this, the first session with Factloom would wait for it inside a tool call,
// and could time out, which would count against Factloom for a reason that is not memory.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/** The server's entry, started by path: evals do not import the app's source. */
export const SERVER_ENTRY = join(import.meta.dirname, '..', '..', 'src', 'main.ts');

/** The download of the model may take this long on a slow connection. */
const WARM_UP_TIMEOUT = 15 * 60_000;

const ResponseSchema = z
  .object({
    id: z.number(),
    result: z
      .object({
        isError: z.boolean().optional(),
        content: z.array(z.object({ text: z.string().optional() }).loose()).optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

/**
 * Starts the server on a throwaway database, initialises it, asks one recall, and stops it.
 * Resolves when the recall has been answered without an error; rejects otherwise.
 */
export async function warmUpFactloomServer(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'factloom-warm-up-'));
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      FACTLOOM_NAMESPACE: 'eval:agent-comparison:warm-up',
      FACTLOOM_DB: join(directory, 'factloom.db'),
      ANTHROPIC_API_KEY: '',
    },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const answers = new Map<number, z.infer<typeof ResponseSchema>>();
  let pending = '';
  child.stdout.on('data', (chunk: Buffer) => {
    pending += chunk.toString('utf8');
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      const parsed = ResponseSchema.safeParse(parseJson(line));
      if (parsed.success) answers.set(parsed.data.id, parsed.data);
    }
  });
  let hasExited = false;
  child.on('close', () => {
    hasExited = true;
  });
  const waitFor = (holds: () => boolean) => waitUntil(() => holds() || hasExited);
  const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
  try {
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'agent-comparison', version: '0.0.0' },
      },
    });
    await waitFor(() => answers.has(1));
    if (!answers.has(1)) throw new Error('The Factloom server stopped before it was initialised.');
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'recall', arguments: { question: 'How are the tests run?' } },
    });
    await waitFor(() => answers.has(2));
    const answer = answers.get(2)?.result;
    if (answer === undefined) throw new Error('The Factloom server stopped or refused the warm-up recall.');
    if (answer.isError === true) {
      const reason = (answer.content ?? []).map((part) => part.text ?? '').join(' ');
      throw new Error(`The Factloom server could not answer the warm-up recall: ${reason}`);
    }
  } finally {
    child.stdin.end();
    child.kill();
    rmSync(directory, { recursive: true, force: true });
  }
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

async function waitUntil(holds: () => boolean): Promise<void> {
  const start = Date.now();
  while (!holds()) {
    if (Date.now() - start > WARM_UP_TIMEOUT) throw new Error('The Factloom server did not answer in time.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
