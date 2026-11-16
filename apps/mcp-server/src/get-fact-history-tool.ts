import { getFactHistory } from '@factloom/graph-rag';
import { z } from 'zod';
import type { RegisterTool } from './create-factloom-server.ts';
import { FactOutputSchema, toFactOutput } from './to-fact-output.ts';
import { toToolError } from './to-tool-error.ts';
import { toToolSuccess } from './to-tool-success.ts';

const GetFactHistoryOutputSchema = z.object({
  entries: z.array(
    FactOutputSchema.extend({
      changes: z.array(
        z.object({
          operation: z.string(),
          action: z.string(),
          trigger: z.string(),
          reason_code: z.string(),
          explanation: z.string().nullable(),
          occurred_at: z.string(),
        }),
      ),
    }),
  ),
});

/** Registers `get_fact_history`: how a fact changed over time and why. Read-only. */
export const registerGetFactHistoryTool: RegisterTool = (server, deps) => {
  server.registerTool(
    'get_fact_history',
    {
      title: 'Get fact history',
      description:
        'Shows how a fact changed and why: the facts linked to it by corrections and successions, and for a predicate that holds one value at a time, every value it has had. Each entry lists its changes with the reason given.',
      inputSchema: z.object({ fact_id: z.string().min(1).describe('Any fact, current or not.') }),
      outputSchema: GetFactHistoryOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ fact_id }) => {
      const history = await getFactHistory(deps, { namespace: deps.namespace, factId: fact_id });
      if (!history.ok) return toToolError(history.error);
      return toToolSuccess({
        entries: history.value.entries.map((entry) => ({
          ...toFactOutput(entry),
          changes: entry.auditEntries.map((change) => ({
            operation: change.operation,
            action: change.action,
            trigger: change.trigger,
            reason_code: change.reasonCode,
            explanation: change.explanation,
            occurred_at: change.occurredAt,
          })),
        })),
      });
    },
  );
};
