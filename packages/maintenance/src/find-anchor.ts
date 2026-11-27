import type { Source } from '@kronomind/core';

/** The place in a fact's source a check reads: a path at a commit. */
export type Anchor = { readonly path: string; readonly commit: string };

/**
 * The anchor of a fact: of its sources of kind `file` with both a locator and a version, the
 * most recently observed. Null when it has none.
 */
export function findAnchor(sources: readonly Source[]): Anchor | null {
  let latest: (Anchor & { readonly observedAt: string }) | null = null;
  for (const { kind, locator, version, observedAt } of sources) {
    if (kind !== 'file' || locator === null || version === null) continue;
    if (latest === null || observedAt > latest.observedAt)
      latest = { path: locator, commit: version, observedAt };
  }
  return latest === null ? null : { path: latest.path, commit: latest.commit };
}
