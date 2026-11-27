import { type FactObject, type FactWithSources, parseDateInput, type Timestamp } from '@kronomind/core';
import { describe, expect, it } from 'vitest';
import { type ComparedFact, compareWithCandidates } from './compare-with-candidates.ts';

function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

/** A live fact of shop-api, as conflict candidates are given. */
function candidate(
  id: string,
  object: FactObject,
  validFrom: string | null = null,
  validTo: string | null = null,
): FactWithSources {
  return {
    fact: {
      id,
      namespace: 'repo:shop-api',
      subjectEntityId: 'e-shop',
      predicate: 'uses_database_version',
      object,
      statement: 'shop-api runs a database version.',
      confidence: 1,
      validFrom: validFrom === null ? null : at(validFrom),
      validTo: validTo === null ? null : at(validTo),
      createdAt: at('2026-01-10'),
      invalidatedAt: null,
      purgedAt: null,
      supersededByFactId: null,
    },
    subject: {
      id: 'e-shop',
      namespace: 'repo:shop-api',
      type: 'repository',
      name: 'shop-api',
      createdAt: at('2026-01-10'),
    },
    objectEntity: null,
    sources: [],
    archivedAt: null,
  };
}

function fact(object: FactObject, overrides: Partial<ComparedFact> = {}): ComparedFact {
  return { object, validFrom: null, validTo: null, singleValued: true, ...overrides };
}

const value = (text: string): FactObject => ({ kind: 'value', value: text });
const entity = (entityId: string): FactObject => ({ kind: 'entity', entityId });

describe('compareWithCandidates', () => {
  it('a different object under a single-valued predicate conflicts', () => {
    const comparison = compareWithCandidates(fact(value('postgres 16')), [
      candidate('f-1', value('postgres 15')),
    ]);

    expect(comparison).toEqual({ kind: 'conflicts', conflictingFactIds: ['f-1'] });
  });

  it('a different object under a multi-valued predicate is new', () => {
    const comparison = compareWithCandidates(fact(entity('e-yaml'), { singleValued: false }), [
      candidate('f-1', entity('e-zod')),
    ]);

    expect(comparison).toEqual({ kind: 'new' });
  });

  it('the same entity or an equal value restates', () => {
    expect(compareWithCandidates(fact(entity('e-zod')), [candidate('f-1', entity('e-zod'))])).toEqual({
      kind: 'restates',
      factId: 'f-1',
    });
    expect(
      compareWithCandidates(fact(value('postgres 15')), [candidate('f-2', value('postgres 15'))]),
    ).toEqual({
      kind: 'restates',
      factId: 'f-2',
    });
  });

  it('an entity and a value with the same text are different objects', () => {
    const comparison = compareWithCandidates(fact(value('e-zod')), [candidate('f-1', entity('e-zod'))]);

    expect(comparison.kind).toBe('conflicts');
  });

  it('names the first, newest, candidate that the fact restates', () => {
    const comparison = compareWithCandidates(fact(value('zod'), { singleValued: false }), [
      candidate('f-newer', value('zod')),
      candidate('f-older', value('zod')),
    ]);

    expect(comparison).toEqual({ kind: 'restates', factId: 'f-newer' });
  });

  it('a period that only touches does not overlap', () => {
    const comparison = compareWithCandidates(
      fact(value('postgres 15'), { validFrom: at('2025-01-01'), validTo: at('2026-03-01') }),
      [candidate('f-1', value('postgres 16'), '2026-03-01')],
    );

    expect(comparison).toEqual({ kind: 'new' });
  });

  it('is new when there are no candidates', () => {
    expect(compareWithCandidates(fact(value('postgres 15')), [])).toEqual({ kind: 'new' });
  });
});
