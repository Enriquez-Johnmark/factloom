import {
  createInMemoryStore,
  createTestDeps,
  err,
  type MemoryStore,
  ok,
  recordFacts,
  recordVerification,
  TEST_DOMAIN,
  toTimestamp,
} from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { repairMovedAnchors } from './repair-moved-anchors.ts';
import type { RepositoryReader } from './repository-reader.ts';

const NAMESPACE = 'repo:shop-api';

/** HEAD holds `files`; `renames` maps a removed path to where it went. */
function fakeRepository(
  files: Readonly<Record<string, string>>,
  renames: Readonly<Record<string, string>>,
  readable = true,
): RepositoryReader {
  const anchorFiles: Readonly<Record<string, string>> = { 'docs/database.md': 'blob-1' };
  const at = (commit: string, path: string) => (commit === 'c-head' ? files : anchorFiles)[path] ?? null;
  return {
    readHead: async () => (readable ? ok('c-head') : err('invalid_input', 'Not a git repository.')),
    isAncestorOfHead: async () => ok(true),
    pathExists: async (commit, path) => ok(at(commit, path) !== null),
    readContentId: async (commit, path) => ok(at(commit, path)),
    readText: async (commit, path) => ok(at(commit, path)),
    findRenamedPath: async (path) => ok(renames[path] ?? null),
    listCommitsTouching: async () => ok([]),
  };
}

/** A fact from docs/database.md at the anchor commit, whose latest verification is `outcome`. */
async function recordCheckedFact(store: MemoryStore, outcome: 'source_missing' | 'confirmed') {
  const deps = createTestDeps({ now: '2026-01-10', domain: TEST_DOMAIN, store });
  const recorded = await recordFacts(deps, {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: {
      kind: 'file',
      locator: 'docs/database.md',
      version: 'c-anchor',
      content: 'We run PostgreSQL 16.',
      observedAt: toTimestamp(new Date('2026-01-10')),
    },
    drafts: [
      {
        fact: {
          subjectEntityId: 'entity-shop-api',
          predicate: 'uses_database_version',
          object: { kind: 'value', value: 'PostgreSQL 16' },
          statement: 'shop-api runs PostgreSQL 16',
          confidence: 0.9,
          validFrom: null,
          validTo: null,
        },
        newEntities: [{ id: 'entity-shop-api', type: 'repository', name: 'shop-api' }],
      },
    ],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const factId = recorded.value.factIds[0] ?? 'none';
  await recordVerification(createTestDeps({ now: '2026-02-01', store, newId: () => 'vr-first' }), {
    namespace: NAMESPACE,
    trigger: 'maintenance',
    reasonCode: 'verification_due',
    factId,
    outcome,
    method: 'deterministic',
  });
  return factId;
}

function run(store: MemoryStore, repository: RepositoryReader) {
  return repairMovedAnchors(
    { ...createTestDeps({ now: '2026-03-01', store }), repository },
    { namespace: NAMESPACE },
  );
}

async function locators(store: MemoryStore, factId: string) {
  const found = await store.getFact({ namespace: NAMESPACE, factId });
  return found.ok ? found.value?.sources.map((source) => source.locator) : [];
}

describe('repairMovedAnchors', () => {
  it('attaches a source at the path the file was renamed to, and confirms the fact when the file is unchanged', async () => {
    const store = createInMemoryStore();
    const factId = await recordCheckedFact(store, 'source_missing');

    const result = await run(
      store,
      fakeRepository({ 'docs/storage.md': 'blob-1' }, { 'docs/database.md': 'docs/storage.md' }),
    );

    expect(result.ok && result.value).toMatchObject({ examined: 1, changed: 1, flagged: 0 });
    expect(await locators(store, factId)).toEqual(['docs/database.md', 'docs/storage.md']);
    const verifications = await store.listVerifications({ namespace: NAMESPACE, factId });
    expect(verifications.ok && verifications.value.map((verification) => verification.outcome)).toEqual([
      'source_missing',
      'confirmed',
    ]);
  });

  it('flags a fact whose file git shows no rename for, and attaches nothing', async () => {
    const store = createInMemoryStore();
    const factId = await recordCheckedFact(store, 'source_missing');

    const result = await run(store, fakeRepository({}, {}));

    expect(result.ok && result.value).toMatchObject({
      changed: 0,
      flagged: 1,
      flaggedItems: [{ id: factId, reason: 'source_missing' }],
    });
    expect(await locators(store, factId)).toEqual(['docs/database.md']);
  });

  it('leaves a fact whose latest verification did not find its source missing', async () => {
    const store = createInMemoryStore();
    const factId = await recordCheckedFact(store, 'confirmed');

    const result = await run(
      store,
      fakeRepository({ 'docs/storage.md': 'blob-1' }, { 'docs/database.md': 'docs/storage.md' }),
    );

    expect(result.ok && result.value.examined).toBe(0);
    expect(await locators(store, factId)).toEqual(['docs/database.md']);
  });

  it('fails as a whole and attaches nothing when the repository cannot be read', async () => {
    const store = createInMemoryStore();
    const factId = await recordCheckedFact(store, 'source_missing');

    const result = await run(
      store,
      fakeRepository({ 'docs/storage.md': 'blob-1' }, { 'docs/database.md': 'docs/storage.md' }, false),
    );

    expect(result.ok ? null : result.error.code).toBe('invalid_input');
    expect(await locators(store, factId)).toEqual(['docs/database.md']);
  });
});
