import { describe, expect, it } from 'vitest';
import type { Fact } from './fact.ts';
import { parseDateInput, type Timestamp } from './timestamp.ts';
import { matchesTimeFilter, periodsOverlap } from './valid-period.ts';

function day(text: string): Timestamp {
  const parsed = parseDateInput(text);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

const period = (from: string | null, to: string | null) => ({
  validFrom: from === null ? null : day(from),
  validTo: to === null ? null : day(to),
});

describe('periodsOverlap', () => {
  it('finds two open-ended periods overlapping', () => {
    expect(periodsOverlap(period('2026-03-15', null), period('2026-06-01', null))).toBe(true);
  });

  it('finds an older period overlapping the one it runs into', () => {
    expect(periodsOverlap(period('2024-01-01', '2025-09-01'), period('2025-06-01', '2026-03-15'))).toBe(true);
  });

  it('finds no overlap when one period ends where the other starts', () => {
    expect(periodsOverlap(period('2024-01-01', '2025-06-01'), period('2025-06-01', '2026-03-15'))).toBe(
      false,
    );
    expect(periodsOverlap(period('2025-06-01', '2026-03-15'), period('2024-01-01', '2025-06-01'))).toBe(
      false,
    );
  });

  it('finds a period dated in the future overlapping an open-ended one', () => {
    expect(periodsOverlap(period('2027-01-01', null), period('2026-03-15', null))).toBe(true);
  });

  it('treats an unknown start as open, so it overlaps everything before its end', () => {
    expect(periodsOverlap(period(null, '2025-07-01'), period('2025-06-01', '2026-03-15'))).toBe(true);
    expect(periodsOverlap(period(null, '2025-06-01'), period('2025-06-01', '2026-03-15'))).toBe(false);
  });

  it('treats two periods with no bounds as overlapping', () => {
    expect(periodsOverlap(period(null, null), period(null, null))).toBe(true);
  });

  it('gives the same answer whichever period is given first', () => {
    const periods = [
      period(null, null),
      period('2024-01-01', '2025-06-01'),
      period('2025-06-01', null),
      period(null, '2026-01-01'),
    ];
    for (const a of periods) for (const b of periods) expect(periodsOverlap(a, b)).toBe(periodsOverlap(b, a));
  });
});

describe('matchesTimeFilter', () => {
  const fact: Fact = {
    id: 'f-1',
    namespace: 'repo:example',
    subjectEntityId: 'e-repo',
    predicate: 'uses_database_version',
    object: { kind: 'value', value: 'PostgreSQL 14' },
    statement: 'The example repository uses PostgreSQL 14',
    confidence: 1,
    validFrom: day('2025-06-01'),
    validTo: day('2026-03-15'),
    createdAt: day('2026-01-10'),
    invalidatedAt: day('2026-06-01'),
    supersededByFactId: null,
  };

  it('accepts a fact inside both its valid period and its recorded period', () => {
    expect(matchesTimeFilter(fact, { validAt: day('2026-02-01'), knownAt: day('2026-02-01') })).toBe(true);
  });

  it('includes the start of each period and excludes its end', () => {
    expect(matchesTimeFilter(fact, { validAt: day('2025-06-01'), knownAt: day('2026-01-10') })).toBe(true);
    expect(matchesTimeFilter(fact, { validAt: day('2026-03-15'), knownAt: day('2026-02-01') })).toBe(false);
    expect(matchesTimeFilter(fact, { validAt: day('2026-02-01'), knownAt: day('2026-06-01') })).toBe(false);
  });

  it('rejects a fact before it was recorded, whatever the as-of date', () => {
    expect(matchesTimeFilter(fact, { validAt: day('2026-02-01'), knownAt: day('2026-01-09') })).toBe(false);
  });

  it('treats a missing bound as open', () => {
    const open: Fact = { ...fact, validFrom: null, validTo: null, invalidatedAt: null };
    expect(matchesTimeFilter(open, { validAt: day('1990-01-01'), knownAt: day('2030-01-01') })).toBe(true);
  });
});
