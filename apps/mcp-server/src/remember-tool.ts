import { remember } from '@factloom/graph-rag';
import { z } from 'zod';
import type { RegisterTool } from './create-factloom-server.ts';
import { readAnchoredSourceInput, SourceInputSchema } from './source-input-schema.ts';
import { RecordedFactOutputSchema, toRecordedFactOutput } from './to-recorded-fact-output.ts';
import { toToolError } from './to-tool-error.ts';
import { toToolSuccess } from './to-tool-success.ts';

const RememberInputSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(20_000)
    .describe('What to remember, in natural language, up to 20,000 characters.'),
  source: SourceInputSchema,
});

const RememberOutputSchema = z.object({
  facts: z.array(RecordedFactOutputSchema),
  skipped: z.array(
    z.object({
      statement: z.string(),
      reason: z.enum(['conflicts_with_stored_fact', 'conflicts_within_text', 'proposal_stored']),
      conflicting_fact_ids: z.array(z.string()),
      /** The proposal stored in its place under human_approval (FL-070), or null. */
      proposal_id: z.string().nullable(),
    }),
  ),
});

/** Said with every `llm_failed`, so that the agent knows how to save the fact anyway. */
const RECORD_FACT_HINT = 'record_fact records a fact with no LLM call.';

/**
 * Registers `remember`: extracts facts from text with the LLM and records them. Open-world,
 * because the text goes to the LLM provider.
 */
export const registerRememberTool: RegisterTool = (server, deps) => {
  server.registerTool(
    'remember',
    {
      title: 'Remember',
      description:
        'Extracts facts from a text and records them, each with when it was true and the text as its source. A fact already in memory gains the source. When the text says a stored fact ended or was wrong, the stored fact is ended or invalidated and the new fact, returned with supersedes, takes its place; any other fact that contradicts a stored one is returned in skipped, with the facts in the way. Needs an Anthropic API key; without one, use record_fact.',
      inputSchema: RememberInputSchema,
      outputSchema: RememberOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ text, source }) => {
      const remembered = await remember(deps, {
        namespace: deps.namespace,
        text,
        source: await readAnchoredSourceInput(source, deps.anchorFileSource),
        trigger: 'agent',
      });
      if (!remembered.ok) {
        const { error } = remembered;
        return toToolError(
          error.code === 'llm_failed' ? { ...error, message: `${error.message} ${RECORD_FACT_HINT}` } : error,
        );
      }
      return toToolSuccess({
        facts: remembered.value.facts.map(toRecordedFactOutput),
        skipped: remembered.value.skipped.map((skipped) => ({
          statement: skipped.statement,
          reason: skipped.reason,
          conflicting_fact_ids: [...skipped.conflictingFactIds],
          proposal_id: skipped.proposalId,
        })),
      });
    },
  );
};
