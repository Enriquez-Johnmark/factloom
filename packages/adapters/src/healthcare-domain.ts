import type { Domain } from '@kronomind/core';

/**
 * The healthcare domain, for a proof on invented records only (ADR 0026). It starts with the
 * entity types and predicates its scenarios use (FL-093); each further one is added when a
 * scenario needs it. Every predicate holds many values, because a patient can have several
 * conditions, medications and allergies at once. Every change to a stored fact waits for a
 * person's approval.
 */
export const healthcareDomain: Domain = {
  name: 'healthcare',
  entityTypes: ['patient', 'condition', 'medication', 'substance'],
  predicates: [
    {
      name: 'has_condition',
      description:
        'A patient has a condition, for example the patient has_condition "type 2 diabetes mellitus".',
      cardinality: 'multi',
    },
    {
      name: 'takes',
      description: 'A patient takes a medication, for example the patient takes "metformin".',
      cardinality: 'multi',
    },
    {
      name: 'allergic_to',
      description: 'A patient is allergic to a substance, for example the patient allergic_to "penicillin".',
      cardinality: 'multi',
    },
    // ADR 0027: a negated clinical fact is its own predicate, never a flag.
    {
      name: 'ruled_out',
      description: 'A condition was ruled out for a patient, for example the patient ruled_out "asthma".',
      cardinality: 'multi',
    },
    {
      name: 'not_allergic_to',
      description:
        'A patient is not allergic to a substance, for example the patient not_allergic_to "penicillin".',
      cardinality: 'multi',
    },
    {
      name: 'not_taking',
      description: 'A patient does not take a medication, for example the patient not_taking "metformin".',
      cardinality: 'multi',
    },
  ],
  extractionInstructions:
    'The records are invented. Extract only what the text states about a patient: a condition, a medication taken, or an allergy to a substance. Do not infer a diagnosis.',
  correctionPolicy: 'human_approval',
};

/** The predicates of the healthcare domain. */
export type HealthcarePredicate =
  | 'has_condition'
  | 'takes'
  | 'allergic_to'
  | 'ruled_out'
  | 'not_allergic_to'
  | 'not_taking';

/**
 * Each predicate and the one that says the opposite (ADR 0027). Conflict detection in core does
 * not know these pairs, so the FHIR import checks them: a statement over a live opposite is a
 * correction for a clinician to decide.
 */
export const OPPOSITE_PREDICATES: Readonly<Record<HealthcarePredicate, HealthcarePredicate>> = {
  has_condition: 'ruled_out',
  ruled_out: 'has_condition',
  allergic_to: 'not_allergic_to',
  not_allergic_to: 'allergic_to',
  takes: 'not_taking',
  not_taking: 'takes',
};
