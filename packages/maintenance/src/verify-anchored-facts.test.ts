import {
  createInMemoryStore,
  createTestDeps,
  err,
  type MemoryStore,
  ok,
  recordFacts,
  TEST_DOMAIN,
  toTimestamp,
} from '@factloom/core';
import { describe, expect, it } from 'vitest';
import type { RepositoryReader } from './repository-reader.ts';
import { type VerificationRung, verifyAnchoredFacts } from './verify-anchored-facts.ts';

const NAMESPACE = 'repo:shop-api';
const ANCHOR = 'c-anchor';
const HEAD = 'c-head';
const PATH = 'docs/database.md';

/**
 * A repository of two commits on one branch, the anchor and HEAD, and one commit on another
 * branch. Each commit maps paths to content identifiers; the text of a file is its identifier.
 */
function fakeRepository(head: Readonly<Record<string, string>>, readable = true): RepositoryReader {
  const commits: Record<string, Readonly<Record<string, string>>> = {
    [ANCHOR]: { [PATH]: 'blob-1' },
    [HEAD]: head,
    'c-other-branch': { [PATH]: 'blob-1' },
  };
  const unreadable = err('invalid_input', 'Not a git repository.');
  const at = (commit: string, path: string) => commits[commit]?.[path] ?? null;
  return {
    readHead: async () => (readable ? ok(HEAD) : unreadable),
    isAncestorOfHead: async (commit) => ok(commit === ANCHOR || commit === HEAD),
    pathExists: async (commit, path) => ok(at(commit, path) !== null),
    readContentId: async (commit, path) => ok(at(commit, path)),
    readText: async (commit, path) => ok(at(commit, path)),
    findRenamedPath: async () => ok(null),
    listCommitsTouching: async () => ok([]),
  };
}

/** Records one fact about the database, from a file at a commit, or from a note when `commit` is null. */
async function recordAnchoredFact(store: MemoryStore, commit: string | null): Promise<string> {
  const recorded = await recordFacts(createTestDeps({ now: '2026-01-10', domain: TEST_DOMAIN, store }), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: {
      kind: commit === null ? 'agent_note' : 'file',
      locator: commit === null ? null : PATH,
      version: commit,
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
  return recorded.value.factIds[0] ?? 'none';
}

/** Runs the job on 2026-03-01, with an LLM client that fails if it is called. */
async function run(
  store: MemoryStore,
  repository: RepositoryReader,
  rungs: readonly VerificationRung[] = [],
) {
  const deps = createTestDeps({ now: '2026-03-01', store });
  return verifyAnchoredFacts({ ...deps, repository, rungs }, { namespace: NAMESPACE });
}

async function outcomes(store: MemoryStore, factId: string) {
  const listed = await store.listVerifications({ namespace: NAMESPACE, factId });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.map((verification) => [verification.outcome, verification.method]);
}

/** A rung that decides `contradicted`, and records that it ran. */
function contradictingRung(placement: VerificationRung['placement'], ran: string[]): VerificationRung {
  return {
    name: placement,
    placement,
    check: async () => {
      ran.push(placement);
      return ok({ outcome: 'contradicted', successor: null } as const);
    },
  };
}

describe('verifyAnchoredFacts', () => {
  it('confirms a fact whose file is unchanged since its commit', async () => {
    const store = createInMemoryStore();
    const factId = await recordAnchoredFact(store, ANCHOR);

    const result = await run(store, fakeRepository({ [PATH]: 'blob-1' }));

    expect(result).toEqual({
      ok: true,
      value: { examined: 1, changed: 0, flagged: 0, failed: 0, flaggedItems: [] },
    });
    expect(await outcomes(store, factId)).toEqual([['confirmed', 'deterministic']]);
  });

  it('records inconclusive for a fact whose file changed, and leaves the fact live', async () => {
    const store = createInMemoryStore();
    const factId = await recordAnchoredFact(store, ANCHOR);

    await run(store, fakeRepository({ [PATH]: 'blob-2' }));

    expect(await outcomes(store, factId)).toEqual([['inconclusive', 'deterministic']]);
    const found = await store.getFact({ namespace: NAMESPACE, factId });
    expect(found.ok && found.value?.fact.invalidatedAt).toBeNull();
  });

  it('records source_missing for a fact whose file is gone at HEAD, flags it, and leaves it live', async () => {
    const store = createInMemoryStore();
    const factId = await recordAnchoredFact(store, ANCHOR);

    const result = await run(store, fakeRepository({}));

    expect(result.ok && result.value).toEqual({
      examined: 1,
      changed: 0,
      flagged: 1,
      failed: 0,
      flaggedItems: [{ id: factId, reason: 'source_missing' }],
    });
    expect(await outcomes(store, factId)).toEqual([['source_missing', 'deterministic']]);
    const found = await store.getFact({ namespace: NAMESPACE, factId });
    expect(found.ok && found.value?.fact.invalidatedAt).toBeNull();
  });

  it('records nothing for a fact from a commit that is not on this branch', async () => {
    const store = createInMemoryStore();
    const factId = await recordAnchoredFact(store, 'c-other-branch');

    const result = await run(store, fakeRepository({ [PATH]: 'blob-1' }));

    expect(result.ok && result.value.examined).toBe(1);
    expect(await outcomes(store, factId)).toEqual([]);
  });

  it('examines a fact with no file anchor and records nothing', async () => {
    const store = createInMemoryStore();
    const factId = await recordAnchoredFact(store, null);

    const result = await run(store, fakeRepository({ [PATH]: 'blob-1' }));

    expect(result.ok && result.value.examined).toBe(1);
    expect(await outcomes(store, factId)).toEqual([]);
  });

  it('runs a rung placed before the content check once the path exists, and its outcome decides', async () => {
    const store = createInMemoryStore();
    const factId = await recordAnchoredFact(store, ANCHOR);
    const ran: string[] = [];
    const rungs = [
      contradictingRung('before_content_check', ran),
      contradictingRung('after_content_changed', ran),
    ];

    await run(store, fakeRepository({ [PATH]: 'blob-1' }), rungs);

    expect(ran).toEqual(['before_content_check']);
    expect(await outcomes(store, factId)).toEqual([['contradicted', 'deterministic']]);
  });

  it('runs a rung placed after the content check only for a file that changed', async () => {
    const unchanged = createInMemoryStore();
    const changed = createInMemoryStore();
    const unchangedId = await recordAnchoredFact(unchanged, ANCHOR);
    const changedId = await recordAnchoredFact(changed, ANCHOR);
    const ran: string[] = [];
    const rungs = [contradictingRung('after_content_changed', ran)];

    await run(unchanged, fakeRepository({ [PATH]: 'blob-1' }), rungs);
    const ranForUnchanged = [...ran];
    await run(changed, fakeRepository({ [PATH]: 'blob-2' }), rungs);

    expect(ranForUnchanged).toEqual([]);
    expect(ran).toEqual(['after_content_changed']);
    expect(await outcomes(unchanged, unchangedId)).toEqual([['confirmed', 'deterministic']]);
    expect(await outcomes(changed, changedId)).toEqual([['contradicted', 'deterministic']]);
  });

  it('does not run a rung for a fact whose file is gone', async () => {
    const store = createInMemoryStore();
    await recordAnchoredFact(store, ANCHOR);
    const ran: string[] = [];

    await run(store, fakeRepository({}), [contradictingRung('before_content_check', ran)]);

    expect(ran).toEqual([]);
  });

  it('fails as a whole and records nothing when the repository cannot be read', async () => {
    const store = createInMemoryStore();
    const factId = await recordAnchoredFact(store, ANCHOR);

    const result = await run(store, fakeRepository({ [PATH]: 'blob-1' }, false));

    expect(result.ok ? null : result.error.code).toBe('invalid_input');
    expect(await outcomes(store, factId)).toEqual([]);
  });

  it('examines no fact on a second run inside the verification interval', async () => {
    const store = createInMemoryStore();
    await recordAnchoredFact(store, ANCHOR);
    const repository = fakeRepository({ [PATH]: 'blob-1' });
    await run(store, repository);

    const second = await run(store, repository);

    expect(second.ok && second.value.examined).toBe(0);
  });
});
