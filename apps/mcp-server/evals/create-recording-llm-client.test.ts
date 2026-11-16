import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { err, type LlmClient, ok } from '@factloom/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createRecordingLlmClient } from './create-recording-llm-client.ts';

const PortSchema = z.strictObject({ port: z.string() });
const REQUEST = {
  task: 'extraction',
  instructions: 'Extract the port.',
  input: 'The local Redis listens on port 6379.',
  schema: PortSchema,
} as const;
const MODEL = 'claude-haiku-5-5';
const RECORD_COMMAND = 'pnpm eval:record';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'factloom-recordings-'));
  directories.push(directory);
  return directory;
}

/** An inner client that answers every request with the given response, and counts its calls. */
function answering(response: unknown): LlmClient & { readonly calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    generateObject(request) {
      calls += 1;
      const parsed = request.schema.safeParse(response);
      return Promise.resolve(parsed.success ? ok(parsed.data) : err('llm_failed', 'No match.'));
    },
  };
}

/** An inner client that fails the test if it is called. */
const UNREACHABLE: LlmClient = {
  generateObject() {
    throw new Error('The inner client was called in replay mode.');
  },
};

type LlmRequest = Parameters<LlmClient['generateObject']>[0];

async function record(
  directory: string,
  response: unknown,
  request: LlmRequest = REQUEST,
  modelLabel = MODEL,
) {
  const client = createRecordingLlmClient({
    directory,
    modelLabel,
    recordCommand: RECORD_COMMAND,
    mode: 'record',
    inner: answering(response),
  });
  return client.generateObject(request);
}

function replaying(directory: string, modelLabel = MODEL): LlmClient {
  return createRecordingLlmClient({
    directory,
    modelLabel,
    recordCommand: RECORD_COMMAND,
    inner: UNREACHABLE,
  });
}

describe('createRecordingLlmClient', () => {
  it('replays a recorded response without calling the inner client', async () => {
    const directory = await temporaryDirectory();
    await record(directory, { port: '6379' });

    const result = await replaying(directory).generateObject(REQUEST);

    expect(result).toEqual(ok({ port: '6379' }));
  });

  it('replays with no inner client at all', async () => {
    const directory = await temporaryDirectory();
    await record(directory, { port: '6379' });
    const client = createRecordingLlmClient({ directory, modelLabel: MODEL, recordCommand: RECORD_COMMAND });

    const result = await client.generateObject(REQUEST);

    expect(result.ok).toBe(true);
  });

  it('throws and names the missing recording when none exists', async () => {
    const directory = await temporaryDirectory();

    const replay = replaying(directory).generateObject(REQUEST);

    await expect(replay).rejects.toThrow(/^No recording for the key [0-9a-f]{64}\. /);
    await expect(replay).rejects.toThrow(join(directory, ''));
    await expect(replay).rejects.toThrow(`Record it with: ${RECORD_COMMAND}`);
  });

  it('records a response and then replays it', async () => {
    const directory = await temporaryDirectory();

    const recorded = await record(directory, { port: '6379' });
    const replayed = await replaying(directory).generateObject(REQUEST);

    expect(recorded).toEqual(ok({ port: '6379' }));
    expect(replayed).toEqual(recorded);
  });

  const CHANGES = [
    ['the instructions', { ...REQUEST, instructions: 'Extract the port number.' }, MODEL],
    ['the input', { ...REQUEST, input: 'The local Redis listens on port 6380.' }, MODEL],
    ['the task', { ...REQUEST, task: 'verification' }, MODEL],
    ['the schema', { ...REQUEST, schema: z.strictObject({ port: z.string(), host: z.string() }) }, MODEL],
    ['the model label', REQUEST, 'claude-sonnet-5-5'],
  ] as const;

  for (const [changed, request, modelLabel] of CHANGES) {
    it(`uses another recording when ${changed} change${changed === 'the instructions' ? '' : 's'}`, async () => {
      const directory = await temporaryDirectory();
      await record(directory, { port: '6379' });

      const replay = replaying(directory, modelLabel).generateObject(request);

      await expect(replay).rejects.toThrow(/^No recording for the key /);
    });
  }

  it('returns llm_failed when a recording no longer matches the schema', async () => {
    const directory = await temporaryDirectory();
    await record(directory, { port: 'six thousand' });
    // A refinement is not part of the JSON Schema form, so the key stays the same.
    const numericPort = z.strictObject({ port: z.string().refine((port) => /^\d+$/.test(port)) });

    const result = await replaying(directory).generateObject({ ...REQUEST, schema: numericPort });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('llm_failed');
  });

  it('returns llm_failed when a recording file is not a recording', async () => {
    const directory = await temporaryDirectory();
    await record(directory, { port: '6379' });
    const [fileName] = await readdir(directory);
    await writeFile(join(directory, fileName ?? ''), '{"response": {"port": "6379"}}');

    const result = await replaying(directory).generateObject(REQUEST);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('llm_failed');
  });

  it('writes nothing when the inner client fails', async () => {
    const directory = await temporaryDirectory();

    const result = await record(directory, { port: 6379 });

    expect(result.ok).toBe(false);
    expect(await readdir(directory)).toEqual([]);
  });

  it('writes the same bytes when the same response is recorded twice', async () => {
    const directory = await temporaryDirectory();
    await record(directory, { port: '6379' });
    const [fileName] = await readdir(directory);
    const first = await readFile(join(directory, fileName ?? ''));

    await record(directory, { port: '6379' });

    expect(await readdir(directory)).toEqual([fileName]);
    expect(await readFile(join(directory, fileName ?? ''))).toEqual(first);
  });

  it('a recording holds only the task, the model label, the instructions, the input and the response', async () => {
    const directory = await temporaryDirectory();
    await record(directory, { port: '6379' });
    const [fileName] = await readdir(directory);

    const recording: unknown = JSON.parse(await readFile(join(directory, fileName ?? ''), 'utf8'));

    expect(recording).toEqual({
      task: 'extraction',
      model: MODEL,
      instructions: REQUEST.instructions,
      input: REQUEST.input,
      response: { port: '6379' },
    });
    expect(Object.keys(z.record(z.string(), z.unknown()).parse(recording))).toEqual([
      'task',
      'model',
      'instructions',
      'input',
      'response',
    ]);
  });

  it('writes the keys of the response in sorted order', async () => {
    const directory = await temporaryDirectory();
    const schema = z.strictObject({ subject: z.string(), object: z.string() });

    await record(directory, { subject: 'Redis', object: '6379' }, { ...REQUEST, schema });

    const [fileName] = await readdir(directory);
    const text = await readFile(join(directory, fileName ?? ''), 'utf8');
    expect(text.indexOf('"object"')).toBeLessThan(text.indexOf('"subject"'));
  });
});
