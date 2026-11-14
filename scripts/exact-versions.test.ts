import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

/** One exact version: digits and dots, with an optional pre-release or build suffix. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/** Reads the `catalog:` block of pnpm-workspace.yaml as name and version pairs. */
function readCatalog(): Map<string, string> {
  const lines = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').split('\n');
  const start = lines.findIndex((line) => line.startsWith('catalog:'));
  const catalog = new Map<string, string>();
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (!line.startsWith(' ')) break;
    const separator = line.lastIndexOf(':');
    const name = line
      .slice(0, separator)
      .trim()
      .replace(/^["']|["']$/g, '');
    const version = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    catalog.set(name, version);
  }
  return catalog;
}

/** Lists the package.json files of the workspace: the root, the packages and the apps. */
function listManifests(): string[] {
  const manifests = [join(root, 'package.json')];
  for (const group of ['packages', 'apps']) {
    for (const entry of readdirSync(join(root, group), { withFileTypes: true })) {
      if (entry.isDirectory()) manifests.push(join(root, group, entry.name, 'package.json'));
    }
  }
  return manifests;
}

/** Returns one message per dependency whose version is not exact. */
function findInexactVersions(): string[] {
  const catalog = readCatalog();
  const problems: string[] = [];
  for (const [name, version] of catalog) {
    if (!EXACT_VERSION.test(version)) problems.push(`catalog: ${name} is "${version}"`);
  }
  for (const manifest of listManifests()) {
    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) continue;
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const dependencies: unknown = (parsed as Record<string, unknown>)[field];
      if (typeof dependencies !== 'object' || dependencies === null) continue;
      for (const [name, version] of Object.entries(dependencies)) {
        if (version === 'workspace:*') continue;
        if (version === 'catalog:') {
          if (!catalog.has(name)) problems.push(`${manifest}: ${name} is not in the catalog`);
          continue;
        }
        if (typeof version !== 'string' || !EXACT_VERSION.test(version)) {
          problems.push(`${manifest}: ${name} is "${String(version)}"`);
        }
      }
    }
  }
  return problems;
}

describe('the workspace', () => {
  it('pins every dependency to one exact version', () => {
    expect(findInexactVersions()).toEqual([]);
  });

  it('finds the catalog, so that an empty result means pinned and not unread', () => {
    expect(readCatalog().size).toBeGreaterThan(0);
  });
});
