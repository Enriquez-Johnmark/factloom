import { corePackageName } from '@kronomind/core';
import { graphRagBuiltOn } from '@kronomind/graph-rag';
import { openSqliteMemoryStore } from '@kronomind/storage';

/**
 * The workspace packages the server is wired from. A placeholder, so that the scaffold can
 * prove the app resolves all three packages by name, and that the storage package loads its
 * native modules. The composition root replaces it.
 */
export function listWiredPackages(): readonly string[] {
  const storage = typeof openSqliteMemoryStore === 'function' ? ['@kronomind/storage'] : [];
  return [...new Set([corePackageName, ...graphRagBuiltOn, ...storage])];
}
