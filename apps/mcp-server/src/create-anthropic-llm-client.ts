import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { err, type LlmClient, type LlmTask, ok, type Result } from '@kronomind/core';
import type { z } from 'zod';

/** Which model answers each task. */
export type LlmModelMap = Readonly<Record<LlmTask, string>>;

/**
 * For every task, the smallest current model, as the LLM research recommends
 * (docs/research/technical/llm-anthropic.md, section 2 and "Recommendation"). Q-31 and Q-32
 * decide later whether extraction needs a stronger one.
 */
export const DEFAULT_LLM_MODELS: LlmModelMap = {
  extraction: 'claude-haiku-5-5',
  conflict_detection: 'claude-haiku-5-5',
  verification: 'claude-haiku-5-5',
  entity_matching: 'claude-haiku-5-5',
};

/**
 * The most output tokens one call may use. 16,000 keeps a non-streaming request well inside
 * the SDK's HTTP timeout, as the Claude API guidance for the SDK advises; an extraction
 * response is far shorter.
 */
const MAX_OUTPUT_TOKENS = 16_000;

/** What one call cost and how it ended. The data open question Q-33 asks for. */
export type LlmCallReport = {
  readonly task: LlmTask;
  readonly model: string;
  readonly stopReason: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
};

/** Sends one request to the Messages API. Tests pass a fake; `createAnthropicMessageSender` is the real one. */
export type SendAnthropicMessage = (request: {
  readonly apiKey: string;
  readonly params: Anthropic.MessageCreateParamsNonStreaming;
}) => Promise<Anthropic.Message>;

export type AnthropicLlmClientDeps = {
  /** Null when no key is configured: the client is still built, and every call fails without a request. */
  readonly apiKey: string | null;
  readonly models: LlmModelMap;
  readonly logUsage: (report: LlmCallReport) => void;
  readonly sendMessage: SendAnthropicMessage;
};

/**
 * Creates the real `SendAnthropicMessage`: one SDK client per key, created on first use. The
 * SDK's own retries of transport errors are left at their default.
 */
export function createAnthropicMessageSender(): SendAnthropicMessage {
  const clients = new Map<string, Anthropic>();
  return ({ apiKey, params }) => {
    let client = clients.get(apiKey);
    if (client === undefined) {
      client = new Anthropic({ apiKey });
      clients.set(apiKey, client);
    }
    return client.messages.create(params);
  };
}

/**
 * Describes a thrown error without its message or the error itself, either of which can
 * hold the request, the response or a header. The HTTP status is enough to act on.
 */
function describeThrown(thrown: unknown): string {
  if (thrown instanceof Anthropic.APIError && thrown.status !== undefined) {
    return `The Anthropic API answered with HTTP status ${thrown.status}.`;
  }
  const kind = thrown instanceof Error ? thrown.name : typeof thrown;
  return `The request to the Anthropic API failed (${kind}).`;
}

function reportOf(task: LlmTask, model: string, message: Anthropic.Message): LlmCallReport {
  return {
    task,
    model,
    stopReason: message.stop_reason,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };
}

/** Reads the object from a finished response and checks it against the original schema, on the client. */
function readObject<T>(message: Anthropic.Message, schema: z.ZodType<T>): Result<T> {
  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return err('llm_failed', 'The model did not return JSON.');
  }
  const checked = schema.safeParse(parsed);
  // The issues are not passed on: they can quote the model's output, such as an unrecognised key.
  return checked.success
    ? ok(checked.data)
    : err('llm_failed', 'The model returned an object that does not match the schema.');
}

/**
 * Creates an `LlmClient` on the Anthropic Messages API. The instructions are the system
 * prompt and carry the cache breakpoint, so calls with the same task, instructions and schema
 * reuse the cached prefix; the input is the one user message, after it. Every failure is
 * `llm_failed`, and no error or log line contains the key, the prompt or the output.
 */
export function createAnthropicLlmClient(deps: AnthropicLlmClientDeps): LlmClient {
  return {
    async generateObject({ task, instructions, input, schema }) {
      if (deps.apiKey === null) {
        return err(
          'llm_failed',
          'No Anthropic API key is configured, so no model can be asked. Set ANTHROPIC_API_KEY.',
        );
      }
      const model = deps.models[task];
      // Structured output as the research describes it (section 3), sent with `create` rather
      // than `parse`: `parse` throws on a response it cannot read, which would hide the stop
      // reason and the usage of a refusal or a response cut off at the token limit.
      const format = zodOutputFormat(schema);
      let message: Anthropic.Message;
      try {
        message = await deps.sendMessage({
          apiKey: deps.apiKey,
          params: {
            model,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: [{ type: 'text', text: instructions, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: input }],
            output_config: { format: { type: format.type, schema: format.schema } },
          },
        });
      } catch (thrown) {
        return err('llm_failed', describeThrown(thrown));
      }
      deps.logUsage(reportOf(task, model, message));

      if (message.stop_reason === 'refusal') return err('llm_failed', 'The model declined the request.');
      if (message.stop_reason === 'max_tokens') {
        return err('llm_failed', 'The response stopped at the token limit before it was complete.');
      }
      return readObject(message, schema);
    },
  };
}
