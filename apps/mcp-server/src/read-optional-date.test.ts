import { describe, expect, it } from 'vitest';
import { readOptionalDate } from './read-optional-date.ts';

describe('readOptionalDate', () => {
  it('reads an absent date as null', () => {
    expect(readOptionalDate('as_of', undefined)).toEqual({ ok: true, value: null });
  });

  it('reads a calendar date as the start of that day in UTC', () => {
    expect(readOptionalDate('as_of', '2026-03-15')).toEqual({ ok: true, value: '2026-03-15T00:00:00.000Z' });
  });

  it('returns invalid_input naming the field for anything else', () => {
    const read = readOptionalDate('known_at', '15/03/2026');

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error.code).toBe('invalid_input');
    expect(read.error.message).toMatch(/^known_at: /);
  });
});
