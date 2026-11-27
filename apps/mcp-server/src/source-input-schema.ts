import type { SourceInput } from '@kronomind/graph-rag';
import { z } from 'zod';
import type { FileSourceAnchorer } from './anchor-file-source.ts';

/** The optional `source` of the tools that record, as MCP-TOOLS.md defines it. */
export const SourceInputSchema = z
  .object({
    kind: z
      .string()
      .min(1)
      .optional()
      .describe('What kind of source, such as agent_note, conversation or file. Default: agent_note.'),
    locator: z.string().min(1).optional().describe('A path or URL.'),
    version: z.string().min(1).optional().describe('For a file in git, the commit.'),
  })
  .optional()
  .describe('Where it came from. Default: a note from the agent.');

/**
 * Fills in the defaults of a source, as `readSourceInput` does, and gives a file source that
 * names no commit the path from the repository root and the commit HEAD names, when the
 * anchorer can (ADR 0023). A source it cannot anchor stays as given.
 */
export async function readAnchoredSourceInput(
  source: z.infer<typeof SourceInputSchema>,
  anchorFileSource: FileSourceAnchorer | undefined,
): Promise<SourceInput> {
  const read = readSourceInput(source);
  if (
    read.kind !== 'file' ||
    read.locator === null ||
    read.version !== null ||
    anchorFileSource === undefined
  )
    return read;
  const anchored = await anchorFileSource(read.locator);
  return anchored === null ? read : { ...read, ...anchored };
}

/** Fills in the defaults of a source: a note from the agent, with no locator and no version. */
export function readSourceInput(source: z.infer<typeof SourceInputSchema>): SourceInput {
  return {
    kind: source?.kind ?? 'agent_note',
    locator: source?.locator ?? null,
    version: source?.version ?? null,
  };
}
