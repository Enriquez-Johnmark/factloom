import { err, ok, parseDateInput, type Result, type Timestamp } from '@kronomind/core';

/**
 * Reads an optional date field of a tool: absent is null; a full UTC timestamp or a calendar
 * date is a timestamp; anything else is `invalid_input` naming the field. The tool's schema
 * keeps the field a plain string, so that `tools/list` stays small (MCP research, "Schema size").
 */
export function readOptionalDate(field: string, text: string | undefined): Result<Timestamp | null> {
  if (text === undefined) return ok(null);
  const parsed = parseDateInput(text);
  return parsed.ok ? parsed : err('invalid_input', `${field}: ${parsed.error.message}`);
}
