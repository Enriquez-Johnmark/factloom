import { describe, expect, it } from 'vitest';
import { corePackageName } from './index.ts';

describe('@kronomind/core', () => {
  it('exports its package name', () => {
    expect(corePackageName).toBe('@kronomind/core');
  });
});
