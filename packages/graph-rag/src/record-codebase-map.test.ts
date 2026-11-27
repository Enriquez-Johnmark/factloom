import {
  createTestDeps,
  type FactWithSources,
  type MemoryStore,
  ok,
  type Result,
  recordFacts,
  toTimestamp,
} from '@kronomind/core';
import { describe, expect, it } from 'vitest';
import { type CodebaseReader, MAP_FILE_SIZE_LIMIT, recordCodebaseMap } from './record-codebase-map.ts';
import { softwareDevelopmentDomain } from './software-development-domain.ts';

const NAMESPACE = 'repo:lending-desk';

/** A repository whose HEAD is `head` and holds `files`. */
function repositoryAt(head: string, files: Readonly<Record<string, string>>): CodebaseReader {
  return {
    readHead: async () => ok(head),
    listFiles: async () => ok(Object.keys(files)),
    readText: async (_commit, path) => ok(files[path] ?? null),
  };
}

const FEES = [
  '/** Assesses the late fee of a loan. Never more than the item costs. */',
  'export function assessLateFee(loan) {}',
  '',
  'export const DAILY_FEE_CENTS = 25;',
].join('\n');

const DATES = [
  '// Tells whether a branch is open on a day.',
  'export function isOpenOn(branch, day) {}',
].join('\n');

/** Counting identifiers with a prefix of their own, so two runs never reuse one. */
function countFrom(prefix: string): () => string {
  let count = 0;
  return () => {
    count += 1;
    return `${prefix}-${count}`;
  };
}

function depsAt(now: string, store?: MemoryStore) {
  return createTestDeps({
    now,
    domain: softwareDevelopmentDomain,
    newId: countFrom(now),
    ...(store === undefined ? {} : { store }),
  });
}

async function run(
  deps: ReturnType<typeof depsAt>,
  repository: CodebaseReader,
  limits?: { readonly factsPerRun: number },
) {
  const result = await recordCodebaseMap(
    { ...deps, repository },
    { namespace: NAMESPACE, ...(limits === undefined ? {} : { limits }) },
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

/** The map facts current at `at`, as `name -> path`. */
async function currentMap(store: MemoryStore, at: string): Promise<Record<string, string>> {
  const time = { validAt: toTimestamp(new Date(at)), knownAt: toTimestamp(new Date(at)) };
  const found = await store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: null,
    predicate: 'defined_in',
    touchingEntityIds: null,
    supersededByFactId: null,
    time,
    limit: 100,
  });
  if (!found.ok) throw new Error(found.error.message);
  return Object.fromEntries(
    found.value.map((entry: FactWithSources) => [
      entry.subject.name,
      entry.fact.object.kind === 'value' ? entry.fact.object.value : '',
    ]),
  );
}

async function allFacts(store: MemoryStore): Promise<readonly FactWithSources[]> {
  const found = await store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: null,
    predicate: 'defined_in',
    touchingEntityIds: null,
    supersededByFactId: null,
    time: 'all',
    limit: 100,
  });
  if (!found.ok) throw new Error(found.error.message);
  return found.value;
}

describe('recording the code base map', () => {
  it('records one defined_in fact per top-level declaration, anchored to its file at HEAD', async () => {
    const deps = depsAt('2026-11-27T09:00:00.000Z');

    const counts = await run(deps, repositoryAt('c1', { 'lib/fees/assess.js': FEES }));

    expect(counts.recorded).toBe(2);
    const facts = await allFacts(deps.store);
    expect(facts.map((entry) => entry.fact.statement).sort()).toEqual([
      'DAILY_FEE_CENTS is defined in lib/fees/assess.js.',
      'assessLateFee, in lib/fees/assess.js: Assesses the late fee of a loan.',
    ]);
    expect(facts[0]?.sources[0]).toMatchObject({
      kind: 'file',
      locator: 'lib/fees/assess.js',
      version: 'c1',
    });
  });

  it('writes nothing when it runs again on the same commit', async () => {
    const deps = depsAt('2026-11-27T09:00:00.000Z');
    const repository = repositoryAt('c1', { 'lib/fees/assess.js': FEES });
    await run(deps, repository);
    const before = await allFacts(deps.store);

    const counts = await run(depsAt('2026-11-27T10:00:00.000Z', deps.store), repository);

    expect(counts).toMatchObject({ recorded: 0, moved: 0, ended: 0, unchanged: 2 });
    expect(await allFacts(deps.store)).toEqual(before);
  });

  it('ends the fact of a declaration that moved to another file and continues it at the new path', async () => {
    const deps = depsAt('2026-11-27T09:00:00.000Z');
    await run(deps, repositoryAt('c1', { 'lib/helpers/dates.js': DATES }));

    const counts = await run(
      depsAt('2026-11-28T09:00:00.000Z', deps.store),
      repositoryAt('c2', {
        'lib/helpers/dates.js': 'export const UNUSED = 1;',
        'lib/helpers/opening-days.js': DATES,
      }),
    );

    expect(counts.moved).toBe(1);
    expect(await currentMap(deps.store, '2026-11-28T10:00:00.000Z')).toMatchObject({
      isOpenOn: 'lib/helpers/opening-days.js',
    });
    expect(await currentMap(deps.store, '2026-11-27T10:00:00.000Z')).toMatchObject({
      isOpenOn: 'lib/helpers/dates.js',
    });
  });

  it('ends the fact of a declaration gone from every file', async () => {
    const deps = depsAt('2026-11-27T09:00:00.000Z');
    await run(deps, repositoryAt('c1', { 'lib/fees/assess.js': FEES }));

    const counts = await run(
      depsAt('2026-11-28T09:00:00.000Z', deps.store),
      repositoryAt('c2', { 'lib/fees/assess.js': 'export function assessLateFee(loan) {}' }),
    );

    expect(counts.ended).toBe(1);
    expect(Object.keys(await currentMap(deps.store, '2026-11-28T10:00:00.000Z'))).toEqual(['assessLateFee']);
  });

  it('leaves out a name declared in more than one file', async () => {
    const deps = depsAt('2026-11-27T09:00:00.000Z');

    const counts = await run(
      deps,
      repositoryAt('c1', {
        'lib/a.js': 'export function format() {}',
        'lib/b.js': 'export function format() {}',
      }),
    );

    expect(counts).toMatchObject({ recorded: 0, skipped: { ambiguous: 1 } });
  });

  it('leaves out a declaration whose comment holds a secret', async () => {
    const deps = depsAt('2026-11-27T09:00:00.000Z');
    const credential = ['https://', 'deploy', ':', 'hunter2horse', '@', 'git.example.com/shop.git'].join('');

    const counts = await run(
      deps,
      repositoryAt('c1', {
        'lib/clone.js': `/** Clones ${credential} for the build. */\nexport function clone() {}`,
      }),
    );

    expect(counts).toMatchObject({ recorded: 0, skipped: { secret: 1 } });
  });

  it('reads only the source files the map covers, and none over the size limit', async () => {
    const deps = depsAt('2026-11-27T09:00:00.000Z');

    const counts = await run(
      deps,
      repositoryAt('c1', {
        'test/fees.test.js': 'export function helper() {}',
        'tools/build.py': 'def build(): pass',
        'lib/huge.js': `export function huge() {}\n${'x'.repeat(MAP_FILE_SIZE_LIMIT)}`,
        'lib/fees/assess.js': FEES,
      }),
    );

    expect(counts).toMatchObject({ recorded: 2, skipped: { tooLarge: 1 } });
  });

  it('leaves alone a map fact about a file of a language it does not read', async () => {
    const deps = depsAt('2026-11-27T09:00:00.000Z');
    const recorded = await recordFacts(deps, {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'stated',
      source: {
        kind: 'file',
        locator: 'tools/build.py',
        version: 'c0',
        content: null,
        observedAt: deps.now(),
      },
      drafts: [
        {
          fact: {
            subjectEntityId: 'e-build',
            predicate: 'defined_in',
            object: { kind: 'value', value: 'tools/build.py' },
            statement: 'build, in tools/build.py, builds the service.',
            confidence: 1,
            validFrom: null,
            validTo: null,
          },
          newEntities: [{ id: 'e-build', type: 'symbol', name: 'build' }],
        },
      ],
      restatedFactIds: [],
    });
    expect(recorded.ok).toBe(true);

    const counts = await run(
      depsAt('2026-11-28T09:00:00.000Z', deps.store),
      repositoryAt('c1', { 'tools/build.py': 'def build(): pass' }),
    );

    expect(counts.ended).toBe(0);
    expect(await currentMap(deps.store, '2026-11-28T10:00:00.000Z')).toEqual({ build: 'tools/build.py' });
  });

  it('writes at most the limit in one run, and the rest in the next', async () => {
    const deps = depsAt('2026-11-27T09:00:00.000Z');
    const repository = repositoryAt('c1', { 'lib/fees/assess.js': FEES, 'lib/helpers/dates.js': DATES });

    const first = await run(deps, repository, { factsPerRun: 2 });
    const second = await run(depsAt('2026-11-27T10:00:00.000Z', deps.store), repository, { factsPerRun: 2 });

    expect([first.recorded, first.skipped.overLimit, second.recorded]).toEqual([2, 1, 1]);
  });

  it('fails as a whole and writes nothing when the repository cannot be read', async () => {
    const deps = depsAt('2026-11-27T09:00:00.000Z');
    const unreadable: CodebaseReader = {
      readHead: async (): Promise<Result<string>> => ({
        ok: false,
        error: { code: 'invalid_input', message: 'Not a git repository.', relatedFactIds: [] },
      }),
      listFiles: async () => ok([]),
      readText: async () => ok(null),
    };

    const result = await recordCodebaseMap({ ...deps, repository: unreadable }, { namespace: NAMESPACE });

    expect(result.ok ? null : result.error.code).toBe('invalid_input');
    expect(await allFacts(deps.store)).toEqual([]);
  });
});
