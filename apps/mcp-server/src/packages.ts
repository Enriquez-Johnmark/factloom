import { corePackageName } from '@factloom/core';
import { graphRagBuiltOn } from '@factloom/graph-rag';
import { storageBuiltOn } from '@factloom/storage';

/**
 * The workspace packages the server is wired from. A placeholder, so that the scaffold can
 * prove the app resolves all three packages by name. The composition root replaces it.
 */
export function listWiredPackages(): readonly string[] {
  return [...new Set([corePackageName, ...graphRagBuiltOn, ...storageBuiltOn])];
}
