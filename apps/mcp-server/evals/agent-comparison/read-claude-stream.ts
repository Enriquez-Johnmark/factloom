// Reads what one Claude Code session reported about itself, from the stream-json output of a
// non-interactive run (`claude -p --output-format stream-json --verbose`). Every figure comes
// from that output; nothing is estimated (functional requirement 4).
//
// Where each figure comes from, per https://code.claude.com/docs/en/agent-sdk/typescript and
// https://code.claude.com/docs/en/agent-sdk/cost-tracking, read on 2026-11-25:
// - the model and the agent's version: the `system` event with subtype `init`;
// - tokens: `modelUsage` of the last `result` event, summed over its models. It counts the main
//   loop, subagents and internal calls such as compaction; the result's `usage` counts the main
//   loop only, and the documentation says to prefer `modelUsage` for token accounting;
// - tool calls: the `tool_use` blocks in the `message.content` of `assistant` events, counted
//   once per block id. Several assistant events of one step can share a message, so a block is
//   never counted twice. A subagent's tool calls are emitted too, and are counted.
import { err, ok, type Result } from '@kronomind/core';
import { z } from 'zod';

/** What one session used, as the agent reported it. */
export const SessionUsageSchema = z.strictObject({
  agentVersion: z.string(),
  /** The session's model, from the init event. */
  model: z.string(),
  /** Every model that `modelUsage` names, such as a smaller one for internal calls. */
  modelsUsed: z.array(z.string()),
  mcpServers: z.array(z.strictObject({ name: z.string(), status: z.string() })),
  /** Input tokens that were neither written to nor read from the prompt cache. */
  uncachedInputTokens: z.number().int().nonnegative(),
  cacheCreationInputTokens: z.number().int().nonnegative(),
  cacheReadInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  /** The number of tool calls, by tool name. */
  toolCalls: z.record(z.string(), z.number().int().positive()),
  resultSubtype: z.string(),
  isError: z.boolean(),
  turns: z.number().int().nonnegative(),
  /** More than one means background work started another turn; the last result is used. */
  resultEvents: z.number().int().positive(),
});
export type SessionUsage = z.infer<typeof SessionUsageSchema>;

const EventTypeSchema = z.object({ type: z.string(), subtype: z.string().optional() }).loose();

const InitEventSchema = z
  .object({
    type: z.literal('system'),
    subtype: z.literal('init'),
    model: z.string(),
    claude_code_version: z.string(),
    mcp_servers: z.array(z.object({ name: z.string(), status: z.string() }).loose()),
  })
  .loose();

const AssistantEventSchema = z
  .object({ type: z.literal('assistant'), message: z.object({ content: z.array(z.unknown()) }).loose() })
  .loose();

const ToolUseBlockSchema = z
  .object({ type: z.literal('tool_use'), id: z.string(), name: z.string() })
  .loose();

const ModelUsageSchema = z
  .object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadInputTokens: z.number(),
    cacheCreationInputTokens: z.number(),
  })
  .loose();

const ResultEventSchema = z
  .object({
    type: z.literal('result'),
    subtype: z.string(),
    is_error: z.boolean(),
    num_turns: z.number(),
    modelUsage: z.record(z.string(), ModelUsageSchema),
  })
  .loose();

type InitEvent = z.infer<typeof InitEventSchema>;
type ResultEvent = z.infer<typeof ResultEventSchema>;

/**
 * Reads the stream-json output of one session into what it used. Fails with `invalid_input`
 * when a line is not JSON, or when the init or the result event is missing or has another
 * shape than the documentation gives. An error names the line number, never the line's text.
 */
export function readClaudeStream(output: string): Result<SessionUsage> {
  let init: InitEvent | null = null;
  let result: ResultEvent | null = null;
  let resultEvents = 0;
  const toolNames = new Map<string, string>();
  const lines = output.split('\n');
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue;
    const event = parseLine(line);
    if (event === null) return err('invalid_input', `Line ${index + 1} of the session output is not JSON.`);
    const kind = EventTypeSchema.safeParse(event);
    if (!kind.success) continue;
    if (kind.data.type === 'system' && kind.data.subtype === 'init') {
      const parsed = InitEventSchema.safeParse(event);
      if (!parsed.success) return describeMismatch('init', index, parsed.error);
      init = parsed.data;
    } else if (kind.data.type === 'assistant') {
      const parsed = AssistantEventSchema.safeParse(event);
      if (!parsed.success) return describeMismatch('assistant', index, parsed.error);
      for (const block of parsed.data.message.content) {
        const toolUse = ToolUseBlockSchema.safeParse(block);
        if (toolUse.success) toolNames.set(toolUse.data.id, toolUse.data.name);
      }
    } else if (kind.data.type === 'result') {
      const parsed = ResultEventSchema.safeParse(event);
      if (!parsed.success) return describeMismatch('result', index, parsed.error);
      result = parsed.data;
      resultEvents += 1;
    }
  }
  if (init === null) return err('invalid_input', 'The session output has no init event.');
  if (result === null) return err('invalid_input', 'The session output has no result event.');
  return ok(summarise(init, result, resultEvents, [...toolNames.values()]));
}

function summarise(
  init: InitEvent,
  result: ResultEvent,
  resultEvents: number,
  toolNames: readonly string[],
): SessionUsage {
  const models = Object.values(result.modelUsage);
  const sum = (field: 'inputTokens' | 'outputTokens' | 'cacheReadInputTokens' | 'cacheCreationInputTokens') =>
    models.reduce((total, usage) => total + usage[field], 0);
  const toolCalls: Record<string, number> = {};
  for (const name of toolNames) toolCalls[name] = (toolCalls[name] ?? 0) + 1;
  return {
    agentVersion: init.claude_code_version,
    model: init.model,
    modelsUsed: Object.keys(result.modelUsage).sort(),
    mcpServers: init.mcp_servers.map((server) => ({ name: server.name, status: server.status })),
    uncachedInputTokens: sum('inputTokens'),
    cacheCreationInputTokens: sum('cacheCreationInputTokens'),
    cacheReadInputTokens: sum('cacheReadInputTokens'),
    outputTokens: sum('outputTokens'),
    toolCalls,
    resultSubtype: result.subtype,
    isError: result.is_error,
    turns: result.num_turns,
    resultEvents,
  };
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function describeMismatch(kind: string, index: number, error: z.ZodError): Result<never> {
  const fields = error.issues.map((issue) => issue.path.join('.') || '(the event)').join(', ');
  return err(
    'invalid_input',
    `Line ${index + 1}: the ${kind} event differs from the documented shape at ${fields}.`,
  );
}
