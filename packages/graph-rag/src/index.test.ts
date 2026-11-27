import { corePackageName } from '@kronomind/core';
import { describe, expect, it } from 'vitest';
import { graphRagBuiltOn } from './index.ts';

describe('@kronomind/graph-rag', () => {
  it('is built on @kronomind/core and nothing else in the workspace', () => {
    expect(graphRagBuiltOn).toEqual([corePackageName]);
  });
});
