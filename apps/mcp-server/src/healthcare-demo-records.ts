// INVENTED DATA. The demo's one patient and every record below are invented; no record of a
// real person is used. They tell the cases of the healthcare scenarios (FL-093) as one story.

const PATIENT = { reference: 'Patient/invented-a', display: 'Invented Patient A' };

const metformin = {
  resourceType: 'MedicationStatement',
  id: 'invented-ms-1',
  status: 'active',
  medicationCodeableConcept: { text: 'metformin' },
  subject: PATIENT,
  effectivePeriod: { start: '2026-01-10' },
};

const penicillinAllergy = {
  resourceType: 'AllergyIntolerance',
  id: 'invented-ai-1',
  clinicalStatus: { coding: [{ code: 'active' }] },
  verificationStatus: { coding: [{ code: 'confirmed' }] },
  code: { text: 'penicillin' },
  patient: PATIENT,
  onsetDateTime: '2025-11',
};

const diabetes = {
  resourceType: 'Condition',
  id: 'invented-c-1',
  clinicalStatus: { coding: [{ code: 'active' }] },
  verificationStatus: { coding: [{ code: 'confirmed' }] },
  code: { text: 'type 2 diabetes mellitus' },
  subject: PATIENT,
  onsetDateTime: '2025',
};

/** One import of the story: the day it happens, what it is, and the records it brings. */
export type DemoImport = {
  readonly at: string;
  readonly title: string;
  readonly records: readonly unknown[];
};

/** The story, in order of time. */
export const DEMO_IMPORTS: readonly DemoImport[] = [
  {
    at: '2026-01-10',
    title:
      'The first visit is recorded: metformin from today, a penicillin allergy, type 2 diabetes since 2025.',
    records: [metformin, penicillinAllergy, diabetes],
  },
  {
    at: '2026-04-20',
    title: 'The allergy is found to be entered in error.',
    records: [
      {
        ...penicillinAllergy,
        meta: { versionId: '2' },
        verificationStatus: { coding: [{ code: 'entered-in-error' }] },
      },
    ],
  },
  {
    at: '2026-05-02',
    title: 'Metformin is stopped; its last day was 2026-05-01.',
    records: [
      {
        ...metformin,
        meta: { versionId: '2' },
        status: 'stopped',
        effectivePeriod: { start: '2026-01-10', end: '2026-05-01' },
      },
    ],
  },
];

/** The day the clinician decides, and the moment the questions are asked. */
export const DEMO_DECISION_DAY = '2026-05-03';
export const DEMO_NOW = '2026-05-04';
