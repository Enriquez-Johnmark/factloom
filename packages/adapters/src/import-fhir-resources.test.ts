// Every patient, medication and date below is invented. No record of a real person is used.
import {
  approveProposedChange,
  createTestDeps,
  type FactWithSources,
  type LlmClient,
  type OperationDeps,
  parseDateInput,
  type Timestamp,
} from '@kronomind/core';
import { softwareDevelopmentDomain } from '@kronomind/graph-rag';
import { describe, expect, it } from 'vitest';
import { healthcareDomain } from './healthcare-domain.ts';
import { type FhirImportEntry, importFhirResources } from './import-fhir-resources.ts';

const NAMESPACE = 'patients:invented';
const PATIENT = { reference: 'Patient/invented-a', display: 'Invented Patient A' };

function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

/** One memory under the healthcare domain, with the clock at the date each step names. */
function createMemory() {
  const first = createTestDeps({ now: '2026-01-01', domain: healthcareDomain });
  return {
    store: first.store,
    on(date: string): OperationDeps {
      return createTestDeps({ now: date, store: first.store, newId: first.newId, domain: healthcareDomain });
    },
  };
}

type Memory = ReturnType<typeof createMemory>;

/** Imports resources as a Bundle on a date, and fails the test on an error. */
async function importOn(
  memory: Memory,
  date: string,
  resources: readonly unknown[],
): Promise<FhirImportEntry[]> {
  const imported = await importFhirResources(memory.on(date), {
    namespace: NAMESPACE,
    document: {
      resourceType: 'Bundle',
      type: 'collection',
      entry: resources.map((resource) => ({ resource })),
    },
    trigger: 'person',
  });
  if (!imported.ok) throw new Error(imported.error.message);
  return [...imported.value.entries];
}

async function factsAt(memory: Memory, validAt: string, knownAt = '2026-12-01'): Promise<FactWithSources[]> {
  const listed = await memory.store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time: { validAt: at(validAt), knownAt: at(knownAt) },
    limit: 100,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return [...listed.value];
}

async function allFacts(memory: Memory): Promise<FactWithSources[]> {
  const listed = await memory.store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time: 'all',
    limit: 100,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return [...listed.value];
}

function metformin(status: string, effectivePeriod: { start?: string; end?: string }) {
  return {
    resourceType: 'MedicationStatement',
    id: 'invented-ms-1',
    status,
    medicationCodeableConcept: { text: 'metformin' },
    subject: PATIENT,
    effectivePeriod,
    dateAsserted: '2026-01-10',
  };
}

function penicillinAllergy(verification: string) {
  return {
    resourceType: 'AllergyIntolerance',
    id: 'invented-ai-1',
    clinicalStatus: { coding: [{ code: 'active' }] },
    verificationStatus: { coding: [{ code: verification }] },
    code: { text: 'penicillin' },
    patient: PATIENT,
    onsetDateTime: '2025-11-02',
    recordedDate: '2026-01-10',
  };
}

function condition(fields: Record<string, unknown>) {
  return {
    resourceType: 'Condition',
    id: 'invented-c-1',
    code: { text: 'type 2 diabetes mellitus' },
    subject: PATIENT,
    ...fields,
  };
}

describe('importFhirResources', () => {
  it('keeps a medication true on the last day of its inclusive period, and not the day after', async () => {
    const memory = createMemory();

    const [entry] = await importOn(memory, '2026-07-05', [
      metformin('completed', { start: '2026-01-10', end: '2026-06-30' }),
    ]);

    expect(entry?.outcome).toBe('recorded');
    // Known-at 2026-12-01, after the import; as-of the last day and the day after.
    expect((await factsAt(memory, '2026-06-30')).map((found) => found.fact.statement)).toEqual([
      'Invented Patient A takes metformin.',
    ]);
    expect(await factsAt(memory, '2026-07-01')).toEqual([]);
  });

  it('starts a condition given only a year at that year, and keeps the year in the source', async () => {
    const memory = createMemory();

    await importOn(memory, '2026-03-01', [condition({ onsetDateTime: '2026' })]);

    const [stored] = await allFacts(memory);
    expect(stored?.fact.validFrom).toBe(at('2026-01-01'));
    expect(stored?.sources.map((source) => [source.kind, source.locator])).toEqual([
      ['fhir_resource', 'Condition/invented-c-1'],
    ]);
    expect(stored?.sources[0]?.content).toContain('"onsetDateTime":"2026"');
  });

  it('holds an allergy entered in error as a retraction for a person, and leaves the fact live', async () => {
    const memory = createMemory();
    await importOn(memory, '2026-01-10', [penicillinAllergy('confirmed')]);

    const [entry] = await importOn(memory, '2026-02-01', [penicillinAllergy('entered-in-error')]);

    expect(entry?.outcome).toBe('proposed');
    const pending = await memory.store.listPendingProposals({ namespace: NAMESPACE });
    expect(pending.ok && pending.value.map((one) => one.proposal.supersession.kind)).toEqual(['retraction']);
    const [proposal] = pending.ok ? pending.value : [];
    const source = await memory.store.getSource({
      namespace: NAMESPACE,
      sourceId: proposal?.proposal.sourceId ?? '',
    });
    expect(source.ok && [source.value?.kind, source.value?.locator]).toEqual([
      'fhir_resource',
      'AllergyIntolerance/invented-ai-1',
    ]);
    expect((await factsAt(memory, '2026-02-01', '2026-02-01')).map((found) => found.fact.statement)).toEqual([
      'Invented Patient A is allergic to penicillin.',
    ]);
  });

  it('reports a refuted condition as not mapped and records no fact', async () => {
    const memory = createMemory();

    const [entry] = await importOn(memory, '2026-03-01', [
      condition({ verificationStatus: { coding: [{ code: 'refuted' }] }, onsetDateTime: '2026-02-01' }),
    ]);

    expect(entry?.outcome).toBe('not_mapped');
    expect(entry?.notMapped.map((element) => element.element)).toEqual(['verificationStatus']);
    expect(await allFacts(memory)).toEqual([]);
  });

  it('makes no LLM call', async () => {
    const memory = createMemory();
    const unreachable: LlmClient = {
      generateObject() {
        throw new Error('The LLM was called.');
      },
    };

    // The use case's dependencies hold no LLM client; one that fails is passed beside them anyway.
    const deps = { ...memory.on('2026-03-01'), llm: unreachable };

    const imported = await importFhirResources(deps, {
      namespace: NAMESPACE,
      document: [metformin('active', { start: '2026-01-10' }), condition({ onsetDateTime: '2026-02' })],
      trigger: 'person',
    });

    expect(imported.ok && imported.value.entries.map((entry) => entry.outcome)).toEqual([
      'recorded',
      'recorded',
    ]);
  });

  it('restates every fact when the same file is imported again, and records none twice', async () => {
    const memory = createMemory();
    const file = [metformin('active', { start: '2026-01-10' }), penicillinAllergy('confirmed')];
    await importOn(memory, '2026-03-01', file);
    const before = (await allFacts(memory)).length;

    const again = await importOn(memory, '2026-03-02', file);

    expect(again.map((entry) => entry.outcome)).toEqual(['restated', 'restated']);
    expect((await allFacts(memory)).length).toBe(before);
  });

  it('holds the end of a medication that stopped as a proposal, which approval applies', async () => {
    const memory = createMemory();
    await importOn(memory, '2026-01-10', [metformin('active', { start: '2026-01-10' })]);

    const [entry] = await importOn(memory, '2026-05-03', [
      metformin('stopped', { start: '2026-01-10', end: '2026-05-01' }),
    ]);
    const repeated = await importOn(memory, '2026-05-04', [
      metformin('stopped', { start: '2026-01-10', end: '2026-05-01' }),
    ]);

    expect([entry?.outcome, repeated[0]?.outcome]).toEqual(['proposed', 'already_proposed']);
    expect(await factsAt(memory, '2026-06-01', '2026-05-04')).toHaveLength(1);
    const approved = await approveProposedChange(memory.on('2026-05-05'), {
      namespace: NAMESPACE,
      proposalId: entry?.proposalId ?? '',
      trigger: 'person',
    });
    expect(approved.ok).toBe(true);
    expect(await factsAt(memory, '2026-05-01')).toHaveLength(1);
    expect(await factsAt(memory, '2026-05-02')).toEqual([]);
  });

  it('refuses a file with an invalid resource, names where it is, and writes nothing', async () => {
    const memory = createMemory();

    const imported = await importFhirResources(memory.on('2026-03-01'), {
      namespace: NAMESPACE,
      document: {
        resourceType: 'Bundle',
        entry: [
          { resource: metformin('active', { start: '2026-01-10' }) },
          { resource: metformin('paused', {}) },
        ],
      },
      trigger: 'person',
    });

    expect(imported.ok ? null : imported.error.code).toBe('invalid_input');
    expect(imported.ok ? null : imported.error.message).toContain('entry[1].resource.status');
    expect(await allFacts(memory)).toEqual([]);
  });

  it('reports a resource of another type as not mapped and leaves it alone', async () => {
    const memory = createMemory();

    const [entry] = await importOn(memory, '2026-03-01', [{ resourceType: 'Patient', id: 'invented-a' }]);

    expect([entry?.resource, entry?.outcome]).toEqual(['Patient/invented-a', 'not_mapped']);
  });

  it('refuses to run under a domain other than healthcare', async () => {
    const deps = createTestDeps({ now: '2026-03-01', domain: softwareDevelopmentDomain });

    const imported = await importFhirResources(deps, {
      namespace: NAMESPACE,
      document: [metformin('active', { start: '2026-01-10' })],
      trigger: 'person',
    });

    expect(imported.ok ? null : imported.error.code).toBe('invalid_input');
  });
});
