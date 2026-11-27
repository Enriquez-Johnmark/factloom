import { recordStructuredFacts } from '@kronomind/graph-rag';
import { z } from 'zod';
import type { RegisterTool } from './create-kronomind-server.ts';
import { buildFactInputShape, readFactInput } from './fact-input-schema.ts';
import { readAnchoredSourceInput, SourceInputSchema } from './source-input-schema.ts';
import { RecordedFactOutputSchema, toRecordedFactOutput } from './to-recorded-fact-output.ts';
import { toToolError } from './to-tool-error.ts';
import { toToolSuccess } from './to-tool-success.ts';

const RecordFactOutputSchema = z.object({ fact: RecordedFactOutputSchema });

/** Registers `record_fact`: records one fact given as subject, predicate and object. No LLM call. */
export const registerRecordFactTool: RegisterTool = (server, deps) => {
  server.registerTool(
    'record_fact',
    {
      title: 'Record a fact',
      description:
        'Records one fact given as subject, predicate and object, with no LLM call and no API key. A fact already in memory gains the source. A second value for a predicate that holds one value at a time fails with conflict and names the stored fact.',
      inputSchema: z.object({ ...buildFactInputShape(deps.domain), source: SourceInputSchema }),
      outputSchema: RecordFactOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ source, ...fields }) => {
      const fact = readFactInput(fields);
      if (!fact.ok) return toToolError(fact.error);
      const recorded = await recordStructuredFacts(deps, {
        namespace: deps.namespace,
        facts: [fact.value],
        source: await readAnchoredSourceInput(source, deps.anchorFileSource),
        trigger: 'agent',
      });
      if (!recorded.ok) return toToolError(recorded.error);
      const [first] = recorded.value.facts;
      if (first === undefined)
        return toToolError({ code: 'storage_failed', message: 'No fact was returned.', relatedFactIds: [] });
      return toToolSuccess({ fact: toRecordedFactOutput(first) });
    },
  );
};
