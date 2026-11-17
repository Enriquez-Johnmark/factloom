import { inspect } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  type AnthropicLlmClientDeps,
  createAnthropicLlmClient,
  type LlmCallReport,
  type SendAnthropicMessage,
} from './create-anthropic-llm-client.ts';

const SchemaForTests = z.strictObject({ name: z.string(), confidence: z.number().min(0).max(1) });
const MODELS = {
  extraction: 'model-extract',
  conflict_detection: 'model-judge',
  verification: 'model-verify',
  entity_matching: 'model-match',
};
/** Stands in for a key. Not a real credential format. */
const MARKER_KEY = 'marker-key-7f3a9c1e';
const INSTRUCTIONS = 'marker-instructions: extract the facts.';
const INPUT = 'marker-input: the shop API uses vitest.';

type StopReason = Anthropic.Message['stop_reason'];

/** A response from the Messages API with one text block, as the SDK types it. */
function responseWith(text: string, stopReason: StopReason = 'end_turn'): Anthropic.Message {
  return {
    id: 'msg-1',
    type: 'message',
    role: 'assistant',
    model: 'model-extract',
    container: null,
    diagnostics: null,
    stop_details: null,
    stop_reason: stopReason,
    stop_sequence: null,
    content: [{ type: 'text', text, citations: null }],
    usage: {
      input_tokens: 120,
      output_tokens: 30,
      cache_creation_input_tokens: 900,
      cache_read_input_tokens: 0,
      cache_creation: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: 'standard',
      speed: null,
    },
  };
}

/** A fake SDK call that answers in turn, and keeps every request it was sent. */
function createFakeSender(answer: () => Promise<Anthropic.Message>) {
  const requests: Parameters<SendAnthropicMessage>[0][] = [];
  const sendMessage: SendAnthropicMessage = (request) => {
    requests.push(request);
    return answer();
  };
  return { sendMessage, requests };
}

function createClient(
  overrides: Partial<AnthropicLlmClientDeps> & Pick<AnthropicLlmClientDeps, 'sendMessage'>,
) {
  const reports: LlmCallReport[] = [];
  const client = createAnthropicLlmClient({
    apiKey: MARKER_KEY,
    models: MODELS,
    logUsage: (report) => reports.push(report),
    ...overrides,
  });
  return { client, reports };
}

function ask(
  client: ReturnType<typeof createClient>['client'],
  task: 'extraction' | 'verification' = 'extraction',
) {
  return client.generateObject({ task, instructions: INSTRUCTIONS, input: INPUT, schema: SchemaForTests });
}

describe('createAnthropicLlmClient', () => {
  it('returns the parsed object when the response matches the schema', async () => {
    const { sendMessage } = createFakeSender(() =>
      Promise.resolve(responseWith('{"name":"vitest","confidence":0.9}')),
    );
    const { client } = createClient({ sendMessage });

    const result = await ask(client);

    expect(result).toEqual({ ok: true, value: { name: 'vitest', confidence: 0.9 } });
  });

  it('returns llm_failed when the response does not match the schema', async () => {
    // A confidence above 1 passes the API's grammar, which drops numeric bounds, and fails here.
    const { sendMessage } = createFakeSender(() =>
      Promise.resolve(responseWith('{"name":"vitest","confidence":1.5}')),
    );
    const { client } = createClient({ sendMessage });

    const result = await ask(client);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('llm_failed');
  });

  it('returns llm_failed when the response is not JSON', async () => {
    const { sendMessage } = createFakeSender(() =>
      Promise.resolve(responseWith('Here are the facts: vitest.')),
    );
    const { client } = createClient({ sendMessage });

    const result = await ask(client);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('llm_failed');
  });

  it('returns llm_failed when the model refuses', async () => {
    const { sendMessage } = createFakeSender(() => Promise.resolve(responseWith('', 'refusal')));
    const { client } = createClient({ sendMessage });

    const result = await ask(client);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('llm_failed');
    expect(result.error.message).toContain('declined');
  });

  it('returns llm_failed when the response stops at the token limit', async () => {
    // Cut off mid-object, but even a complete object is not trusted after `max_tokens`.
    const { sendMessage } = createFakeSender(() =>
      Promise.resolve(responseWith('{"name":"vitest","confidence":0.9}', 'max_tokens')),
    );
    const { client } = createClient({ sendMessage });

    const result = await ask(client);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('llm_failed');
    expect(result.error.message).toContain('token limit');
  });

  it('returns llm_failed when the SDK throws', async () => {
    const failures = [
      new Anthropic.APIError(529, { type: 'overloaded_error' }, 'Overloaded', new Headers()),
      new TypeError('fetch failed'),
    ];
    for (const failure of failures) {
      const { sendMessage } = createFakeSender(() => Promise.reject(failure));
      const { client } = createClient({ sendMessage });

      const result = await ask(client);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('llm_failed');
    }
  });

  it('returns llm_failed without a request when no key is configured', async () => {
    const { sendMessage, requests } = createFakeSender(() =>
      Promise.resolve(responseWith('{"name":"vitest","confidence":0.9}')),
    );
    const { client } = createClient({ sendMessage, apiKey: null });

    const result = await ask(client);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('llm_failed');
    expect(result.error.message).toContain('No Anthropic API key is configured');
    expect(requests).toEqual([]);
  });

  it('uses the model configured for the task', async () => {
    const { sendMessage, requests } = createFakeSender(() =>
      Promise.resolve(responseWith('{"name":"vitest","confidence":0.9}')),
    );
    const { client } = createClient({ sendMessage });

    await ask(client, 'verification');
    await ask(client, 'extraction');

    expect(requests.map((request) => request.params.model)).toEqual(['model-verify', 'model-extract']);
  });

  it('marks the instructions for caching and sends the input after them', async () => {
    const { sendMessage, requests } = createFakeSender(() =>
      Promise.resolve(responseWith('{"name":"vitest","confidence":0.9}')),
    );
    const { client } = createClient({ sendMessage });

    await ask(client);

    const [request] = requests;
    expect(request?.params.system).toEqual([
      { type: 'text', text: INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
    ]);
    expect(request?.params.messages).toEqual([{ role: 'user', content: INPUT }]);
    expect(request?.params.output_config?.format?.type).toBe('json_schema');
  });

  it('reports the task, the model, the stop reason and the token counts of each call', async () => {
    const { sendMessage } = createFakeSender(() =>
      Promise.resolve(responseWith('{"name":"vitest","confidence":0.9}')),
    );
    const { client, reports } = createClient({ sendMessage });

    await ask(client);

    expect(reports).toEqual([
      {
        task: 'extraction',
        model: 'model-extract',
        stopReason: 'end_turn',
        inputTokens: 120,
        outputTokens: 30,
        cacheReadTokens: 0,
        cacheWriteTokens: 900,
      },
    ]);
  });

  it('never exposes the API key', async () => {
    // Each answer carries the key and the prompt, as a misbehaving response or error might.
    const leaky = `${MARKER_KEY} ${INSTRUCTIONS} ${INPUT}`;
    const answers: (() => Promise<Anthropic.Message>)[] = [
      () => Promise.resolve(responseWith(`{"name":"${leaky}","confidence":1.5}`)),
      // A strict object's error names an unrecognised key, so the key itself carries the marker.
      () => Promise.resolve(responseWith(`{"name":"vitest","confidence":0.5,"${leaky}":1}`)),
      () => Promise.resolve(responseWith(`not JSON ${leaky}`)),
      () => Promise.resolve(responseWith(leaky, 'refusal')),
      () => Promise.resolve(responseWith(`{"name":"${leaky}"`, 'max_tokens')),
      () => Promise.reject(new Anthropic.APIError(401, { message: leaky }, leaky, new Headers())),
      () => Promise.reject(new Error(leaky)),
    ];

    for (const answer of answers) {
      const { sendMessage } = createFakeSender(answer);
      const { client, reports } = createClient({ sendMessage });

      const result = await ask(client);

      expect(result.ok).toBe(false);
      const printed = inspect({ result, reports }, { depth: null, showHidden: true });
      expect(printed).not.toContain(MARKER_KEY);
      expect(printed).not.toContain('marker-instructions');
      expect(printed).not.toContain('marker-input');
    }
  });
});
