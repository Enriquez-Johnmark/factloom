import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const EntityNameSchema = z.strictObject({ type: z.string().min(1), name: z.string().min(1) });

export const RetrievalCasesSchema = z.strictObject({
  note: z.string(),
  statements: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        text: z.string().min(1),
        subject: EntityNameSchema,
        /** A second tool, component or team the statement names, or null. */
        object: EntityNameSchema.nullable(),
      }),
    )
    .min(1),
  queries: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        group: z.enum(['paraphrase', 'keyword', 'why', 'hard']),
        text: z.string().min(1),
        relevant: z.array(z.string().min(1)).min(1),
        tempting: z.array(z.string().min(1)).optional(),
      }),
    )
    .min(1),
});
export type RetrievalCases = z.infer<typeof RetrievalCasesSchema>;
export type RetrievalQuery = RetrievalCases['queries'][number];

export const QUESTION_GROUPS = ['paraphrase', 'keyword', 'why', 'hard'] as const;

/** Reads and checks the eval data: the spike's statements and questions, with an entity for each statement. */
export function readRetrievalCases(): RetrievalCases {
  const text = readFileSync(join(import.meta.dirname, 'cases.json'), 'utf8');
  return RetrievalCasesSchema.parse(JSON.parse(text));
}
