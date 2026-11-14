import { corePackageName } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { storageBuiltOn } from './index.ts';

describe('@factloom/storage', () => {
  it('is built on @factloom/core and nothing else in the workspace', () => {
    expect(storageBuiltOn).toEqual([corePackageName]);
  });
});
