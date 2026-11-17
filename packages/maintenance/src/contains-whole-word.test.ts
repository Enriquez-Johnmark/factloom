import { describe, expect, it } from 'vitest';
import { containsWholeWord } from './contains-whole-word.ts';

describe('containsWholeWord', () => {
  it('finds a name as a whole word', () => {
    expect(containsWholeWord('export function parseDate(text: string) {}', 'parseDate')).toBe(true);
    expect(containsWholeWord('parseDate', 'parseDate')).toBe(true);
  });

  it('does not find a name inside a longer name', () => {
    expect(containsWholeWord('export function parseDateInput(text: string) {}', 'parseDate')).toBe(false);
    expect(containsWholeWord('const reparseDate = 1;', 'parseDate')).toBe(false);
  });

  it('keeps the case of the name', () => {
    expect(containsWholeWord('function ParseDate() {}', 'parseDate')).toBe(false);
  });

  it('finds a name next to punctuation', () => {
    expect(containsWholeWord('import { parseDate, toTimestamp } from "./dates";', 'parseDate')).toBe(true);
    expect(containsWholeWord('dates.parseDate();', 'parseDate')).toBe(true);
  });
});
