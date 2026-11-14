import { corePackageName } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { graphRagBuiltOn } from './index.ts';

describe('@factloom/graph-rag', () => {
  it('is built on @factloom/core and nothing else in the workspace', () => {
    expect(graphRagBuiltOn).toEqual([corePackageName]);
  });
});
