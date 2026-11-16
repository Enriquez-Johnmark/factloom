// Makes every eval that calls a language model deterministic: a request is answered from a
// recording on disk, and a missing recording stops the run (docs/architecture/TESTING.md,
// "Keeping it deterministic"). Only a caller that asks for record mode reaches the model.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { err, type LlmClient, type LlmTask, ok } from '@factloom/core';
import { z } from 'zod';

type LlmRequest = Parameters<LlmClient['generateObject']>[0];

export type RecordingLlmClientOptions = {
  /** The directory that holds one JSON file per recording. */
  readonly directory: string;
  /**
   * The model the inner client is configured with. The interface does not name a model, so
   * the caller states it, and a change of model gives every request a new key.
   */
  readonly modelLabel: string;
  /** The command that records, named in the error for a missing recording. */
  readonly recordCommand: string;
} & (
  | {
      /** Replay is the default: answer from recordings only. */
      readonly mode?: 'replay';
      /** Never called in replay mode, so it may be absent. */
      readonly inner?: LlmClient;
    }
  | {
      /** Call the inner client and write each successful response as a recording. */
      readonly mode: 'record';
      readonly inner: LlmClient;
    }
);

/** What a recording file holds, in the order it is written. */
const RecordingSchema = z.strictObject({
  task: z.string(),
  model: z.string(),
  instructions: z.string(),
  input: z.string(),
  response: z.unknown(),
});

/** The key of a request: a hash of everything that can change the model's answer. */
function recordingKey(request: LlmRequest, modelLabel: string): string {
  const parts = [
    request.task,
    request.instructions,
    request.input,
    z.toJSONSchema(request.schema),
    modelLabel,
  ];
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

/** A copy of a JSON value with the keys of every object sorted, so that a file's bytes are stable. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, sortKeys(entry)]),
  );
}

function isMissingFile(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

/** Reads a recording's text, or throws an error that says how to make the missing one. */
async function readRecording(path: string, key: string, recordCommand: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (cause) {
    if (!isMissingFile(cause)) throw cause;
    throw new Error(
      `No recording for the key ${key}. Expected the file ${path}. Record it with: ${recordCommand}`,
    );
  }
}

/** Parses a stored response with the request's schema, as a real client parses the model's output. */
function parseRecording<T>(text: string, schema: z.ZodType<T>, task: LlmTask) {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    return err('llm_failed', `The recording for the task "${task}" is not valid JSON.`, { cause });
  }
  const recording = RecordingSchema.safeParse(raw);
  if (!recording.success) {
    return err('llm_failed', `The recording for the task "${task}" is not a recording.`, {
      cause: recording.error,
    });
  }
  const response = schema.safeParse(recording.data.response);
  if (!response.success) {
    return err('llm_failed', `The recorded response no longer matches the schema for the task "${task}".`, {
      cause: response.error,
    });
  }
  return ok(response.data);
}

/**
 * Wraps an `LlmClient` so that it answers from recordings. In replay mode, the default, a
 * request is answered from its recording and a missing one throws, so that no pipeline can
 * mistake it for an ordinary model failure. In record mode the inner client is called, and a
 * successful response is written as a recording and returned; a failure writes nothing.
 */
export function createRecordingLlmClient(options: RecordingLlmClientOptions): LlmClient {
  return {
    async generateObject(request) {
      const key = recordingKey(request, options.modelLabel);
      const path = join(options.directory, `${key}.json`);
      if (options.mode !== 'record') {
        return parseRecording(
          await readRecording(path, key, options.recordCommand),
          request.schema,
          request.task,
        );
      }
      const result = await options.inner.generateObject(request);
      if (!result.ok) return result;
      const recording = {
        task: request.task,
        model: options.modelLabel,
        instructions: request.instructions,
        input: request.input,
        response: sortKeys(result.value),
      };
      await mkdir(options.directory, { recursive: true });
      await writeFile(path, `${JSON.stringify(recording, null, 2)}\n`);
      return result;
    },
  };
}
