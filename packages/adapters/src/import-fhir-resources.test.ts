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

function hba1c(status: string, value: number, fields: Record<string, unknown> = {}) {
  return {
    resourceType: 'Observation',
    id: 'invented-obs-1',
    status,
    code: { coding: [{ system: 'http://loinc.org', code: '4548-4' }], text: 'HbA1c' },
    subject: PATIENT,
    effectiveDateTime: '2026-03-01',
    valueQuantity: { value, unit: '%', system: 'http://unitsofmeasure.org', code: '%' },
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

  it('records a refuted condition as ruled out, its own fact, from the day it was recorded', async () => {
    const memory = createMemory();

    const [entry] = await importOn(memory, '2026-03-01', [
      condition({ verificationStatus: { coding: [{ code: 'refuted' }] }, recordedDate: '2026-02-20' }),
    ]);

    expect(entry?.outcome).toBe('recorded');
    const [stored] = await allFacts(memory);
    expect([stored?.fact.predicate, stored?.fact.statement, stored?.fact.validFrom]).toEqual([
      'ruled_out',
      'Invented Patient A: type 2 diabetes mellitus ruled out.',
      at('2026-02-20'),
    ]);
  });

  it('holds a refuted record over a provisional one as a correction, whose replacement is the ruled-out fact', async () => {
    const memory = createMemory();
    await importOn(memory, '2026-02-01', [
      condition({ verificationStatus: { coding: [{ code: 'provisional' }] }, onsetDateTime: '2026-01' }),
    ]);

    const [entry] = await importOn(memory, '2026-03-01', [
      condition({ verificationStatus: { coding: [{ code: 'refuted' }] }, recordedDate: '2026-03-01' }),
    ]);

    expect(entry?.outcome).toBe('proposed');
    const pending = await memory.store.listPendingProposals({ namespace: NAMESPACE });
    const [proposal] = pending.ok ? pending.value : [];
    expect([proposal?.proposal.supersession.kind, proposal?.storedFact.fact.predicate]).toEqual([
      'correction',
      'has_condition',
    ]);
    expect(proposal?.proposal.newFact?.fact.predicate).toBe('ruled_out');
    const approved = await approveProposedChange(memory.on('2026-03-02'), {
      namespace: NAMESPACE,
      proposalId: entry?.proposalId ?? '',
      trigger: 'person',
    });
    expect(approved.ok).toBe(true);
    const live = (await allFacts(memory)).filter((found) => found.fact.invalidatedAt === null);
    expect(live.map((found) => found.fact.predicate)).toEqual(['ruled_out']);
  });

  it('records a medication not taken as its own fact over the period it gives', async () => {
    const memory = createMemory();

    await importOn(memory, '2026-03-01', [
      metformin('not-taken', { start: '2026-02-01', end: '2026-02-28' }),
    ]);

    const [stored] = await allFacts(memory);
    expect([stored?.fact.predicate, stored?.fact.statement, stored?.fact.validTo]).toEqual([
      'not_taking',
      'Invented Patient A does not take metformin.',
      at('2026-03-01'),
    ]);
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

  it('records a final result as a value with its unit, on its series, for the day it describes', async () => {
    const memory = createMemory();

    const [entry] = await importOn(memory, '2026-03-02', [hba1c('final', 6.8)]);

    expect(entry?.outcome).toBe('recorded');
    const facts = await allFacts(memory);
    const result = facts.find((found) => found.fact.predicate === 'measured_as');
    expect(result?.subject.name).toBe('Patient/invented-a LOINC 4548-4');
    expect(result?.fact.object).toEqual({ kind: 'value', value: '6.8', unit: '%' });
    expect([result?.fact.validFrom, result?.fact.validTo]).toEqual([at('2026-03-01'), at('2026-03-02')]);
    expect(facts.find((found) => found.fact.predicate === 'measurement_of')?.objectEntity?.name).toBe(
      'Patient/invented-a',
    );
  });

  it('restates a result imported again, and records nothing twice', async () => {
    const memory = createMemory();
    await importOn(memory, '2026-03-02', [hba1c('final', 6.8)]);
    const before = (await allFacts(memory)).length;

    const [entry] = await importOn(memory, '2026-03-03', [hba1c('final', 6.8)]);

    expect(entry?.outcome).toBe('restated');
    expect((await allFacts(memory)).length).toBe(before);
  });

  it('holds a corrected result as a correction of the earlier value, which approval applies', async () => {
    const memory = createMemory();
    await importOn(memory, '2026-03-02', [hba1c('final', 6.8)]);

    const [entry] = await importOn(memory, '2026-03-05', [
      hba1c('corrected', 7.1, { meta: { versionId: '2' } }),
    ]);

    expect(entry?.outcome).toBe('proposed');
    const pending = await memory.store.listPendingProposals({ namespace: NAMESPACE });
    const [proposal] = pending.ok ? pending.value : [];
    expect(proposal?.proposal.supersession.kind).toBe('correction');
    expect(proposal?.proposal.newFact?.fact.object).toEqual({ kind: 'value', value: '7.1', unit: '%' });
    const approved = await approveProposedChange(memory.on('2026-03-06'), {
      namespace: NAMESPACE,
      proposalId: entry?.proposalId ?? '',
      trigger: 'person',
    });
    expect(approved.ok).toBe(true);
    const live = (await factsAt(memory, '2026-03-01')).filter(
      (found) => found.fact.predicate === 'measured_as',
    );
    expect(live.map((found) => found.fact.object)).toEqual([{ kind: 'value', value: '7.1', unit: '%' }]);
  });

  it('holds a result entered in error as a retraction', async () => {
    const memory = createMemory();
    await importOn(memory, '2026-03-02', [hba1c('final', 6.8)]);

    const [entry] = await importOn(memory, '2026-03-05', [hba1c('entered-in-error', 6.8)]);

    expect(entry?.outcome).toBe('proposed');
    const pending = await memory.store.listPendingProposals({ namespace: NAMESPACE });
    expect(pending.ok && pending.value.map((one) => one.proposal.supersession.kind)).toEqual(['retraction']);
  });

  it('reports an amended result, and a result with no time, as not mapped', async () => {
    const memory = createMemory();

    const entries = await importOn(memory, '2026-03-02', [
      hba1c('amended', 6.8),
      hba1c('final', 6.8, { id: 'invented-obs-2', effectiveDateTime: undefined }),
    ]);

    expect(
      entries.map((entry) => [entry.outcome, entry.notMapped.map((element) => element.element)]),
    ).toEqual([
      ['not_mapped', ['status']],
      ['not_mapped', ['effective[x]']],
    ]);
    expect(await allFacts(memory)).toEqual([]);
  });
});
