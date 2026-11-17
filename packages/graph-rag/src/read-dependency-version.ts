import { z } from 'zod';

const ManifestSchema = z
  .object({
    dependencies: z.record(z.string(), z.unknown()).optional(),
    devDependencies: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

/** A version read from a manifest, no version, or a manifest that cannot be read. */
export type DependencyVersion =
  | { readonly kind: 'value'; readonly value: string | null }
  | { readonly kind: 'unreadable' };

/**
 * Reads the version a `package.json` gives a dependency, in `dependencies` or else in
 * `devDependencies`: the structured check of the predicate `pins_version` (FL-062). A
 * dependency that is not listed has no version; a text that is not a manifest is unreadable.
 */
export function readDependencyVersion(manifestText: string, dependencyName: string): DependencyVersion {
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText);
  } catch {
    return { kind: 'unreadable' };
  }
  const manifest = ManifestSchema.safeParse(parsed);
  if (!manifest.success) return { kind: 'unreadable' };
  const version =
    manifest.data.dependencies?.[dependencyName] ?? manifest.data.devDependencies?.[dependencyName];
  return { kind: 'value', value: typeof version === 'string' ? version : null };
}

/** The statement of a fact that a dependency is pinned at a version. */
export function describeDependencyVersion(dependencyName: string, version: string): string {
  return `${dependencyName} is pinned at version ${version}.`;
}
