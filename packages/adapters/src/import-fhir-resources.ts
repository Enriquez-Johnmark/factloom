import {
  err,
  type FactId,
  type FactWithSources,
  type Namespace,
  normaliseEntityName,
  type OperationDeps,
  ok,
  type Result,
  type Trigger,
} from '@kronomind/core';
import { changeFact, recordStructuredFacts, type StructuredFactInput } from '@kronomind/graph-rag';
import { z } from 'zod';
import { MAPPED_RESOURCE_TYPES, type MappedResource, MappedResourceSchema } from './fhir-resource-schemas.ts';
import { healthcareDomain } from './healthcare-domain.ts';
import { type FhirStatement, mapFhirResource, type NotMappedElement } from './map-fhir-resource.ts';

export type ImportFhirResourcesInput = {
  readonly namespace: Namespace;
  /** A FHIR Bundle, or a list of resources, as parsed from JSON. */
  readonly document: unknown;
  readonly trigger: Trigger;
};

/** What the import did with one resource. */
export type FhirImportOutcome =
  | 'recorded'
  | 'restated'
  | 'changed'
  | 'proposed'
  | 'already_proposed'
  | 'nothing_to_withdraw'
  | 'not_mapped'
  | 'failed';

/** One resource's line in the report. */
export type FhirImportEntry = {
  readonly resource: string;
  readonly outcome: FhirImportOutcome;
  readonly factIds: readonly FactId[];
  readonly proposalId: string | null;
  readonly notMapped: readonly NotMappedElement[];
  readonly error: { readonly code: string; readonly message: string } | null;
};

/** How many live facts one resource's patient can hold for one predicate: far more than a record holds. */
const LIVE_FACT_LIMIT = 1000;

const DocumentSchema = z.union([
  z.looseObject({
    resourceType: z.literal('Bundle'),
    entry: z.array(z.looseObject({ resource: z.unknown() })).optional(),
  }),
  z.array(z.unknown()),
]);

const ResourceTypeSchema = z.looseObject({ resourceType: z.string(), id: z.string().optional() });

type ReadResource =
  | { readonly kind: 'mapped'; readonly resource: MappedResource }
  | { readonly kind: 'other'; readonly name: string };

/**
 * Reads every resource of the document before anything is written, so that one invalid
 * resource refuses the whole import with its path in the file and changes nothing.
 */
function readResources(document: unknown): Result<readonly ReadResource[]> {
  const parsed = DocumentSchema.safeParse(document);
  if (!parsed.success)
    return err('invalid_input', 'The file is neither a FHIR Bundle nor a list of resources.');
  const entries = Array.isArray(parsed.data)
    ? parsed.data.map((resource, index) => ({ resource, path: `[${index}]` }))
    : (parsed.data.entry ?? []).map((entry, index) => ({
        resource: entry.resource,
        path: `entry[${index}].resource`,
      }));

  const resources: ReadResource[] = [];
  for (const { resource, path } of entries) {
    const typed = ResourceTypeSchema.safeParse(resource);
    if (!typed.success)
      return err('invalid_input', `${path} is not a FHIR resource: it has no resourceType.`);
    if (!MAPPED_RESOURCE_TYPES.includes(typed.data.resourceType)) {
      resources.push({ kind: 'other', name: `${typed.data.resourceType}/${typed.data.id ?? '?'}` });
      continue;
    }
    const mapped = MappedResourceSchema.safeParse(resource);
    if (!mapped.success) {
      const issue = mapped.error.issues[0];
      const at = issue === undefined ? '' : issue.path.map((part) => `.${String(part)}`).join('');
      return err('invalid_input', `${path}${at}: ${issue?.message ?? 'not a valid resource'}.`);
    }
    resources.push({ kind: 'mapped', resource: mapped.data });
  }
  return ok(resources);
}

/** Whether a stored fact's object is the thing a given fact names. */
function hasObject(stored: FactWithSources, fact: StructuredFactInput): boolean {
  const object = stored.fact.object;
  if (fact.object.kind === 'value') {
    return (
      object.kind === 'value' && normaliseEntityName(object.value) === normaliseEntityName(fact.object.value)
    );
  }
  return (
    stored.objectEntity !== null &&
    normaliseEntityName(stored.objectEntity.name) === normaliseEntityName(fact.object.name)
  );
}

/** The live facts that say the same thing as a given fact, at any valid time. */
async function findLiveFacts(
  deps: Pick<OperationDeps, 'store'>,
  namespace: Namespace,
  fact: StructuredFactInput,
): Promise<Result<readonly FactWithSources[]>> {
  const subjects = await deps.store.findEntities({
    namespace,
    name: fact.subject.name,
    type: fact.subject.type,
  });
  if (!subjects.ok) return subjects;
  const found: FactWithSources[] = [];
  for (const subject of subjects.value) {
    const listed = await deps.store.listFacts({
      namespace,
      subjectEntityId: subject.id,
      predicate: fact.predicate,
      touchingEntityIds: null,
      supersededByFactId: null,
      time: 'live',
      limit: LIVE_FACT_LIMIT,
    });
    if (!listed.ok) return listed;
    found.push(...listed.value.filter((stored) => hasObject(stored, fact)));
  }
  return ok(found);
}

/** Whether a stored fact is already waiting on a person: a second proposal would only repeat it. */
async function isAlreadyProposed(
  deps: Pick<OperationDeps, 'store'>,
  namespace: Namespace,
  factId: FactId,
): Promise<Result<boolean>> {
  const pending = await deps.store.listPendingProposals({ namespace });
  if (!pending.ok) return pending;
  return ok(pending.value.some((entry) => entry.proposal.storedFactId === factId));
}

type Reconciled = Omit<FhirImportEntry, 'resource' | 'notMapped'>;

const NOTHING = { factIds: [], proposalId: null, error: null } as const;

/** Reports a change to a stored fact: made at once, or held as a proposal under `human_approval`. */
async function reportChange(
  deps: OperationDeps,
  input: Parameters<typeof changeFact>[1],
): Promise<Result<Reconciled>> {
  const alreadyProposed = await isAlreadyProposed(deps, input.namespace, input.factId);
  if (!alreadyProposed.ok) return alreadyProposed;
  if (alreadyProposed.value) return ok({ ...NOTHING, outcome: 'already_proposed', factIds: [input.factId] });
  const changed = await changeFact(deps, input);
  if (!changed.ok) return changed;
  return changed.value.kind === 'proposed'
    ? ok({ ...NOTHING, outcome: 'proposed', factIds: [input.factId], proposalId: changed.value.proposalId })
    : ok({
        ...NOTHING,
        outcome: 'changed',
        factIds: [
          input.factId,
          ...(changed.value.replacement === null ? [] : [changed.value.replacement.fact.id]),
        ],
      });
}

/**
 * Makes memory agree with one statement. A new fact is recorded; the same fact over the same
 * period is restated; a live fact with no end that the record now ends is ended; one whose
 * period differs otherwise is corrected; a record entered in error retracts its fact.
 */
async function reconcile(
  deps: OperationDeps,
  input: { readonly namespace: Namespace; readonly trigger: Trigger; readonly statement: FhirStatement },
): Promise<Result<Reconciled>> {
  const { namespace, trigger, statement } = input;
  const { claim, source, content } = statement;
  if (claim.kind === 'none') return ok({ ...NOTHING, outcome: 'not_mapped' });
  const live = await findLiveFacts(deps, namespace, claim.fact);
  if (!live.ok) return live;
  const report = { namespace, trigger, source, explanation: content, endedAt: null } as const;

  if (claim.kind === 'withdraws') {
    const [stored] = live.value;
    if (stored === undefined) return ok({ ...NOTHING, outcome: 'nothing_to_withdraw' });
    return reportChange(deps, { ...report, factId: stored.fact.id, because: 'was_wrong', replacement: null });
  }

  const { fact } = claim;
  const stored = live.value[0];
  const isSamePeriod =
    stored !== undefined && stored.fact.validFrom === fact.validFrom && stored.fact.validTo === fact.validTo;
  if (stored === undefined || isSamePeriod) {
    const recorded = await recordStructuredFacts(deps, {
      namespace,
      trigger,
      source,
      content,
      facts: [fact],
    });
    if (!recorded.ok) return recorded;
    const outcome = recorded.value.facts.every((one) => one.outcome === 'restated') ? 'restated' : 'recorded';
    return ok({ ...NOTHING, outcome, factIds: recorded.value.facts.map((one) => one.fact.id) });
  }
  if (stored.fact.validTo === null && fact.validTo !== null && stored.fact.validFrom === fact.validFrom) {
    return reportChange(deps, {
      ...report,
      factId: stored.fact.id,
      because: 'no_longer_true',
      endedAt: fact.validTo,
      replacement: null,
    });
  }
  return reportChange(deps, { ...report, factId: stored.fact.id, because: 'was_wrong', replacement: fact });
}

/**
 * Imports FHIR R4 MedicationStatement, Condition and AllergyIntolerance resources into memory
 * by fixed rules, with no LLM, so that structured records never reach a model (FL-092). Every
 * resource is read first: one invalid resource refuses the import and nothing is written.
 * Then each resource is its own commit, and under the healthcare domain every change to a
 * stored fact is a proposal for a person. A resource that fails is reported and the rest go on.
 * Runs only under the healthcare domain.
 */
export async function importFhirResources(
  deps: OperationDeps,
  input: ImportFhirResourcesInput,
): Promise<Result<{ readonly entries: readonly FhirImportEntry[] }>> {
  if (deps.domain.name !== healthcareDomain.name) {
    return err('invalid_input', `The FHIR import runs under the healthcare domain, not ${deps.domain.name}.`);
  }
  const resources = readResources(input.document);
  if (!resources.ok) return resources;

  const entries: FhirImportEntry[] = [];
  for (const read of resources.value) {
    if (read.kind === 'other') {
      entries.push({
        ...NOTHING,
        resource: read.name,
        outcome: 'not_mapped',
        notMapped: [
          {
            element: 'resourceType',
            reason: 'Only MedicationStatement, Condition and AllergyIntolerance are mapped.',
          },
        ],
      });
      continue;
    }
    const statement = mapFhirResource(read.resource);
    const reconciled = await reconcile(deps, {
      namespace: input.namespace,
      trigger: input.trigger,
      statement,
    });
    entries.push(
      reconciled.ok
        ? { ...reconciled.value, resource: statement.resource, notMapped: statement.notMapped }
        : {
            ...NOTHING,
            resource: statement.resource,
            outcome: 'failed',
            notMapped: statement.notMapped,
            error: { code: reconciled.error.code, message: reconciled.error.message },
          },
    );
  }
  return ok({ entries });
}
