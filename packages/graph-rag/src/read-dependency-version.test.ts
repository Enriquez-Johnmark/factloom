import { describe, expect, it } from 'vitest';
import { readDependencyVersion } from './read-dependency-version.ts';

const MANIFEST = JSON.stringify({
  name: 'shop-api',
  dependencies: { zod: '4.6.7' },
  devDependencies: { vitest: '5.1.0' },
});

describe('readDependencyVersion', () => {
  it('reads a version from dependencies', () => {
    expect(readDependencyVersion(MANIFEST, 'zod')).toEqual({ kind: 'value', value: '4.6.7' });
  });

  it('reads a version from devDependencies', () => {
    expect(readDependencyVersion(MANIFEST, 'vitest')).toEqual({ kind: 'value', value: '5.1.0' });
  });

  it('returns no value for a dependency that is not listed', () => {
    expect(readDependencyVersion(MANIFEST, 'jest')).toEqual({ kind: 'value', value: null });
  });

  it('returns no value for a manifest that does not parse', () => {
    expect(readDependencyVersion('{ "dependencies": ', 'zod')).toEqual({ kind: 'unreadable' });
  });
});
