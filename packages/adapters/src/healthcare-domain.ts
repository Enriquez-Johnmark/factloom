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
  ],
  extractionInstructions:
    'The records are invented. Extract only what the text states about a patient: a condition, a medication taken, or an allergy to a substance. Do not infer a diagnosis.',
  correctionPolicy: 'human_approval',
};
