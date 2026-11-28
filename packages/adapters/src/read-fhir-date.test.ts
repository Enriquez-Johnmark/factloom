import { describe, expect, it } from 'vitest';
import { readFhirDate } from './read-fhir-date.ts';

describe('readFhirDate', () => {
  it('reads a year as all of that year, from its first moment to the first moment of the next', () => {
    expect(readFhirDate('2026')).toEqual({
      start: '2026-01-01T00:00:00.000Z',
      after: '2027-01-01T00:00:00.000Z',
    });
  });

  it('reads a month and a day the same way, so an inclusive end becomes the next month or day', () => {
    expect(readFhirDate('2026-02')).toEqual({
      start: '2026-02-01T00:00:00.000Z',
      after: '2026-03-01T00:00:00.000Z',
    });
    expect(readFhirDate('2026-06-30')).toEqual({
      start: '2026-06-30T00:00:00.000Z',
      after: '2026-07-01T00:00:00.000Z',
    });
  });

  it('reads a date and time with its zone as one millisecond in UTC', () => {
    expect(readFhirDate('2026-03-15T09:30:00+08:00')).toEqual({
      start: '2026-03-15T01:30:00.000Z',
      after: '2026-03-15T01:30:00.001Z',
    });
  });

  it('refuses a day that does not exist, a time with no zone, and text that is not a date', () => {
    expect([readFhirDate('2026-02-30'), readFhirDate('2026-03-15T09:30:00'), readFhirDate('spring')]).toEqual(
      [null, null, null],
    );
  });
});
