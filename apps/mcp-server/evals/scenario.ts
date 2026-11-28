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

/** An entity, by its name and, where it matters, its type. */
const SubjectSchema = z.strictObject({ name: TextSchema, type: TextSchema.optional() });

const RememberStepSchema = z.strictObject({
  at: DateTextSchema,
  /** A text, as an agent would send it to the `remember` tool. */
  remember: TextSchema,
});

const ChangeFactStepSchema = z.strictObject({
  at: DateTextSchema,
  /** A report that a stored fact was wrong or is no longer true. */
  change_fact: z.strictObject({
    subject: SubjectSchema,
    predicate: TextSchema,
    value: TextSchema,
    because: z.enum(['was_wrong', 'no_longer_true']),
    ended_at: DateTextSchema.optional(),
    explanation: TextSchema,
  }),
});

/** FL-093: FHIR R4 resources a person imports, under the healthcare domain. Invented records only. */
const ImportFhirStepSchema = z.strictObject({
  at: DateTextSchema,
  import_fhir: z.array(z.record(z.string(), z.unknown())).min(1),
});

/** FL-093: a person decides the pending proposal on the live fact of a subject, predicate and value. */
const DecideProposalStepSchema = z.strictObject({
  at: DateTextSchema,
  decide_proposal: z.strictObject({
    subject: SubjectSchema,
    predicate: TextSchema,
    value: TextSchema,
    decision: z.enum(['approve', 'reject']),
  }),
});

const StepSchema = z.union([
  RememberStepSchema,
  ChangeFactStepSchema,
  ImportFhirStepSchema,
  DecideProposalStepSchema,
]);

const AskSchema = z.strictObject({
  ask: z.strictObject({
    subject: SubjectSchema,
    predicate: TextSchema,
    /** What was true in the world on this date. Default: now, the time of the last step. */
    as_of: DateTextSchema.optional(),
    /** What Kronomind believed on this date. Default: now. */
    known_at: DateTextSchema.optional(),
  }),
  /** The exact set of values expected. An empty list means nothing is returned. */
  returns: z.array(TextSchema),
  must_not_return: z.array(TextSchema).optional(),
  /** The number of sources the one returned fact must have. */
  sources: z.number().int().positive().optional(),
});

const HistorySchema = z.strictObject({
  history: z.strictObject({ subject: SubjectSchema, predicate: TextSchema }),
  /** Each value that was superseded, and how. An empty list means nothing was. */
  superseded: z.array(
    z.strictObject({ from: TextSchema, kind: z.enum(['succession', 'correction', 'revision']) }),
  ),
  /** The number of facts ever recorded for the subject and predicate. */
  fact_rows: z.number().int().nonnegative().optional(),
});

const EntitiesSchema = z.strictObject({
  entities: z.strictObject({ name: TextSchema }),
  /** The number of entities, of any type, that have the name. Shows that an entity was reused. */
  count: z.number().int().nonnegative(),
});

/** FL-093: the kinds of the proposals still pending on the facts of a subject and predicate. */
const PendingSchema = z.strictObject({
  pending: z.strictObject({ subject: SubjectSchema, predicate: TextSchema }),
  /** An empty list means nothing waits for a person. */
  kinds: z.array(z.enum(['succession', 'correction', 'retraction'])),
});

const ExpectSchema = z.union([AskSchema, HistorySchema, EntitiesSchema, PendingSchema]);

/** One timeline scenario: dated inputs, then what memory must hold afterwards. */
export const ScenarioSchema = z
  .strictObject({
    name: TextSchema,
    steps: z.array(StepSchema).min(1),
    expect: z.array(ExpectSchema).min(1),
  })
  .check((context) => {
    const times = context.value.steps.map((step) => parseDateInput(step.at));
    for (let index = 1; index < times.length; index += 1) {
      const earlier = times[index - 1];
      const later = times[index];
      if (earlier?.ok && later?.ok && later.value < earlier.value) {
        context.issues.push({
          code: 'custom',
          message: `Step ${index + 1} is dated before step ${index}. Steps must be in order of time.`,
          input: context.value,
        });
      }
    }
  });
export type Scenario = z.infer<typeof ScenarioSchema>;

/** Reads one scenario from the text of its YAML file. */
export function parseScenario(yamlText: string): Result<Scenario> {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (cause) {
    return err('invalid_input', 'The scenario file is not valid YAML.', { cause });
  }
  const parsed = ScenarioSchema.safeParse(raw);
  if (!parsed.success)
    return err('invalid_input', `The scenario is not valid. ${z.prettifyError(parsed.error)}`);
  return ok(parsed.data);
}

/** Lists what a scenario names that the domain does not have: predicates and entity types. */
export function findNamesOutsideDomain(scenario: Scenario, domain: Domain): string[] {
  const predicates = new Set(domain.predicates.map((predicate) => predicate.name));
  const problems: string[] = [];
  const check = (place: string, subject: { type?: string | undefined }, predicate: string): void => {
    if (!predicates.has(predicate))
      problems.push(`${place}: the predicate "${predicate}" is not in the domain`);
    if (subject.type !== undefined && !domain.entityTypes.includes(subject.type)) {
      problems.push(`${place}: the entity type "${subject.type}" is not in the domain`);
    }
  };
  scenario.steps.forEach((step, index) => {
    if ('change_fact' in step)
      check(`step ${index + 1}`, step.change_fact.subject, step.change_fact.predicate);
    if ('decide_proposal' in step)
      check(`step ${index + 1}`, step.decide_proposal.subject, step.decide_proposal.predicate);
  });
  scenario.expect.forEach((entry, index) => {
    if ('ask' in entry) check(`expect ${index + 1}`, entry.ask.subject, entry.ask.predicate);
    if ('history' in entry) check(`expect ${index + 1}`, entry.history.subject, entry.history.predicate);
    if ('pending' in entry) check(`expect ${index + 1}`, entry.pending.subject, entry.pending.predicate);
  });
  return problems;
}

/** Where the scenario files are. */
export const SCENARIOS_DIRECTORY = join(import.meta.dirname, 'scenarios');

/** Where the healthcare scenario files are (FL-093). Every record in them is invented. */
export const HEALTHCARE_SCENARIOS_DIRECTORY = join(import.meta.dirname, 'scenarios-healthcare');

/** A scenario with the name of the file it was read from. */
export type ScenarioFile = { readonly file: string; readonly scenario: Scenario };

/**
 * Reads every scenario of a directory, in file name order. Fails before any step runs when a
 * file is not valid or names a predicate or an entity type the domain does not have, with the
 * file and the name.
 */
export function loadScenarios(directory: string, domain: Domain): Result<ScenarioFile[]> {
  const scenarios: ScenarioFile[] = [];
  const fileNames = readdirSync(directory)
    .filter((name) => name.endsWith('.yaml'))
    .sort();
  for (const file of fileNames) {
    const parsed = parseScenario(readFileSync(join(directory, file), 'utf8'));
    if (!parsed.ok) return err('invalid_input', `${file}: ${parsed.error.message}`);
    const problems = findNamesOutsideDomain(parsed.value, domain);
    if (problems.length > 0) return err('invalid_input', `${file}: ${problems.join('; ')}.`);
    scenarios.push({ file, scenario: parsed.value });
  }
  return ok(scenarios);
}
