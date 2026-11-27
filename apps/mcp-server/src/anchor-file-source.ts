// Gives a file source the commit it was read at, so that maintenance can check the fact against
// the file (ADR 0023). An agent rarely knows the commit without a git call of its own; the
// server knows the repository.
import { isAbsolute, normalize, relative, sep } from 'node:path';
import type { Result } from '@kronomind/core';

/**
 * Turns the path of a file source into a path from the repository root and the commit `HEAD`
 * names, or null when the path is outside the repository or the repository cannot be read.
 */
export type FileSourceAnchorer = (
  locator: string,
) => Promise<{ readonly locator: string; readonly version: string } | null>;

/** A path from the repository root with forward slashes, or null when it leaves the repository. */
function toRepositoryPath(repositoryDirectory: string, locator: string): string | null {
  const fromRoot = isAbsolute(locator) ? relative(repositoryDirectory, locator) : normalize(locator);
  if (fromRoot === '' || isAbsolute(fromRoot) || fromRoot === '..' || fromRoot.startsWith(`..${sep}`))
    return null;
  return fromRoot.split(sep).join('/');
}

/** Creates the anchorer of a repository, from its directory and a reader of its HEAD commit. */
export function createFileSourceAnchorer(
  repositoryDirectory: string,
  readHead: () => Promise<Result<string>>,
): FileSourceAnchorer {
  return async (locator) => {
    const path = toRepositoryPath(repositoryDirectory, locator);
    if (path === null) return null;
    const head = await readHead();
    return head.ok ? { locator: path, version: head.value } : null;
  };
}
