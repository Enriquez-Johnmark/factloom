import type { Timestamp } from '@kronomind/core';
import type { SourceInput, StructuredFactInput } from '@kronomind/graph-rag';
import type {
  AllergyIntolerance,
  CodeableConcept,
  Condition,
  MappedResource,
  MedicationStatement,
  Reference,
} from './fhir-resource-schemas.ts';
import type { HealthcarePredicate } from './healthcare-domain.ts';
import { readFhirDate } from './read-fhir-date.ts';

/** An element of a resource the import did not turn into memory, and why. */
export type NotMappedElement = { readonly element: string; readonly reason: string };

/**
 * What one resource says about memory. `states`: the fact holds over its valid time.
 * `withdraws`: the record was entered in error, so the fact is retracted. `none`: nothing is
 * mapped, and `notMapped` says why.
 */
export type FhirClaim =
  | { readonly kind: 'states'; readonly fact: StructuredFactInput }
  | { readonly kind: 'withdraws'; readonly fact: StructuredFactInput }
  | { readonly kind: 'none' };

/** One resource, mapped: what it claims, the source it is recorded with, and what was left out. */
export type FhirStatement = {
  /** The resource as `Type/id`. */
  readonly resource: string;
  readonly claim: FhirClaim;
  readonly source: SourceInput;
  /** The whole resource as JSON, kept as the source's content: its own dates stay there. */
  readonly content: string;
  readonly notMapped: readonly NotMappedElement[];
};

/** Confidence of a fact from a confirmed record, and from one marked unconfirmed, provisional or differential. */
const CONFIRMED_CONFIDENCE = 0.9;
const UNCONFIRMED_CONFIDENCE = 0.5;

/** The first coded value of a concept, such as `resolved` in a clinical status. */
function readCode(concept: CodeableConcept | undefined): string | null {
  return concept?.coding?.find((coding) => coding.code !== undefined)?.code ?? null;
}

/** A concept's name for people: its text, or the display of its first coding. */
function readName(concept: CodeableConcept | undefined): string | null {
  const name = concept?.text ?? concept?.coding?.find((coding) => coding.display !== undefined)?.display;
  return name === undefined || name.trim() === '' ? null : name;
}

/** The patient a resource is about. Its reference is the stable entity name; the display only words the statement. */
function readPatient(reference: Reference): { readonly name: string; readonly label: string } | null {
  if (reference.reference === undefined || reference.reference.trim() === '') return null;
  return { name: reference.reference, label: reference.display ?? reference.reference };
}

/** Confidence from a verification status: unconfirmed, provisional and differential count for less. */
function readConfidence(verification: string | null): number {
  return verification === 'unconfirmed' || verification === 'provisional' || verification === 'differential'
    ? UNCONFIRMED_CONFIDENCE
    : CONFIRMED_CONFIDENCE;
}

/** Reads a FHIR date at its earliest moment, or records why it could not be read. */
function readStart(
  text: string | undefined,
  element: string,
  notMapped: NotMappedElement[],
): Timestamp | null {
  if (text === undefined) return null;
  const bounds = readFhirDate(text);
  if (bounds === null) notMapped.push({ element, reason: `"${text}" is not a FHIR date.` });
  return bounds?.start ?? null;
}

/** Reads an inclusive FHIR end as the first moment after it, or records why it could not be read. */
function readInclusiveEnd(
  text: string | undefined,
  element: string,
  notMapped: NotMappedElement[],
): Timestamp | null {
  if (text === undefined) return null;
  const bounds = readFhirDate(text);
  if (bounds === null) notMapped.push({ element, reason: `"${text}" is not a FHIR date.` });
  return bounds?.after ?? null;
}

/** Records the onset choices that have no exact moment: an age, a range or free text. */
function noteInexactOnset(resource: Condition | AllergyIntolerance, notMapped: NotMappedElement[]): void {
  for (const [element, given] of [
    ['onsetAge', resource.onsetAge],
    ['onsetRange', resource.onsetRange],
    ['onsetString', resource.onsetString],
  ] as const) {
    if (given !== undefined) {
      notMapped.push({
        element,
        reason: 'An onset with no exact date is not mapped; the start is left unknown.',
      });
    }
  }
}

/** A fact about a patient and a named thing, with the period it held. */
function factAbout(parts: {
  readonly patient: { readonly name: string; readonly label: string };
  readonly predicate: HealthcarePredicate;
  readonly object: { readonly type: 'medication' | 'condition' | 'substance'; readonly name: string };
  readonly statement: string;
  readonly confidence: number;
  readonly validFrom: Timestamp | null;
  readonly validTo: Timestamp | null;
}): StructuredFactInput {
  return {
    subject: { type: 'patient', name: parts.patient.name },
    predicate: parts.predicate,
    object: { kind: 'entity', type: parts.object.type, name: parts.object.name },
    statement: parts.statement,
    confidence: parts.confidence,
    validFrom: parts.validFrom,
    validTo: parts.validTo,
  };
}

function mapMedicationStatement(resource: MedicationStatement, notMapped: NotMappedElement[]): FhirClaim {
  const patient = readPatient(resource.subject);
  const medication =
    readName(resource.medicationCodeableConcept) ?? resource.medicationReference?.display ?? null;
  if (patient === null) notMapped.push({ element: 'subject', reason: 'No patient reference.' });
  if (medication === null) notMapped.push({ element: 'medication[x]', reason: 'No medication name.' });
  if (patient === null || medication === null) return { kind: 'none' };

  const fact = factAbout({
    patient,
    predicate: 'takes',
    object: { type: 'medication', name: medication },
    statement: `${patient.label} takes ${medication}.`,
    confidence: CONFIRMED_CONFIDENCE,
    validFrom: readStart(
      resource.effectivePeriod?.start ?? resource.effectiveDateTime,
      'effective[x]',
      notMapped,
    ),
    validTo: readInclusiveEnd(resource.effectivePeriod?.end, 'effectivePeriod.end', notMapped),
  });
  switch (resource.status) {
    case 'active':
      return { kind: 'states', fact };
    case 'completed':
    case 'stopped':
      if (fact.validTo !== null) return { kind: 'states', fact };
      notMapped.push({
        element: 'status',
        reason: `"${resource.status}" with no effectivePeriod.end: when it stopped is unknown.`,
      });
      return { kind: 'none' };
    case 'entered-in-error':
      return { kind: 'withdraws', fact };
    case 'not-taken':
      return {
        kind: 'states',
        fact: {
          ...fact,
          predicate: 'not_taking',
          statement: `${patient.label} does not take ${medication}.`,
        },
      };
    case 'intended':
    case 'on-hold':
    case 'unknown':
      notMapped.push({
        element: 'status',
        reason: `"${resource.status}" says nothing that holds over a period.`,
      });
      return { kind: 'none' };
    default: {
      const unhandled: never = resource.status;
      throw new Error(`Unhandled status: ${String(unhandled)}`);
    }
  }
}

/** The verification statuses that mean no fact: refuted is a clinical judgement, not an error. */
function mapVerification(
  verification: string | null,
  fact: StructuredFactInput,
  negated: StructuredFactInput,
): FhirClaim | null {
  if (verification === 'entered-in-error') return { kind: 'withdraws', fact };
  // ADR 0027: "refuted" is a clinical statement that it was ruled out, recorded as its own fact.
  if (verification === 'refuted') return { kind: 'states', fact: negated };
  return null;
}

function mapCondition(resource: Condition, notMapped: NotMappedElement[]): FhirClaim {
  const patient = readPatient(resource.subject);
  const condition = readName(resource.code);
  if (patient === null) notMapped.push({ element: 'subject', reason: 'No patient reference.' });
  if (condition === null) notMapped.push({ element: 'code', reason: 'No condition name.' });
  if (patient === null || condition === null) return { kind: 'none' };

  noteInexactOnset(resource, notMapped);
  for (const element of ['abatementAge', 'abatementPeriod', 'abatementRange', 'abatementString'] as const) {
    if (resource[element] !== undefined) {
      notMapped.push({ element, reason: 'An abatement with no exact date is not mapped.' });
    }
  }
  const verification = readCode(resource.verificationStatus);
  const fact = factAbout({
    patient,
    predicate: 'has_condition',
    object: { type: 'condition', name: condition },
    statement: `${patient.label} has the condition ${condition}.`,
    confidence: readConfidence(verification),
    validFrom: readStart(resource.onsetPeriod?.start ?? resource.onsetDateTime, 'onset[x]', notMapped),
    // Abatement is the moment it resolved: from then on, it no longer holds.
    validTo: readStart(resource.abatementDateTime, 'abatementDateTime', notMapped),
  });
  const ruledOut = factAbout({
    patient,
    predicate: 'ruled_out',
    object: { type: 'condition', name: condition },
    statement: `${patient.label}: ${condition} ruled out.`,
    confidence: CONFIRMED_CONFIDENCE,
    // ADR 0027: R4 gives no period of the ruling-out; it holds from when it was recorded, if given.
    validFrom: readStart(resource.recordedDate, 'recordedDate', notMapped),
    validTo: null,
  });
  const verified = mapVerification(verification, fact, ruledOut);
  if (verified !== null) return verified;

  const clinical = readCode(resource.clinicalStatus);
  if (clinical === 'inactive' || clinical === 'resolved' || clinical === 'remission') {
    if (fact.validTo !== null) return { kind: 'states', fact };
    notMapped.push({
      element: 'clinicalStatus',
      reason: `"${clinical}" with no abatementDateTime: when it ended is unknown.`,
    });
    return { kind: 'none' };
  }
  return { kind: 'states', fact };
}

function mapAllergyIntolerance(resource: AllergyIntolerance, notMapped: NotMappedElement[]): FhirClaim {
  const patient = readPatient(resource.patient);
  const substance = readName(resource.code);
  if (patient === null) notMapped.push({ element: 'patient', reason: 'No patient reference.' });
  if (substance === null) notMapped.push({ element: 'code', reason: 'No substance name.' });
  if (patient === null || substance === null) return { kind: 'none' };

  noteInexactOnset(resource, notMapped);
  const verification = readCode(resource.verificationStatus);
  const fact = factAbout({
    patient,
    predicate: 'allergic_to',
    object: { type: 'substance', name: substance },
    statement: `${patient.label} is allergic to ${substance}.`,
    confidence: readConfidence(verification),
    // R4: onset is when the allergy was identified, the earliest moment it is known to hold.
    validFrom: readStart(resource.onsetPeriod?.start ?? resource.onsetDateTime, 'onset[x]', notMapped),
    validTo: null,
  });
  const notAllergic = factAbout({
    patient,
    predicate: 'not_allergic_to',
    object: { type: 'substance', name: substance },
    statement: `${patient.label} is not allergic to ${substance}.`,
    confidence: CONFIRMED_CONFIDENCE,
    validFrom: readStart(resource.recordedDate, 'recordedDate', notMapped),
    validTo: null,
  });
  const verified = mapVerification(verification, fact, notAllergic);
  if (verified !== null) return verified;

  const clinical = readCode(resource.clinicalStatus);
  if (clinical === 'inactive' || clinical === 'resolved') {
    notMapped.push({
      element: 'clinicalStatus',
      reason: `"${clinical}": R4 AllergyIntolerance has no date it ended.`,
    });
    return { kind: 'none' };
  }
  return { kind: 'states', fact };
}

/**
 * Maps one FHIR R4 resource to what it says about memory, by fixed rules and with no LLM
 * (FL-092). Valid time starts at the earliest moment a date allows; an inclusive FHIR end
 * becomes the first moment after it. The whole resource is the source's content, so its own
 * recorded and asserted dates and any date given more loosely are kept.
 */
export function mapFhirResource(resource: MappedResource): FhirStatement {
  const notMapped: NotMappedElement[] = [];
  const claim =
    resource.resourceType === 'MedicationStatement'
      ? mapMedicationStatement(resource, notMapped)
      : resource.resourceType === 'Condition'
        ? mapCondition(resource, notMapped)
        : mapAllergyIntolerance(resource, notMapped);
  const locator = `${resource.resourceType}/${resource.id}`;
  return {
    resource: locator,
    claim,
    source: { kind: 'fhir_resource', locator, version: resource.meta?.versionId ?? null },
    content: JSON.stringify(resource),
    notMapped,
  };
}
