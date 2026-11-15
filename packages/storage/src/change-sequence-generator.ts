// Generates sequences of changes to memory over a small world, for property-based tests.
// The world is small on purpose: a few subjects, predicates, values and dates, so that
// overlapping periods, repeated values and boundary dates come up often.
import type { Change, ChangeSet, Fact, MemoryStore, Timestamp } from '@factloom/core';
import { toTimestamp } from '@factloom/core';
import fc from 'fast-check';

export const PROPERTY_NAMESPACE = 'repo:property';
export const SUBJECT_IDS = ['e-1', 'e-2'] as const;
export const PREDICATES = [
  { name: 'single_a', singleValued: true },
  { name: 'single_b', singleValued: true },
  { name: 'multi_a', singleValued: false },
] as const;
const VALUES = ['red', 'green', 'blue'] as const;

/** The range of days that valid periods are drawn from: a short stretch of 2025. */
export const VALID_DAY_RANGE = 20;

/** Day `offset` of the valid range, as a timestamp. */
export function validDay(offset: number): Timestamp {
  return toTimestamp(new Date(Date.UTC(2025, 0, 1 + offset)));
}

/** The moment of commit number `index`. Commits are a day apart in 2026, after every valid day. */
export function commitTime(index: number): Timestamp {
  return toTimestamp(new Date(Date.UTC(2026, 0, 1 + index)));
}

/** One step of a sequence, as an intention. It becomes a change set when it meets the store's state. */
export type Step =
  | {
      readonly kind: 'record';
      readonly subject: number;
      readonly predicate: number;
      readonly value: number;
      readonly from: number | null;
      readonly to: number | null;
    }
  | { readonly kind: 'invalidate'; readonly pick: number; readonly replaceWith: number | null }
  | { readonly kind: 'end'; readonly pick: number; readonly to: number }
  | { readonly kind: 'attach'; readonly pick: number }
  | { readonly kind: 'invalidate_missing' };

const dayOrOpen = fc.option(fc.integer({ min: 0, max: VALID_DAY_RANGE }), { nil: null });

/** A step. Records are the most common, so that there is memory for the other steps to act on. */
export const stepArbitrary: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      kind: fc.constant('record' as const),
      subject: fc.integer({ min: 0, max: SUBJECT_IDS.length - 1 }),
      predicate: fc.integer({ min: 0, max: PREDICATES.length - 1 }),
      value: fc.integer({ min: 0, max: VALUES.length - 1 }),
      from: dayOrOpen,
      to: dayOrOpen,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('invalidate' as const),
      pick: fc.nat(),
      replaceWith: fc.option(fc.integer({ min: 0, max: VALUES.length - 1 }), { nil: null }),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('end' as const),
      pick: fc.nat(),
      to: fc.integer({ min: 0, max: VALID_DAY_RANGE }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('attach' as const), pick: fc.nat() }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'invalidate_missing' as const }) },
);

export const sequenceArbitrary: fc.Arbitrary<readonly Step[]> = fc.array(stepArbitrary, {
  minLength: 1,
  maxLength: 12,
});

function newFact(
  id: string,
  subject: number,
  predicate: number,
  value: number,
  from: number | null,
  to: number | null,
  createdAt: Timestamp,
): Fact {
  const predicateName = PREDICATES[predicate % PREDICATES.length]?.name ?? PREDICATES[0].name;
  const valueText = VALUES[value % VALUES.length] ?? VALUES[0];
  return {
    id,
    namespace: PROPERTY_NAMESPACE,
    subjectEntityId: SUBJECT_IDS[subject % SUBJECT_IDS.length] ?? SUBJECT_IDS[0],
    predicate: predicateName,
    object: { kind: 'value', value: valueText },
    statement: `${predicateName} is ${valueText}`,
    confidence: 1,
    validFrom: from === null ? null : validDay(from),
    validTo: to === null ? null : validDay(to),
    createdAt,
    invalidatedAt: null,
    supersededByFactId: null,
  };
}

function isSingleValued(predicateName: string): boolean {
  return PREDICATES.find((predicate) => predicate.name === predicateName)?.singleValued ?? false;
}

function vectorOf(fact: Fact): Float32Array {
  const text = fact.object.kind === 'value' ? fact.object.value : '';
  const value = VALUES.findIndex((known) => known === text);
  return new Float32Array([1, value === 0 ? 1 : 0, value === 1 ? 1 : 0, value === 2 ? 1 : 0]);
}

function record(
  fact: Fact,
  sourceId: string,
  embedding: Float32Array | { copyFromFactId: string } = vectorOf(fact),
): Change {
  return {
    kind: 'record_fact',
    fact,
    sourceIds: [sourceId],
    embedding,
    singleValued: isSingleValued(fact.predicate),
  };
}

/** The change set that seeds every sequence: the subjects, and nothing else. */
export function seedChangeSet(): ChangeSet {
  return {
    namespace: PROPERTY_NAMESPACE,
    operationId: 'op-seed',
    operation: 'remember',
    trigger: 'agent',
    reasonCode: 'stated',
    explainedBySourceId: null,
    occurredAt: commitTime(0),
    changes: SUBJECT_IDS.map((id) => ({
      kind: 'create_entity' as const,
      entity: { id, namespace: PROPERTY_NAMESPACE, type: 'thing', name: id, createdAt: commitTime(0) },
    })),
  };
}

/**
 * Turns step number `index` into a change set, given the facts the store holds. Every change
 * set records its own source, so that a fact always has one to cite. A step that picks a fact
 * picks among all facts ever recorded, live or not, so that refusals are generated too.
 */
export function toChangeSet(step: Step, index: number, existing: readonly Fact[]): ChangeSet {
  const occurredAt = commitTime(index);
  const sourceId = `s-${index}`;
  const picked = (pick: number): Fact | undefined => existing[pick % Math.max(existing.length, 1)];
  const changes: Change[] = [
    {
      kind: 'record_source',
      source: {
        id: sourceId,
        namespace: PROPERTY_NAMESPACE,
        kind: 'agent_note',
        locator: null,
        version: null,
        content: `step ${index}`,
        contentHash: null,
        observedAt: occurredAt,
        createdAt: occurredAt,
      },
    },
  ];
  let operation: ChangeSet['operation'] = 'remember';
  switch (step.kind) {
    case 'record':
      changes.push(
        record(
          newFact(`f-${index}`, step.subject, step.predicate, step.value, step.from, step.to, occurredAt),
          sourceId,
        ),
      );
      break;
    case 'invalidate': {
      const target = picked(step.pick);
      const targetId = target?.id ?? 'missing';
      if (step.replaceWith !== null && target !== undefined) {
        const replacement: Fact = {
          ...newFact(`f-${index}`, 0, 0, step.replaceWith, null, null, occurredAt),
          subjectEntityId: target.subjectEntityId,
          predicate: target.predicate,
          statement: `${target.predicate} is ${VALUES[step.replaceWith % VALUES.length] ?? VALUES[0]}`,
          validFrom: target.validFrom,
          validTo: target.validTo,
        };
        changes.push(record(replacement, sourceId), {
          kind: 'invalidate_fact',
          factId: targetId,
          supersededByFactId: replacement.id,
        });
        operation = 'correction';
      } else {
        changes.push({ kind: 'invalidate_fact', factId: targetId, supersededByFactId: null });
        operation = 'retraction';
      }
      break;
    }
    case 'end': {
      const target = picked(step.pick);
      if (target === undefined) {
        changes.push({ kind: 'invalidate_fact', factId: 'missing', supersededByFactId: null });
      } else {
        const copy: Fact = {
          ...target,
          id: `f-${index}`,
          validTo: validDay(step.to),
          createdAt: occurredAt,
          invalidatedAt: null,
          supersededByFactId: null,
        };
        changes.push(record(copy, sourceId, { copyFromFactId: target.id }), {
          kind: 'invalidate_fact',
          factId: target.id,
          supersededByFactId: copy.id,
        });
      }
      operation = 'revision';
      break;
    }
    case 'attach':
      changes.push({ kind: 'attach_source', factId: picked(step.pick)?.id ?? 'missing', sourceId });
      break;
    case 'invalidate_missing':
      changes.push({ kind: 'invalidate_fact', factId: 'missing', supersededByFactId: null });
      operation = 'retraction';
      break;
    default: {
      const unhandled: never = step;
      return unhandled;
    }
  }
  return {
    namespace: PROPERTY_NAMESPACE,
    operationId: `op-${index}`,
    operation,
    trigger: 'agent',
    reasonCode: 'stated',
    explainedBySourceId: sourceId,
    occurredAt,
    changes,
  };
}

/** Every fact the store holds in the property namespace, invalidated ones included, oldest first. */
export async function allFacts(store: MemoryStore) {
  const listed = await store.listFacts({
    namespace: PROPERTY_NAMESPACE,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time: 'all',
    limit: 10_000,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return [...listed.value].reverse();
}
