import { corePackageName } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { listWiredPackages } from './packages.ts';

describe('@factloom/mcp-server', () => {
  it('resolves the workspace packages it is wired from by name', () => {
    expect(listWiredPackages()).toEqual([corePackageName]);
  });
});
