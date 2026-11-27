import { giveFeedback } from '@kronomind/graph-rag';
import { z } from 'zod';
import type { RegisterTool } from './create-kronomind-server.ts';
import { toToolError } from './to-tool-error.ts';
import { toToolSuccess } from './to-tool-success.ts';

const GiveFeedbackOutputSchema = z.object({
  feedback_id: z.string(),
  follow_up: z.enum(['confidence_raised', 'confidence_lowered', 'retracted', 'ended', 'none']),
});

/**
 * Registers `give_feedback`: passes on that a recalled fact was found right, wrong or out of
 * date. It records the signal, and the feedback responder in the dependencies may then change
 * the fact's confidence or retract or end it (FL-060). Nothing is deleted, so it is not
 * destructive.
 */
export const registerGiveFeedbackTool: RegisterTool = (server, deps) => {
  server.registerTool(
    'give_feedback',
    {
      title: 'Give feedback on a fact',
      description:
        'Records that a recalled fact was found right, wrong or out of date, with what was said. Use it when you only know that; when you know what replaced the fact or when it stopped being true, use invalidate_fact instead. follow_up says what Kronomind did about it.',
      inputSchema: z.object({
        fact_id: z.string().min(1).describe('The fact, as recall returned it.'),
        signal: z
          .enum(['right', 'wrong', 'outdated'])
          .describe('right: confirmed. wrong: it was never true. outdated: it was true and no longer is.'),
        comment: z
          .string()
          .min(1)
          .max(1000)
          .optional()
          .describe('What was said, up to 1,000 characters. Kept as the source of the feedback.'),
      }),
      outputSchema: GiveFeedbackOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ fact_id, signal, comment }) => {
      const given = await giveFeedback(deps, {
        namespace: deps.namespace,
        factId: fact_id,
        signal,
        comment: comment ?? null,
        trigger: 'agent',
      });
      if (!given.ok) return toToolError(given.error);
      return toToolSuccess({ feedback_id: given.value.feedbackId, follow_up: given.value.followUp });
    },
  );
};
