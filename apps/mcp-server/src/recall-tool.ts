import { recall } from '@kronomind/graph-rag';
import { z } from 'zod';
import type { RegisterTool, ServerDeps } from './create-factloom-server.ts';
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
  include_archived: z
    .boolean()
    .optional()
    .describe(
      'Also return archived facts: facts left out because they have not been used for a long time. A question with as_of or known_at always includes them. Default: false.',
    ),
});

const RecallOutputSchema = z.object({
  facts: z.array(
    FactOutputSchema.extend({
      score: z.number(),
      archived_at: z
        .string()
        .nullable()
        .describe('When the fact was archived, or null when it is not archived.'),
    }),
  ),
});

const DEFAULT_LIMIT = 10;

/** Registers `recall`: finds the facts that answer a question, filtered by time. Read-only. */
/**
 * Records that recall returned these facts, after the result is produced and without waiting
 * for it: the handler's one step beyond translating (MCP-TOOLS.md, "What a handler does"). A
 * failure is logged and dropped; a lost update is acceptable, because usage is bookkeeping.
 */
function recordUsage(deps: ServerDeps, factIds: readonly string[]): void {
  if (factIds.length === 0) return;
  const logFailure = (reason: string) => deps.log(`The usage of recalled facts was not recorded: ${reason}`);
  try {
    void deps.store.recordFactUsage({ namespace: deps.namespace, factIds, recalledAt: deps.now() }).then(
      (written) => {
        if (!written.ok) logFailure(written.error.code);
      },
      (cause: unknown) => logFailure(cause instanceof Error ? cause.message : String(cause)),
    );
  } catch (cause) {
    logFailure(cause instanceof Error ? cause.message : String(cause));
  }
}

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
    async ({ question, as_of, known_at, limit, include_archived }) => {
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
        includeArchived: include_archived ?? false,
      });
      if (!recalled.ok) return toToolError(recalled.error);
      recordUsage(
        deps,
        recalled.value.facts.map((found) => found.fact.id),
      );
      return toToolSuccess({
        facts: recalled.value.facts.map((found) => ({
          ...toFactOutput(found),
          score: found.score,
          archived_at: found.archivedAt,
        })),
      });
    },
  );
};
