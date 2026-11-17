// Fixtures for the tests of the maintenance jobs on a git repository (FL-050, FL-054): a
// SQLite store, a fixture repository, one fact about the database recorded from a file at a
// commit, and a maintenance run built as the composition root builds it. Not a test file: it
// imports no test framework.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFakeEmbedder,
  createTestDeps,
  type Domain,
  type MemoryStore,
  recordFacts,
  TEST_DOMAIN,
  toTimestamp,
} from '@factloom/core';
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { runMaintenance } from '@factloom/maintenance';
import { openSqliteMemoryStore } from '@factloom/storage';
import { createGitRepositoryReader } from '../create-git-repository-reader.ts';
import { buildMaintenanceJobs } from '../maintenance-jobs.ts';
import { createFixtureRepository } from './fixture-repository.ts';

export const NAMESPACE = 'repo:shop-api';
export const PATH = 'docs/database.md';
const cleanups: (() => Promise<void> | void)[] = [];

/** Closes every store and removes every directory the helpers made. Call it after each test. */
export async function cleanUpFixtures(): Promise<void> {
  for (const cleanup of cleanups.splice(0)) await cleanup();
}

export async function openStore(): Promise<MemoryStore> {
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

/** A new, empty directory that is not a git repository, removed by `cleanUpFixtures`. */
export function newPlainDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'factloom-not-a-repo-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

export function newRepository() {
  const repository = createFixtureRepository();
  cleanups.push(repository.remove);
  return repository;
}

/** Records the database fact from a file at a commit, on 2026-01-10. */
export async function recordAnchoredFact(store: MemoryStore, commit: string, path = PATH): Promise<string> {
  const recorded = await recordFacts(createTestDeps({ now: '2026-01-10', domain: TEST_DOMAIN, store }), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: {
      kind: 'file',
      locator: path,
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

/** Records, with the software development domain, that the function `name` parses a calendar date, from a file at a commit. */
export async function recordSymbolFact(
  store: MemoryStore,
  commit: string,
  path: string,
  name: string,
): Promise<string> {
  const recorded = await recordFacts(
    createTestDeps({ now: '2026-01-10', domain: softwareDevelopmentDomain, store }),
    {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'stated',
      source: {
        kind: 'file',
        locator: path,
        version: commit,
        content: `${name} parses a calendar date.`,
        observedAt: toTimestamp(new Date('2026-01-10')),
      },
      drafts: [
        {
          fact: {
            subjectEntityId: `symbol-${name}`,
            predicate: 'described_as',
            object: { kind: 'value', value: 'parses a calendar date' },
            statement: `${name} parses a calendar date`,
            confidence: 0.9,
            validFrom: null,
            validTo: null,
          },
          newEntities: [{ id: `symbol-${name}`, type: 'symbol', name }],
        },
      ],
      restatedFactIds: [],
    },
  );
  if (!recorded.ok) throw new Error(recorded.error.message);
  return recorded.value.factIds[0] ?? 'none';
}

/** Records, with the software development domain, that `dependency` is pinned at `version`, from a manifest at a commit. */
export async function recordVersionFact(
  store: MemoryStore,
  commit: string,
  dependency: string,
  version: string,
): Promise<string> {
  const recorded = await recordFacts(
    createTestDeps({ now: '2026-01-10', domain: softwareDevelopmentDomain, store }),
    {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'stated',
      source: {
        kind: 'file',
        locator: 'package.json',
        version: commit,
        content: `${dependency} is pinned at ${version}.`,
        observedAt: toTimestamp(new Date('2026-01-10')),
      },
      drafts: [
        {
          fact: {
            subjectEntityId: `dependency-${dependency}`,
            predicate: 'pins_version',
            object: { kind: 'value', value: version },
            statement: `${dependency} is pinned at version ${version}.`,
            confidence: 0.9,
            validFrom: null,
            validTo: null,
          },
          newEntities: [{ id: `dependency-${dependency}`, type: 'dependency', name: dependency }],
        },
      ],
      restatedFactIds: [],
    },
  );
  if (!recorded.ok) throw new Error(recorded.error.message);
  return recorded.value.factIds[0] ?? 'none';
}

/** Runs maintenance once on a day, with an LLM client among the dependencies that fails if called. */
export function runOn(
  day: string,
  store: MemoryStore,
  repositoryDirectory: string,
  domain: Domain = softwareDevelopmentDomain,
) {
  const deps = createTestDeps({ now: day, store, domain });
  return runMaintenance(
    deps,
    buildMaintenanceJobs({
      ...deps,
      namespace: NAMESPACE,
      repository: createGitRepositoryReader(repositoryDirectory),
      archiveAfterDays: 180,
    }),
  );
}

/** Every fact row, with when it was invalidated: what no run of this item may change. */
export async function factRows(store: MemoryStore) {
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

export async function verificationsOf(store: MemoryStore, factId: string) {
  const listed = await store.listVerifications({ namespace: NAMESPACE, factId });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.map((verification) => verification.outcome);
}
