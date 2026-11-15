import { describe, expect, it } from 'vitest';
import { hashContent } from './hash-content.ts';

describe('hashContent', () => {
  it('gives the SHA-256 of a text as lower-case hex', async () => {
    // The digest of "abc" in FIPS 180-4, appendix B.1.
    expect(await hashContent('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await hashContent('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
