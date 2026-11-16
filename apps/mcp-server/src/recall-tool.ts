import { recall } from '@factloom/graph-rag';
import { z } from 'zod';
import type { RegisterTool } from './create-factloom-server.ts';
import { readOptionalDate } from './read-optional-date.ts';
import { FactOutputSchema, toFactOutput } from './to-fact-output.ts';
import { toToolError } from './to-tool-error.ts';
import { toToolSuccess } from './to-tool-success.ts';

const DATE_FORMS =
  'A full UTC timestamp such as 2026-03-15T09:30:00.000Z, or a calendar date such as 2026-03-15.';

const RecallInputSchema = z.object({
  question: z.string().min(1).max(2000).describe('What to look for, in natural language.'),
  as_of: z
    .string()
    .optional()
    .describe(
      `Return what was true in the world on this date. Default: the known_at date if one is given, otherwise now. ${DATE_FORMS}`,
    ),
  known_at: z
    .string()
    .optional()
    .describe(`Return what Factloom believed on this date. Default: now. ${DATE_FORMS}`),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Most facts to return, from 1 to 50. Default: 10.'),
});

const RecallOutputSchema = z.object({
  facts: z.array(FactOutputSchema.extend({ score: z.number() })),
});

const DEFAULT_LIMIT = 10;

/** Registers `recall`: finds the facts that answer a question, filtered by time. Read-only. */
export const registerRecallTool: RegisterTool = (server, deps) => {
  server.registerTool(
    'recall',
    {
      title: 'Recall',
      description:
        'Finds the facts in memory that answer a question, best match first, each with its sources. With no date, every fact is current. as_of asks what was true on a date; known_at asks what Factloom believed on a date.',
      inputSchema: RecallInputSchema,
      outputSchema: RecallOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ question, as_of, known_at, limit }) => {
      const validAt = readOptionalDate('as_of', as_of);
      if (!validAt.ok) return toToolError(validAt.error);
      const knownAt = readOptionalDate('known_at', known_at);
      if (!knownAt.ok) return toToolError(knownAt.error);

      const recalled = await recall(deps, {
        namespace: deps.namespace,
        question,
        validAt: validAt.value,
        knownAt: knownAt.value,
        limit: limit ?? DEFAULT_LIMIT,
      });
      if (!recalled.ok) return toToolError(recalled.error);
      return toToolSuccess({
        facts: recalled.value.facts.map((found) => ({ ...toFactOutput(found), score: found.score })),
      });
    },
  );
};
