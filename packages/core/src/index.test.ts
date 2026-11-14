import { describe, expect, it } from 'vitest';
import { corePackageName } from './index.ts';

describe('@factloom/core', () => {
  it('exports its package name', () => {
    expect(corePackageName).toBe('@factloom/core');
  });
});
