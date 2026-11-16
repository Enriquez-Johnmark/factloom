import type { CallToolResult } from '@modelcontextprotocol/server';

/** Returns a tool's output both as structured content and as the same JSON in text. */
export function toToolSuccess(output: Record<string, unknown>): CallToolResult {
  return { structuredContent: output, content: [{ type: 'text', text: JSON.stringify(output) }] };
}
