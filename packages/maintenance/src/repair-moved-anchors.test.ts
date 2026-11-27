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
} from '@kronomind/core';
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

  it('ends a fact whose value is the moved path and continues it at the new path, its statement updated', async () => {
    const store = createInMemoryStore();
    const factId = await recordPathFact(store);
    const repository = {
      ...fakeRepository({ 'lib/time.js': 'blob-dates' }, { 'lib/dates.js': 'lib/time.js' }),
      readContentId: async (commit: string, path: string) =>
        ok(
          commit === 'c-anchor' && path === 'lib/dates.js'
            ? 'blob-dates'
            : commit === 'c-head' && path === 'lib/time.js'
              ? 'blob-dates'
              : null,
        ),
      listCommitsTouching: async () =>
        ok([{ commit: 'c-head', committedAt: toTimestamp(new Date('2026-02-20')) }]),
    };

    const result = await repairMovedAnchors(
      {
        ...createTestDeps({ now: '2026-03-01', domain: PATH_DOMAIN, store, newId: countFrom('repair') }),
        repository,
        pathPredicates: ['defined_in'],
      },
      { namespace: NAMESPACE },
    );

    expect(result.ok && result.value).toMatchObject({ examined: 1, changed: 1, flagged: 0 });
    const original = await store.getFact({ namespace: NAMESPACE, factId });
    expect(original.ok && original.value?.fact.invalidatedAt).not.toBeNull();
    const live = await store.listFacts({
      namespace: NAMESPACE,
      subjectEntityId: 'entity-parse-date',
      predicate: 'defined_in',
      touchingEntityIds: null,
      supersededByFactId: null,
      time: 'live',
      limit: 10,
    });
    expect(
      live.ok &&
        live.value.map((found) => [
          found.fact.object,
          found.fact.statement,
          found.fact.validFrom,
          found.fact.validTo,
        ]),
    ).toEqual(
      expect.arrayContaining([
        [
          { kind: 'value', value: 'lib/dates.js' },
          'parseDate, in lib/dates.js, parses a calendar date.',
          null,
          '2026-02-20T00:00:00.000Z',
        ],
        [
          { kind: 'value', value: 'lib/time.js' },
          'parseDate, in lib/time.js, parses a calendar date.',
          '2026-02-20T00:00:00.000Z',
          null,
        ],
      ]),
    );
    expect(live.ok && live.value).toHaveLength(2);
  });

  it('only re-anchors a fact whose predicate does not hold a path', async () => {
    const store = createInMemoryStore();
    const factId = await recordCheckedFact(store, 'source_missing');

    const result = await repairMovedAnchors(
      {
        ...createTestDeps({ now: '2026-03-01', store }),
        repository: fakeRepository(
          { 'docs/storage.md': 'blob-1' },
          { 'docs/database.md': 'docs/storage.md' },
        ),
        pathPredicates: ['defined_in'],
      },
      { namespace: NAMESPACE },
    );

    expect(result.ok && result.value.changed).toBe(1);
    const original = await store.getFact({ namespace: NAMESPACE, factId });
    expect(original.ok && original.value?.fact.invalidatedAt).toBeNull();
  });
});

/** The test domain with a symbol type and the path predicate of the code base map (FL-082). */
const PATH_DOMAIN = {
  ...TEST_DOMAIN,
  entityTypes: [...TEST_DOMAIN.entityTypes, 'symbol'],
  predicates: [
    ...TEST_DOMAIN.predicates,
    { name: 'defined_in', description: 'A symbol is defined in a file.', cardinality: 'single' as const },
  ],
};

/** A map fact: parseDate is defined in lib/dates.js, anchored there, and found missing. */
async function recordPathFact(store: MemoryStore): Promise<string> {
  const deps = createTestDeps({ now: '2026-01-10', domain: PATH_DOMAIN, store });
  const recorded = await recordFacts(deps, {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: {
      kind: 'file',
      locator: 'lib/dates.js',
      version: 'c-anchor',
      content: null,
      observedAt: deps.now(),
    },
    drafts: [
      {
        fact: {
          subjectEntityId: 'entity-parse-date',
          predicate: 'defined_in',
          object: { kind: 'value', value: 'lib/dates.js' },
          statement: 'parseDate, in lib/dates.js, parses a calendar date.',
          confidence: 1,
          validFrom: null,
          validTo: null,
        },
        newEntities: [{ id: 'entity-parse-date', type: 'symbol', name: 'parseDate' }],
      },
    ],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const factId = recorded.value.factIds[0] ?? 'none';
  await recordVerification(
    createTestDeps({ now: '2026-02-25', domain: PATH_DOMAIN, store, newId: () => 'vr-map' }),
    {
      namespace: NAMESPACE,
      trigger: 'maintenance',
      reasonCode: 'verification_due',
      factId,
      outcome: 'source_missing',
      method: 'deterministic',
    },
  );
  return factId;
}

/** A counting identifier generator with its own prefix, so a run's identifiers do not meet the recording's. */
function countFrom(prefix: string): () => string {
  let count = 0;
  return () => {
    count += 1;
    return `${prefix}-${count}`;
  };
}
