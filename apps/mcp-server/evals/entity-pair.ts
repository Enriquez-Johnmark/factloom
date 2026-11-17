// The entity pair set of FL-064: two entities, each with a name, a type and a few facts, and
// whether a person expects them to be the same thing. Read the same way as the judge cases.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok, type Result } from '@factloom/core';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const TextSchema = z.string().min(1);

const PairEntitySchema = z.strictObject({
  name: TextSchema,
  type: TextSchema,
  facts: z.array(TextSchema),
});

export const EntityPairCaseSchema = z.strictObject({
  name: TextSchema,
  /** What a person expects, reviewed by hand. */
  expected: z.enum(['same', 'different']),
  first: PairEntitySchema,
  second: PairEntitySchema,
});
export type EntityPairCase = z.infer<typeof EntityPairCaseSchema>;

export const ENTITY_PAIRS_DIRECTORY = join(import.meta.dirname, 'entity-pairs');

/** Reads every pair of a directory, in the order of the file names. */
export function loadEntityPairs(directory: string): Result<EntityPairCase[]> {
  const pairs: EntityPairCase[] = [];
  const fileNames = readdirSync(directory)
    .filter((name) => name.endsWith('.yaml'))
    .sort();
  for (const fileName of fileNames) {
    const parsed = EntityPairCaseSchema.safeParse(parseYaml(readFileSync(join(directory, fileName), 'utf8')));
    if (!parsed.success) return err('invalid_input', `${fileName}: ${z.prettifyError(parsed.error)}`);
    pairs.push(parsed.data);
  }
  return ok(pairs);
}
