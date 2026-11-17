// The verification job of FL-050 as the maintenance command runs it: the jobs the composition
// root builds, the git reader on a fixture repository, and a SQLite file. Each fixture is one
// fact about the database, recorded from docs/database.md at a commit.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFakeEmbedder,
  createTestDeps,
  type MemoryStore,
  recordFacts,
  TEST_DOMAIN,
  toTimestamp,
} from '@factloom/core';
import { runMaintenance } from '@factloom/maintenance';
import { openSqliteMemoryStore } from '@factloom/storage';
import { afterEach, describe, expect, it } from 'vitest';
import { createGitRepositoryReader } from './create-git-repository-reader.ts';
import { buildMaintenanceJobs } from './maintenance-jobs.ts';
import { createFixtureRepository } from './testing/fixture-repository.ts';

const NAMESPACE = 'repo:shop-api';
const PATH = 'docs/database.md';
const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function openStore(): Promise<MemoryStore> {
  const directory = mkdtempSync(join(tmpdir(), 'factloom-verify-'));
  const embedder = createFakeEmbedder();
  const opened = openSqliteMemoryStore({
    path: join(directory, 'factloom.db'),
    embeddingModel: embedder.model,
    embeddingDimensions: embedder.dimensions,
  });
  if (!opened.ok) throw new Error(opened.error.message);
  cleanups.push(async () => {
    await opened.value.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return opened.value;
}

function newRepository() {
  const repository = createFixtureRepository();
  cleanups.push(repository.remove);
  return repository;
}

/** Records the database fact from the file at a commit, on 2026-01-10. */
async function recordAnchoredFact(store: MemoryStore, commit: string): Promise<string> {
  const recorded = await recordFacts(createTestDeps({ now: '2026-01-10', domain: TEST_DOMAIN, store }), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: {
      kind: 'file',
      locator: PATH,
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

/** Runs maintenance once on a day, with an LLM client among the dependencies that fails if called. */
function runOn(day: string, store: MemoryStore, repositoryDirectory: string) {
  const deps = createTestDeps({ now: day, store });
  return runMaintenance(
    deps,
    buildMaintenanceJobs({
      ...deps,
      namespace: NAMESPACE,
      repository: createGitRepositoryReader(repositoryDirectory),
    }),
  );
}

/** Every fact row, with when it was invalidated: what no run of this item may change. */
async function factRows(store: MemoryStore) {
  const listed = await store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time: 'all',
    limit: 100,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.map(({ fact }) => [fact.id, fact.invalidatedAt]);
}

async function verificationsOf(store: MemoryStore, factId: string) {
  const listed = await store.listVerifications({ namespace: NAMESPACE, factId });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.map((verification) => verification.outcome);
}

/** The triggers of the audit entries the runs wrote: those other than the recording. */
async function verificationTriggers(store: MemoryStore, factId: string) {
  const listed = await store.listAuditEntries({ namespace: NAMESPACE, targetKind: 'fact', targetId: factId });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.filter((entry) => entry.operation === 'verification').map((entry) => entry.trigger);
}

describe('the verification job on a git repository', () => {
  it('flags a fact whose file a later commit deleted, records source_missing, and leaves it live and current', async () => {
    const store = await openStore();
    const repository = newRepository();
    const anchor = repository.commit({ [PATH]: 'PostgreSQL 16\n' }, 'Add the database note');
    const factId = await recordAnchoredFact(store, anchor);
    repository.commit({ [PATH]: null }, 'Remove the database note');
    const before = await factRows(store);

    const report = await runOn('2026-03-01', store, repository.directory);

    expect(report.jobs).toEqual([
      {
        name: 'verify_anchored_facts',
        status: 'ok',
        error: null,
        examined: 1,
        changed: 0,
        flagged: 1,
        failed: 0,
        flaggedItems: [{ id: factId, reason: 'source_missing' }],
      },
    ]);
    expect(await verificationsOf(store, factId)).toEqual(['source_missing']);
    const orphaned = await store.listOrphanedFacts({ namespace: NAMESPACE, limit: 10 });
    expect(orphaned.ok && orphaned.value.map(({ fact }) => fact.id)).toEqual([factId]);
    const current = await store.listFacts({
      namespace: NAMESPACE,
      subjectEntityId: null,
      predicate: null,
      touchingEntityIds: null,
      supersededByFactId: null,
      time: { validAt: toTimestamp(new Date('2026-03-01')), knownAt: toTimestamp(new Date('2026-03-01')) },
      limit: 10,
    });
    expect(current.ok && current.value.map(({ fact }) => fact.id)).toEqual([factId]);
    expect(await factRows(store)).toEqual(before);
    expect(await verificationTriggers(store, factId)).toEqual(['maintenance']);
  });

  it('confirms a fact whose file is unchanged, and a second run inside the interval examines nothing', async () => {
    const store = await openStore();
    const repository = newRepository();
    const anchor = repository.commit({ [PATH]: 'PostgreSQL 16\n' }, 'Add the database note');
    const factId = await recordAnchoredFact(store, anchor);
    repository.commit({ 'README.md': 'shop-api\n' }, 'Add a readme');
    const before = await factRows(store);

    await runOn('2026-03-01', store, repository.directory);
    const second = await runOn('2026-03-03', store, repository.directory);

    expect(await verificationsOf(store, factId)).toEqual(['confirmed']);
    expect(second.jobs[0]?.examined).toBe(0);
    expect(await factRows(store)).toEqual(before);
    expect(await verificationTriggers(store, factId)).toEqual(['maintenance']);
  });

  it('records nothing for a fact anchored at a commit that is not an ancestor of HEAD', async () => {
    const store = await openStore();
    const repository = newRepository();
    repository.commit({ [PATH]: 'PostgreSQL 14\n' }, 'Add the database note');
    repository.git('checkout', '--quiet', '-b', 'other');
    const elsewhere = repository.commit({ [PATH]: 'PostgreSQL 16\n' }, 'Upgrade on another branch');
    repository.git('checkout', '--quiet', 'main');
    const factId = await recordAnchoredFact(store, elsewhere);
    const before = await factRows(store);

    const report = await runOn('2026-03-01', store, repository.directory);

    expect(report.jobs[0]).toMatchObject({ status: 'ok', examined: 1, changed: 0, flagged: 0 });
    expect(await verificationsOf(store, factId)).toEqual([]);
    expect(await factRows(store)).toEqual(before);
  });

  it('records inconclusive for a fact whose file a later commit edited, and changes no fact', async () => {
    const store = await openStore();
    const repository = newRepository();
    const anchor = repository.commit({ [PATH]: 'PostgreSQL 16\n' }, 'Add the database note');
    const factId = await recordAnchoredFact(store, anchor);
    repository.commit({ [PATH]: 'PostgreSQL 17\n' }, 'Upgrade the database');
    const before = await factRows(store);

    await runOn('2026-03-01', store, repository.directory);

    expect(await verificationsOf(store, factId)).toEqual(['inconclusive']);
    expect(await factRows(store)).toEqual(before);
    expect(await verificationTriggers(store, factId)).toEqual(['maintenance']);
  });

  it('reports the job as failed in a directory that is not a git repository, and changes nothing', async () => {
    const store = await openStore();
    const repository = newRepository();
    const anchor = repository.commit({ [PATH]: 'PostgreSQL 16\n' }, 'Add the database note');
    const factId = await recordAnchoredFact(store, anchor);
    const notARepository = mkdtempSync(join(tmpdir(), 'factloom-not-a-repo-'));
    cleanups.push(() => rmSync(notARepository, { recursive: true, force: true }));
    const before = await factRows(store);

    const report = await runOn('2026-03-01', store, notARepository);

    expect(report.jobs).toMatchObject([
      { name: 'verify_anchored_facts', status: 'failed', error: 'invalid_input' },
    ]);
    expect(await verificationsOf(store, factId)).toEqual([]);
    expect(await factRows(store)).toEqual(before);
  });
});
