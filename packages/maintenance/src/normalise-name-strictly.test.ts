import { describe, expect, it } from 'vitest';
import { normaliseNameStrictly } from './normalise-name-strictly.ts';

describe('normaliseNameStrictly', () => {
  it('treats names that differ only in punctuation as equal', () => {
    expect(normaliseNameStrictly('Node.js')).toBe(normaliseNameStrictly('nodejs'));
    expect(normaliseNameStrictly('shop-api')).toBe(normaliseNameStrictly('Shop API'));
  });

  it('treats compatibility forms of a character as equal', () => {
    // A full-width "Ｖｉｔｅｓｔ" and the ligature "ﬁ" fold to their plain letters.
    expect(normaliseNameStrictly('Ｖｉｔｅｓｔ')).toBe(normaliseNameStrictly('Vitest'));
    expect(normaliseNameStrictly('conﬁg')).toBe(normaliseNameStrictly('config'));
  });

  it('keeps names with different letters apart', () => {
    expect(normaliseNameStrictly('Postgres')).not.toBe(normaliseNameStrictly('PostgreSQL'));
    expect(normaliseNameStrictly('pnpm')).not.toBe(normaliseNameStrictly('npm'));
  });
});
