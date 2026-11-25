import { describe, expect, it } from 'vitest';
import { readClaudeStream } from './read-claude-stream.ts';

// A stream of the documented shape, written by hand: an init event, a step with a text and two
// tool calls split over two assistant events that share one message, a subagent's tool call,
// the tool results, and the result event with two models.
const INIT = {
  type: 'system',
  subtype: 'init',
  session_id: 's-1',
  model: 'claude-test-model',
  claude_code_version: '2.1.332',
  cwd: '/tmp/invoice-service-abc',
  tools: ['Read', 'Edit', 'Bash'],
  mcp_servers: [{ name: 'factloom', status: 'connected' }],
};
const STEP_ONE_PART_ONE = {
  type: 'assistant',
  parent_tool_use_id: null,
  message: {
    id: 'msg_1',
    content: [
      { type: 'text', text: 'Looking at the code.' },
      { type: 'tool_use', id: 'toolu_1', name: 'mcp__factloom__recall', input: { question: 'refunds' } },
    ],
    usage: { input_tokens: 10, output_tokens: 5 },
  },
};
const STEP_ONE_PART_TWO = {
  type: 'assistant',
  parent_tool_use_id: null,
  message: {
    id: 'msg_1',
    content: [{ type: 'tool_use', id: 'toolu_2', name: 'Read', input: { file_path: 'lib/money.js' } }],
    usage: { input_tokens: 10, output_tokens: 5 },
  },
};
const SUBAGENT_STEP = {
  type: 'assistant',
  parent_tool_use_id: 'toolu_9',
  message: {
    id: 'msg_2',
    content: [
      { type: 'tool_use', id: 'toolu_3', name: 'Read', input: { file_path: 'lib/dates.js' } },
      { type: 'tool_use', id: 'toolu_4', name: 'Grep', input: { pattern: 'UTC' } },
    ],
  },
};
const TOOL_RESULTS = {
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'no facts' }] },
};
const RESULT = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 4,
  result: 'Done.',
  total_cost_usd: 0.05,
  usage: { input_tokens: 1, output_tokens: 2 },
  modelUsage: {
    'claude-test-model': {
      inputTokens: 120,
      outputTokens: 300,
      cacheReadInputTokens: 4000,
      cacheCreationInputTokens: 900,
      webSearchRequests: 0,
      costUSD: 0.04,
      contextWindow: 200000,
      maxOutputTokens: 32000,
    },
    'claude-small-model': {
      inputTokens: 30,
      outputTokens: 20,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 50,
      webSearchRequests: 0,
      costUSD: 0.01,
      contextWindow: 200000,
      maxOutputTokens: 8000,
    },
  },
  permission_denials: [],
};

function toStream(events: readonly unknown[]): string {
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
}

const FULL_STREAM = toStream([
  INIT,
  STEP_ONE_PART_ONE,
  STEP_ONE_PART_TWO,
  SUBAGENT_STEP,
  TOOL_RESULTS,
  RESULT,
]);

describe('reading a Claude Code session', () => {
  it('sums the tokens of every model in the result', () => {
    const read = readClaudeStream(FULL_STREAM);

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    // 120 + 30, 900 + 50, 4000 + 0, 300 + 20.
    expect(read.value.uncachedInputTokens).toBe(150);
    expect(read.value.cacheCreationInputTokens).toBe(950);
    expect(read.value.cacheReadInputTokens).toBe(4000);
    expect(read.value.outputTokens).toBe(320);
    expect(read.value.modelsUsed).toEqual(['claude-small-model', 'claude-test-model']);
  });

  it('counts each tool call once, by tool, including those of a subagent', () => {
    const read = readClaudeStream(FULL_STREAM);

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.toolCalls).toEqual({ mcp__factloom__recall: 1, Read: 2, Grep: 1 });
  });

  it('counts a tool call repeated in a later event of the same message once', () => {
    const repeated = toStream([INIT, STEP_ONE_PART_ONE, STEP_ONE_PART_ONE, RESULT]);

    const read = readClaudeStream(repeated);

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.toolCalls).toEqual({ mcp__factloom__recall: 1 });
  });

  it('takes the model, the version and the servers from the init event', () => {
    const read = readClaudeStream(FULL_STREAM);

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.model).toBe('claude-test-model');
    expect(read.value.agentVersion).toBe('2.1.332');
    expect(read.value.mcpServers).toEqual([{ name: 'factloom', status: 'connected' }]);
    expect(read.value.turns).toBe(4);
    expect(read.value.resultSubtype).toBe('success');
  });

  it('uses the last result when background work started another turn', () => {
    const later = {
      ...RESULT,
      num_turns: 6,
      modelUsage: {
        'claude-test-model': {
          inputTokens: 200,
          outputTokens: 400,
          cacheReadInputTokens: 5000,
          cacheCreationInputTokens: 1000,
        },
      },
    };

    const read = readClaudeStream(toStream([INIT, RESULT, later]));

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.resultEvents).toBe(2);
    expect(read.value.uncachedInputTokens).toBe(200);
    expect(read.value.turns).toBe(6);
  });

  it('reports no tool call for a session that made none', () => {
    const read = readClaudeStream(toStream([INIT, RESULT]));

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.toolCalls).toEqual({});
  });

  it('refuses output without a result event', () => {
    const read = readClaudeStream(toStream([INIT, STEP_ONE_PART_ONE]));

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error.code).toBe('invalid_input');
  });

  it('refuses a result event without modelUsage, so that nothing is estimated', () => {
    const { modelUsage: _left, ...withoutModelUsage } = RESULT;

    const read = readClaudeStream(toStream([INIT, withoutModelUsage]));

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error.code).toBe('invalid_input');
  });

  it('refuses a line that is not JSON and does not repeat it', () => {
    const read = readClaudeStream(`${JSON.stringify(INIT)}\nsk-not-json-text\n`);

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error.code).toBe('invalid_input');
    expect(read.error.message).not.toContain('sk-not-json-text');
  });
});
