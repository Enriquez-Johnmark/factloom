// The judge cases of FL-041: a new fact, the text it came from, the stored candidates, and the
// verdict a person expects for each candidate. Read the same way as the extraction cases.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Domain, err, ok, parseDateInput, type Result } from '@kronomind/core';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/** A full timestamp or a calendar date, as `parseDateInput` reads it. */
const DateTextSchema = z.string().refine((text) => parseDateInput(text).ok, {
  error: 'Expected a UTC timestamp such as 2026-03-15T09:30:00.000Z, or a calendar date such as 2026-03-15.',
});
const TextSchema = z.string().min(1);
const EntityNameSchema = z.strictObject({ type: TextSchema, name: TextSchema });

/** The object of a fact: another entity, or a literal value. */
const CaseObjectSchema = z.union([EntityNameSchema, z.strictObject({ value: TextSchema })]);

/** The four verdicts of decision D-12. */
export const JUDGE_VERDICTS = ['duplicate', 'succession', 'correction', 'unrelated'] as const;
export type JudgeVerdictName = (typeof JUDGE_VERDICTS)[number];

const CaseFactSchema = z.strictObject({
  object: CaseObjectSchema,
  statement: TextSchema,
  valid_from: DateTextSchema.nullable(),
  valid_to: DateTextSchema.nullable(),
});

const CandidateSchema = CaseFactSchema.extend({
  /** When the stored fact was recorded. */
  recorded_at: DateTextSchema,
  /** The verdict a person expects, reviewed by hand. */
  expected: z.enum(JUDGE_VERDICTS),
});

/** One judge case. Every candidate has the case's subject and predicate, as `findConflictCandidates` returns them. */
export const JudgeCaseSchema = z.strictObject({
  name: TextSchema,
  /** The FL-027 scenario file the case is built from, without `.yaml`, if any. */
  scenario: TextSchema.optional(),
  /** True when the wording invites a wrong succession or correction. */
  misleading_wording: z.boolean().optional(),
  /** When the text was written. */
  observed_at: DateTextSchema,
  text: TextSchema,
  subject: EntityNameSchema,
  predicate: TextSchema,
  new_fact: CaseFactSchema,
  candidates: z.array(CandidateSchema),
});
export type JudgeCase = z.infer<typeof JudgeCaseSchema>;

/** Lists what a case names that the domain does not have: its predicate and entity types. */
function findCaseNamesOutsideDomain(judgeCase: JudgeCase, domain: Domain): string[] {
  const problems: string[] = [];
  if (!domain.predicates.some((predicate) => predicate.name === judgeCase.predicate)) {
    problems.push(`the predicate "${judgeCase.predicate}" is not in the domain`);
  }
  const objects = [judgeCase.new_fact.object, ...judgeCase.candidates.map((candidate) => candidate.object)];
  const types = [
    judgeCase.subject.type,
    ...objects.flatMap((object) => ('type' in object ? [object.type] : [])),
  ];
  for (const type of new Set(types)) {
    if (!domain.entityTypes.includes(type)) problems.push(`the entity type "${type}" is not in the domain`);
  }
  return problems;
}

/** Reads one judge case from the text of its YAML file and checks its names against the domain. */
export function parseJudgeCase(yamlText: string, domain: Domain): Result<JudgeCase> {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (cause) {
    return err('invalid_input', 'The case file is not valid YAML.', { cause });
  }
  const parsed = JudgeCaseSchema.safeParse(raw);
  if (!parsed.success) return err('invalid_input', `The case is not valid. ${z.prettifyError(parsed.error)}`);
  const outside = findCaseNamesOutsideDomain(parsed.data, domain);
  if (outside.length > 0) return err('invalid_input', `The case names ${outside.join('; ')}.`);
  return ok(parsed.data);
}

/** Where the judge case files are. */
export const JUDGE_CASES_DIRECTORY = join(import.meta.dirname, 'judge-cases');

/** Reads every judge case of a directory, in file name order, or says which file is not valid. */
export function loadJudgeCases(directory: string, domain: Domain): Result<JudgeCase[]> {
  const cases: JudgeCase[] = [];
  const fileNames = readdirSync(directory)
    .filter((name) => name.endsWith('.yaml'))
    .sort();
  for (const fileName of fileNames) {
    const parsed = parseJudgeCase(readFileSync(join(directory, fileName), 'utf8'), domain);
    if (!parsed.ok) return err('invalid_input', `${fileName}: ${parsed.error.message}`);
    cases.push(parsed.value);
  }
  return ok(cases);
}
