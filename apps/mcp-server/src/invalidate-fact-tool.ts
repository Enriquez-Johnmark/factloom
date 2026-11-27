import type { StructuredFactInput } from '@kronomind/graph-rag';
import { changeFact } from '@kronomind/graph-rag';
import { z } from 'zod';
import type { RegisterTool } from './create-kronomind-server.ts';
import { buildFactInputShape, readFactInput } from './fact-input-schema.ts';
import { readOptionalDate } from './read-optional-date.ts';
import { toToolError } from './to-tool-error.ts';
import { toToolSuccess } from './to-tool-success.ts';

const InvalidateFactOutputSchema = z.object({
  invalidated_fact_id: z.string(),
  replacement_fact_id: z.string().nullable(),
});

/**
 * Registers `invalidate_fact`: reports that a fact was wrong or is no longer true, with an
 * optional fact to take its place. Nothing is deleted, so it is not destructive.
 */
export const registerInvalidateFactTool: RegisterTool = (server, deps) => {
  server.registerTool(
    'invalidate_fact',
    {
      title: 'Invalidate a fact',
      description:
        'Reports that a stored fact was wrong (was_wrong) or has stopped being true (no_longer_true), with an optional replacement. The fact stays on record: recall stops returning it as current, and get_fact_history shows it with the reason. A revised fact gets a new identifier.',
      inputSchema: z.object({
        fact_id: z.string().min(1).describe('The fact, as recall returned it.'),
        because: z
          .enum(['was_wrong', 'no_longer_true'])
          .describe(
            'was_wrong: the fact was never true. no_longer_true: it was true and has stopped being true.',
          ),
        reason: z
          .string()
          .min(1)
          .max(1000)
          .describe('Why, in your words, up to 1,000 characters. Kept as the source of the change.'),
        ended_at: z
          .string()
          .optional()
          .describe(
            'With no_longer_true: when it stopped being true. Default: now. A full UTC timestamp such as 2026-03-15T09:30:00.000Z, or a calendar date such as 2026-03-15.',
          ),
        replacement: z
          .object(buildFactInputShape(deps.domain))
          .optional()
          .describe(
            'The fact that takes its place, in the fields of record_fact. A correction keeps the period of the wrong fact unless it gives its own; a succession starts at ended_at unless it gives valid_from.',
          ),
      }),
      outputSchema: InvalidateFactOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ fact_id, because, reason, ended_at, replacement }) => {
      const endedAt = readOptionalDate('ended_at', ended_at);
      if (!endedAt.ok) return toToolError(endedAt.error);
      let replacementInput: StructuredFactInput | null = null;
      if (replacement !== undefined) {
        const read = readFactInput(replacement, 'replacement.');
        if (!read.ok) return toToolError(read.error);
        replacementInput = read.value;
      }
      const changed = await changeFact(deps, {
        namespace: deps.namespace,
        factId: fact_id,
        because,
        endedAt: endedAt.value,
        explanation: reason,
        replacement: replacementInput,
        trigger: 'agent',
      });
      if (!changed.ok) return toToolError(changed.error);
      return toToolSuccess({
        invalidated_fact_id: changed.value.invalidatedFactId,
        replacement_fact_id: changed.value.replacement?.fact.id ?? null,
      });
    },
  );
};
