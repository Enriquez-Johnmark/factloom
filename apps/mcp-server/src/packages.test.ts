import { corePackageName } from '@kronomind/core';
import { describe, expect, it } from 'vitest';
import { listWiredPackages } from './packages.ts';

describe('@kronomind/mcp-server', () => {
  it('resolves the workspace packages it is wired from by name', () => {
    expect(listWiredPackages()).toEqual([corePackageName, '@kronomind/storage']);
  });
});
