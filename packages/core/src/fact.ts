import { z } from 'zod';
import { type Timestamp, TimestampSchema } from './timestamp.ts';

/** An identifier or a name: text with at least one character. */
const NonEmptyTextSchema = z.string().min(1);

/** A hard partition of memory. Nothing is read or linked across namespaces. */
export const NamespaceSchema = NonEmptyTextSchema;
export type Namespace = z.infer<typeof NamespaceSchema>;

export const EntityIdSchema = NonEmptyTextSchema;
export type EntityId = z.infer<typeof EntityIdSchema>;

export const FactIdSchema = NonEmptyTextSchema;
export type FactId = z.infer<typeof FactIdSchema>;

export const SourceIdSchema = NonEmptyTextSchema;
export type SourceId = z.infer<typeof SourceIdSchema>;

/** A thing that facts are about. Never edited or deleted once created. */
export const EntitySchema = z
  .strictObject({
    id: EntityIdSchema,
    namespace: NamespaceSchema,
    type: NonEmptyTextSchema,
    name: NonEmptyTextSchema,
    createdAt: TimestampSchema,
  })
  .readonly();
export type Entity = z.infer<typeof EntitySchema>;

/** What a fact relates its subject to: another entity, or a literal value. Never both, never neither. */
export const FactObjectSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('entity'), entityId: EntityIdSchema }).readonly(),
  z
    .strictObject({
      kind: z.literal('value'),
      value: z.string(),
      /** FL-099, ADR 0028: the value's unit, such as a UCUM code; absent when the value has none. */
      unit: z.string().min(1).exactOptional(),
    })
    .readonly(),
]);
export type FactObject = z.infer<typeof FactObjectSchema>;

/** The rules a fact must keep. Each returns a message when it is broken. The database enforces the first five too. */
const FACT_RULES: readonly ((fact: {
  readonly id: FactId;
  readonly validFrom: Timestamp | null;
  readonly validTo: Timestamp | null;
  readonly createdAt: Timestamp;
  readonly invalidatedAt: Timestamp | null;
  readonly supersededByFactId: FactId | null;
}) => string | null)[] = [
  (fact) =>
    fact.validFrom !== null && fact.validTo !== null && fact.validFrom >= fact.validTo
      ? 'validFrom must be before validTo: the valid period is half-open and cannot be empty.'
      : null,
  (fact) =>
    fact.invalidatedAt !== null && fact.invalidatedAt < fact.createdAt
      ? 'invalidatedAt cannot be before createdAt.'
      : null,
  (fact) =>
    fact.supersededByFactId !== null && fact.invalidatedAt === null
      ? 'A fact can be superseded only when it is invalidated.'
      : null,
  (fact) => (fact.supersededByFactId === fact.id ? 'A fact cannot supersede itself.' : null),
];

/**
 * One claim: a subject, a predicate and an object, with its valid time (when it was true)
 * and its recorded time (when Kronomind believed it). A fact is never edited: the only change
 * ever made to one is its invalidation.
 */
export const FactSchema = z
  .strictObject({
    id: FactIdSchema,
    namespace: NamespaceSchema,
    subjectEntityId: EntityIdSchema,
    predicate: NonEmptyTextSchema,
    object: FactObjectSchema,
    statement: NonEmptyTextSchema,
    confidence: z.number().min(0).max(1),
    validFrom: TimestampSchema.nullable(),
    validTo: TimestampSchema.nullable(),
    createdAt: TimestampSchema,
    invalidatedAt: TimestampSchema.nullable(),
    supersededByFactId: FactIdSchema.nullable(),
    /** When the fact's text was purged and replaced by `PURGED_MARKER`, or null. */
    purgedAt: TimestampSchema.nullable(),
  })
  .check((context) => {
    for (const rule of FACT_RULES) {
      const message = rule(context.value);
      if (message !== null) context.issues.push({ code: 'custom', message, input: context.value });
    }
  })
  .readonly();
export type Fact = z.infer<typeof FactSchema>;

/** Where a fact came from. Its locator and version together are the anchor. */
export const SourceSchema = z
  .strictObject({
    id: SourceIdSchema,
    namespace: NamespaceSchema,
    kind: NonEmptyTextSchema,
    locator: z.string().nullable(),
    version: z.string().nullable(),
    content: z.string().nullable(),
    contentHash: z.string().nullable(),
    observedAt: TimestampSchema,
    createdAt: TimestampSchema,
    /** When the source's content and locator were purged, or null. */
    purgedAt: TimestampSchema.nullable(),
  })
  .readonly();
export type Source = z.infer<typeof SourceSchema>;

/** The text that replaces purged content (ADR 0012). A row's `purgedAt` says it was purged. */
export const PURGED_MARKER = '[purged]';

/** A fact as a read returns it: with the entities it names and the sources it came from. */
export const FactWithSourcesSchema = z
  .strictObject({
    fact: FactSchema,
    subject: EntitySchema,
    objectEntity: EntitySchema.nullable(),
    sources: z.array(SourceSchema).readonly(),
    /** Since when the fact is an archived fact, or null when it is not. */
    archivedAt: TimestampSchema.nullable(),
  })
  .readonly();
export type FactWithSources = z.infer<typeof FactWithSourcesSchema>;

/** The two dates of a read. Together they are the whole of time handling at read time. */
export const TimeFilterSchema = z
  .strictObject({
    /** The as-of date: what was true in the world then. */
    validAt: TimestampSchema,
    /** The known-at date: what Kronomind believed then. */
    knownAt: TimestampSchema,
  })
  .readonly();
export type TimeFilter = z.infer<typeof TimeFilterSchema>;
