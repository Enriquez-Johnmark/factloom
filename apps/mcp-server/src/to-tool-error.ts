import type { FactloomError } from '@factloom/core';
import type { CallToolResult } from '@modelcontextprotocol/server';

/**
 * Translates a failed `Result` into a tool result the model sees: `isError`, and a text that
 * starts with the error code, then the message, then the related facts when there are any
 * (MCP-TOOLS.md, "Errors").
 */
export function toToolError(error: FactloomError): CallToolResult {
  const related =
    error.relatedFactIds.length > 0 ? ` Related facts: ${error.relatedFactIds.join(', ')}.` : '';
  return { isError: true, content: [{ type: 'text', text: `${error.code}: ${error.message}${related}` }] };
}
