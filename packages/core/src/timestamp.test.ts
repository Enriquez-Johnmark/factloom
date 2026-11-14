import { describe, expect, it } from 'vitest';
import { parseDateInput, type Timestamp, TimestampSchema, toTimestamp } from './timestamp.ts';

/** The forms that are not accepted, with the reason each one is listed. */
const REFUSED_FORMS: readonly (readonly [form: string, why: string])[] = [
  ['2026-01-10 00:00:00.000Z', 'a space in place of T'],
  ['2026-01-10T00:00:00Z', 'no milliseconds'],
  ['2026-01-10T00:00:00.000+01:00', 'an offset'],
  ['2026-01-10t00:00:00.000z', 'lower-case letters'],
  ['2026-01-10T00:00:00.000z', 'lower-case z'],
  [' 2026-01-10T00:00:00.000Z', 'white space before'],
  ['2026-01-10T00:00:00.000Z ', 'white space after'],
  ['2026-01-10 ', 'a calendar date with white space'],
  ['', 'an empty string'],
  ['2026-02-30', 'a calendar date that does not exist'],
  ['2026-02-30T00:00:00.000Z', 'a day that does not exist'],
  ['2026-13-01T00:00:00.000Z', 'a month that does not exist'],
  ['2026-01-10T24:00:00.000Z', 'hour 24'],
  ['2026-01-10T00:60:00.000Z', 'minute 60'],
  ['9999-99-99T99:99:99.999Z', 'the well-formed nonsense the database would accept'],
  ['2026-01-10 00:00:00', 'the first malformed form of the fact-schema spike'],
  ['2026-1-10', 'a month with one digit'],
  ['2026-01-10T00:00:00.0000Z', 'four digits of milliseconds'],
  ['20260110', 'no separators'],
  ['yesterday', 'a relative date'],
  ['March 2026', 'an imprecise date'],
];

describe('toTimestamp', () => {
  it('writes a date as fixed-width UTC text with milliseconds', () => {
    expect(toTimestamp(new Date(Date.UTC(2026, 2, 15, 9, 30, 0, 7)))).toBe('2026-03-15T09:30:00.007Z');
    expect(toTimestamp(new Date('2026-03-15T11:30:00+02:00'))).toBe('2026-03-15T09:30:00.000Z');
    expect(toTimestamp(new Date(Date.UTC(2026, 0, 1)))).toHaveLength(24);
  });

  it('writes the first and last years it supports at the same width', () => {
    const first = new Date(0);
    first.setUTCFullYear(0, 0, 1);
    expect(toTimestamp(first)).toBe('0000-01-01T00:00:00.000Z');
    expect(toTimestamp(new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 999)))).toBe('9999-12-31T23:59:59.999Z');
  });

  it('refuses a date outside the years 0000 to 9999', () => {
    const before = new Date(0);
    before.setUTCFullYear(-1, 11, 31);
    expect(() => toTimestamp(before)).toThrow(/outside the years 0000 to 9999/);
    expect(() => toTimestamp(new Date(Date.UTC(10000, 0, 1)))).toThrow(/outside the years 0000 to 9999/);
  });

  it('refuses an invalid date', () => {
    expect(() => toTimestamp(new Date('not a date'))).toThrow(/invalid date/);
  });
});

describe('parseDateInput', () => {
  it('reads a full timestamp as it is', () => {
    expect(parseDateInput('2026-03-15T09:30:00.000Z')).toEqual({
      ok: true,
      value: '2026-03-15T09:30:00.000Z',
    });
  });

  it('reads a calendar date as the start of that day in UTC', () => {
    expect(parseDateInput('2026-03-15')).toEqual({ ok: true, value: '2026-03-15T00:00:00.000Z' });
  });

  it('reads the last day of February in a leap year, and refuses it in another year', () => {
    expect(parseDateInput('2028-02-29').ok).toBe(true);
    expect(parseDateInput('2026-02-29').ok).toBe(false);
  });

  it.each(REFUSED_FORMS)('returns invalid_input for every other form: %j (%s)', (form) => {
    const result = parseDateInput(form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
  });

  it('names the two accepted forms in its error, so a caller can correct the call', () => {
    const result = parseDateInput('15/03/2026');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('2026-03-15T09:30:00.000Z');
      expect(result.error.message).toContain('2026-03-15');
      expect(result.error.message).toContain('15/03/2026');
    }
  });
});

describe('TimestampSchema', () => {
  it('accepts the full form and gives back a timestamp', () => {
    const parsed: Timestamp = TimestampSchema.parse('2026-03-15T09:30:00.000Z');
    expect(parsed).toBe('2026-03-15T09:30:00.000Z');
  });

  it('refuses a calendar date, which only a caller may give', () => {
    expect(TimestampSchema.safeParse('2026-03-15').success).toBe(false);
  });

  it.each(REFUSED_FORMS)('refuses what parseDateInput refuses: %j (%s)', (form) => {
    expect(TimestampSchema.safeParse(form).success).toBe(false);
  });

  it('refuses a value that is not text', () => {
    expect(TimestampSchema.safeParse(1_773_567_000_000).success).toBe(false);
    expect(TimestampSchema.safeParse(new Date()).success).toBe(false);
    expect(TimestampSchema.safeParse(null).success).toBe(false);
  });
});

describe('a list of timestamps', () => {
  it('orders as text the way it orders in time', () => {
    const moments = [
      new Date(Date.UTC(2026, 2, 15, 9, 30, 0, 1)),
      new Date(Date.UTC(1999, 11, 31, 23, 59, 59, 999)),
      new Date(Date.UTC(2026, 2, 15, 9, 30, 0, 0)),
      new Date(Date.UTC(2026, 2, 15, 9, 30, 0, 500)),
      new Date(Date.UTC(2000, 0, 1)),
      new Date(Date.UTC(2026, 9, 1)),
      new Date(Date.UTC(2026, 1, 28, 12)),
    ];
    const byTime = [...moments].sort((a, b) => a.getTime() - b.getTime()).map(toTimestamp);
    const byText = moments.map(toTimestamp).sort();
    expect(byText).toEqual(byTime);
  });
});
