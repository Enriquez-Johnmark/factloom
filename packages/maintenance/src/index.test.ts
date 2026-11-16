import { corePackageName } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { maintenanceBuiltOn } from './index.ts';

describe('@factloom/maintenance', () => {
  it('is built on @factloom/core and nothing else in the workspace', () => {
    expect(maintenanceBuiltOn).toEqual([corePackageName]);
  });
});
