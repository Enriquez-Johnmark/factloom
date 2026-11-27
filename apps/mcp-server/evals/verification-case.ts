// The verification cases of FL-051: a fact's statement, the text of its file as it is now,
// and the answer a person expects. Read the same way as the judge cases.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok, type Result } from '@kronomind/core';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/** The three answers of the verification prompt. */
export const VERIFICATION_ANSWERS = ['supported', 'contradicted', 'unclear'] as const;
export type VerificationAnswerName = (typeof VERIFICATION_ANSWERS)[number];

const TextSchema = z.string().min(1);

export const VerificationCaseSchema = z.strictObject({
  name: TextSchema,
  statement: TextSchema,
  path: TextSchema,
  text: TextSchema,
  /** The answer a person expects, reviewed by hand. */
  expected: z.enum(VERIFICATION_ANSWERS),
});
export type VerificationCase = z.infer<typeof VerificationCaseSchema>;

export const VERIFICATION_CASES_DIRECTORY = join(import.meta.dirname, 'verification-cases');

/** Reads every case of a directory, in the order of the file names. */
export function loadVerificationCases(directory: string): Result<VerificationCase[]> {
  const cases: VerificationCase[] = [];
  const fileNames = readdirSync(directory)
    .filter((name) => name.endsWith('.yaml'))
    .sort();
  for (const fileName of fileNames) {
    const parsed = VerificationCaseSchema.safeParse(
      parseYaml(readFileSync(join(directory, fileName), 'utf8')),
    );
    if (!parsed.success) return err('invalid_input', `${fileName}: ${z.prettifyError(parsed.error)}`);
    cases.push(parsed.data);
  }
  return ok(cases);
}
