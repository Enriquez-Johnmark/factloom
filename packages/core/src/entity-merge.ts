import { z } from 'zod';
import { EntityIdSchema, NamespaceSchema } from './fact.ts';
import { TimestampSchema } from './timestamp.ts';

/**
 * That one entity is the same thing as another. No entity and no fact is rewritten: reads
 * resolve `fromEntityId` to `intoEntityId` while `undoneAt` is null.
 */
export const EntityMergeSchema = z
  .strictObject({
    id: z.string().min(1),
    namespace: NamespaceSchema,
    fromEntityId: EntityIdSchema,
    intoEntityId: EntityIdSchema,
    mergedAt: TimestampSchema,
    undoneAt: TimestampSchema.nullable(),
  })
  .readonly();
export type EntityMerge = z.infer<typeof EntityMergeSchema>;
