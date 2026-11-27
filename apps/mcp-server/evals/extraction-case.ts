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

/** A fact by subject, predicate, object and dates: what extraction is compared on. Statements are not. */
const CaseFactSchema = z.strictObject({
  subject: EntityNameSchema,
  predicate: TextSchema,
  /** Another entity, or a literal value such as a version, a port or a command. */
  object: z.union([EntityNameSchema, z.strictObject({ value: TextSchema })]),
  valid_from: DateTextSchema.nullable(),
  valid_to: DateTextSchema.nullable(),
});
export type CaseFact = z.infer<typeof CaseFactSchema>;

/** The kinds of case that FL-029 lists. Each case names the kinds it covers. */
export const EXTRACTION_CASE_KINDS = [
  'one-plain-fact',
  'several-facts',
  'date-in-text',
  'relative-date',
  'no-date',
  'end-stated',
  'plan',
  'no-fact',
  'question-or-hypothetical',
  'entity-object',
  'value-object',
  'multi-valued-two-values',
  'two-entity-types',
  'commit-message',
  'agent-note',
  'surrounded-by-talk',
  'unnamed-subject',
] as const;

/** One extraction case: a text, when it was written, and the facts expected and forbidden. */
export const ExtractionCaseSchema = z
  .strictObject({
    name: TextSchema,
    kinds: z.array(z.enum(EXTRACTION_CASE_KINDS)).min(1),
    /** When the text is taken to be written. A relative date is resolved against it. */
    observed_at: DateTextSchema,
    text: TextSchema,
    /** The repository the memory is about, as a `repo:` namespace gives it (FL-078). Absent for most cases. */
    repository: TextSchema.optional(),
    /** `required` marks the facts the case exists to test: each must be extracted for it to pass. */
    expected: z.array(CaseFactSchema.extend({ required: z.boolean() })),
    /** Facts that must not be extracted, such as a plan written as if it were true. */
    forbidden: z.array(CaseFactSchema).optional(),
  })
  .check((context) => {
    const { expected } = context.value;
    if (expected.length > 0 && !expected.some((fact) => fact.required)) {
      context.issues.push({
        code: 'custom',
        message: 'A case with an expected fact marks at least one as required.',
        input: context.value,
      });
    }
  });
export type ExtractionCase = z.infer<typeof ExtractionCaseSchema>;

/** Lists what a case names that the domain does not have: predicates and entity types. */
export function findCaseNamesOutsideDomain(extractionCase: ExtractionCase, domain: Domain): string[] {
  const predicates = new Set(domain.predicates.map((predicate) => predicate.name));
  const facts = [...extractionCase.expected, ...(extractionCase.forbidden ?? [])];
  const problems: string[] = [];
  for (const fact of facts) {
    if (!predicates.has(fact.predicate))
      problems.push(`the predicate "${fact.predicate}" is not in the domain`);
    const types = [fact.subject.type, ...('type' in fact.object ? [fact.object.type] : [])];
    for (const type of types) {
      if (!domain.entityTypes.includes(type)) problems.push(`the entity type "${type}" is not in the domain`);
    }
  }
  return problems;
}

/** Reads one case from the text of its YAML file and checks its names against the domain. */
export function parseExtractionCase(yamlText: string, domain: Domain): Result<ExtractionCase> {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (cause) {
    return err('invalid_input', 'The case file is not valid YAML.', { cause });
  }
  const parsed = ExtractionCaseSchema.safeParse(raw);
  if (!parsed.success) return err('invalid_input', `The case is not valid. ${z.prettifyError(parsed.error)}`);
  const outside = findCaseNamesOutsideDomain(parsed.data, domain);
  if (outside.length > 0) return err('invalid_input', `The case names ${outside.join('; ')}.`);
  return ok(parsed.data);
}

/** Where the extraction case files are. */
export const EXTRACTION_CASES_DIRECTORY = join(import.meta.dirname, 'extraction-cases');

/** Reads every case file of a directory, in file name order, or says which file is not valid. */
export function loadExtractionCases(directory: string, domain: Domain): Result<ExtractionCase[]> {
  const cases: ExtractionCase[] = [];
  const fileNames = readdirSync(directory)
    .filter((name) => name.endsWith('.yaml'))
    .sort();
  for (const fileName of fileNames) {
    const parsed = parseExtractionCase(readFileSync(join(directory, fileName), 'utf8'), domain);
    if (!parsed.ok) return err('invalid_input', `${fileName}: ${parsed.error.message}`);
    cases.push(parsed.value);
  }
  return ok(cases);
}
