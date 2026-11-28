import { z } from 'zod';

// Only the elements the import reads are described. Every other element is kept as it is
// (`looseObject`), so a real resource passes, and the whole resource is kept as the source.
// Element names and status codes are from HL7 FHIR R4 (4.0.1), read on 2026-11-28
// (docs/research/industries/healthcare-rules.md, F1 to F9).

const CodingSchema = z.looseObject({
  system: z.string().optional(),
  code: z.string().optional(),
  display: z.string().optional(),
});

/** A coded concept with optional text, as R4 `CodeableConcept`. */
export const CodeableConceptSchema = z.looseObject({
  coding: z.array(CodingSchema).optional(),
  text: z.string().optional(),
});
export type CodeableConcept = z.infer<typeof CodeableConceptSchema>;

/** A reference to another resource, as R4 `Reference`. */
export const ReferenceSchema = z.looseObject({
  reference: z.string().optional(),
  display: z.string().optional(),
});
export type Reference = z.infer<typeof ReferenceSchema>;

const PeriodSchema = z.looseObject({ start: z.string().optional(), end: z.string().optional() });

const MetaSchema = z.looseObject({ versionId: z.string().optional(), source: z.string().optional() });

const ResourceBaseShape = {
  id: z.string().min(1),
  meta: MetaSchema.optional(),
};

/** The onset and abatement choices of R4, `[x]` written out. */
const OnsetShape = {
  onsetDateTime: z.string().optional(),
  onsetPeriod: PeriodSchema.optional(),
  onsetAge: z.unknown().optional(),
  onsetRange: z.unknown().optional(),
  onsetString: z.string().optional(),
};

/** R4 MedicationStatement, the elements the import reads. */
export const MedicationStatementSchema = z.looseObject({
  resourceType: z.literal('MedicationStatement'),
  ...ResourceBaseShape,
  status: z.enum([
    'active',
    'completed',
    'entered-in-error',
    'intended',
    'stopped',
    'on-hold',
    'unknown',
    'not-taken',
  ]),
  medicationCodeableConcept: CodeableConceptSchema.optional(),
  medicationReference: ReferenceSchema.optional(),
  subject: ReferenceSchema,
  effectiveDateTime: z.string().optional(),
  effectivePeriod: PeriodSchema.optional(),
  dateAsserted: z.string().optional(),
});
export type MedicationStatement = z.infer<typeof MedicationStatementSchema>;

/** R4 Condition, the elements the import reads. */
export const ConditionSchema = z.looseObject({
  resourceType: z.literal('Condition'),
  ...ResourceBaseShape,
  clinicalStatus: CodeableConceptSchema.optional(),
  verificationStatus: CodeableConceptSchema.optional(),
  code: CodeableConceptSchema.optional(),
  subject: ReferenceSchema,
  ...OnsetShape,
  abatementDateTime: z.string().optional(),
  abatementAge: z.unknown().optional(),
  abatementPeriod: z.unknown().optional(),
  abatementRange: z.unknown().optional(),
  abatementString: z.string().optional(),
  recordedDate: z.string().optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;

/** R4 AllergyIntolerance, the elements the import reads. */
export const AllergyIntoleranceSchema = z.looseObject({
  resourceType: z.literal('AllergyIntolerance'),
  ...ResourceBaseShape,
  clinicalStatus: CodeableConceptSchema.optional(),
  verificationStatus: CodeableConceptSchema.optional(),
  code: CodeableConceptSchema.optional(),
  patient: ReferenceSchema,
  ...OnsetShape,
  recordedDate: z.string().optional(),
});
export type AllergyIntolerance = z.infer<typeof AllergyIntoleranceSchema>;

/** One of the three resource types the import maps. */
export const MappedResourceSchema = z.discriminatedUnion('resourceType', [
  MedicationStatementSchema,
  ConditionSchema,
  AllergyIntoleranceSchema,
]);
export type MappedResource = z.infer<typeof MappedResourceSchema>;

/** The resource types the import maps; any other is reported and left alone. */
export const MAPPED_RESOURCE_TYPES: readonly string[] = [
  'MedicationStatement',
  'Condition',
  'AllergyIntolerance',
];
