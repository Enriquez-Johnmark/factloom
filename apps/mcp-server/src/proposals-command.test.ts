// The proposals command of FL-070, run as a child process on a temporary database holding one
// pending succession proposal. It runs the test entry, which routes commands exactly as main.ts
// does but with the fake embedder, because approving records a fact and the local model is not
// in the cache during `pnpm check`.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFakeEmbedder,
  createTestDeps,
  type MemoryStore,
  parseDateInput,
  proposeChange,
  recordFacts,
} from '@kronomind/core';
import { softwareDevelopmentDomain } from '@kronomind/graph-rag';
import { openSqliteMemoryStore } from '@kronomind/storage';
import { afterEach, describe, expect, it } from 'vitest';
import { startServerProcess } from './testing/server-process.ts';

const ENTRY = join(import.meta.dirname, 'serve-with-fake-embedder.ts');
const NAMESPACE = 'repo:shop-api';
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function day(text: string) {
  const parsed = parseDateInput(text);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function openStore(path: string): MemoryStore {
  const embedder = createFakeEmbedder();
  const opened = openSqliteMemoryStore({
    path,
    embeddingModel: embedder.model,
    embeddingDimensions: embedder.dimensions,
  });
  if (!opened.ok) throw new Error(opened.error.message);
  return opened.value;
}

/** shop-api deployed to Fly.io, and a pending proposal that it moved to Kubernetes on 1 March. */
async function createDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'kronomind-proposals-'));
  directories.push(directory);
  const path = join(directory, 'kronomind.db');
  const store = openStore(path);
  let count = 0;
  const newId = () => {
    count += 1;
    return `id-${count}`;
  };
  const on = (date: string) => createTestDeps({ now: date, store, newId, domain: softwareDevelopmentDomain });
  const fact = (target: string, validFrom: string | null) => ({
    fact: {
      subjectEntityId: 'e-shop',
      predicate: 'deploys_to',
      object: { kind: 'value', value: target } as const,
      statement: `shop-api is deployed to ${target}.`,
      confidence: 0.9,
      validFrom: validFrom === null ? null : day(validFrom),
      validTo: null,
    },
    newEntities: [],
  });
  const note = (content: string) => ({
    kind: 'agent_note',
    locator: null,
    version: null,
    content,
    observedAt: day('2026-01-10'),
  });
  const recorded = await recordFacts(on('2026-01-10'), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: note('shop-api runs on Fly.io.'),
    drafts: [
      { ...fact('Fly.io', null), newEntities: [{ id: 'e-shop', type: 'repository', name: 'shop-api' }] },
    ],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const storedFactId = recorded.value.factIds[0] ?? '';
  const proposed = await proposeChange(on('2026-03-10'), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'judged_ended',
    storedFactId,
    supersession: { kind: 'succession', changedAt: day('2026-03-01') },
    newFact: fact('Kubernetes', null),
    source: note('We moved shop-api to Kubernetes on 1 March.'),
  });
  if (!proposed.ok) throw new Error(proposed.error.message);
  await store.close();
  return { directory, path, storedFactId, proposalId: proposed.value.proposalId };
}

async function run(
  database: { directory: string; path: string },
  args: readonly string[],
  namespace: string | null = NAMESPACE,
) {
  const variables: Record<string, string> = { KRONOMIND_DB: database.path };
  if (namespace !== null) variables.KRONOMIND_NAMESPACE = namespace;
  return startServerProcess(ENTRY, variables, database.directory, args).finished;
}

describe('the proposals command', () => {
  it('lists the pending proposal, and approving it ends the stored fact and makes the successor current, as a person', async () => {
    const database = await createDatabase();

    const listed = await run(database, ['proposals', 'list']);
    const approved = await run(database, ['proposals', 'approve', database.proposalId]);

    expect(listed.code).toBe(0);
    expect(listed.standardOutput).toContain(database.proposalId);
    expect(listed.standardOutput).toContain('succession');
    expect(listed.standardOutput).toContain('shop-api is deployed to Kubernetes.');
    expect(approved.code).toBe(0);
    const store = openStore(database.path);
    try {
      const current = await store.listFacts({
        namespace: NAMESPACE,
        subjectEntityId: 'e-shop',
        predicate: 'deploys_to',
        touchingEntityIds: null,
        supersededByFactId: null,
        time: { validAt: day('2026-11-01'), knownAt: day('2099-01-01') },
        limit: 10,
      });
      expect(current.ok && current.value.map((found) => found.fact.object)).toEqual([
        { kind: 'value', value: 'Kubernetes' },
      ]);
      const stored = await store.getFact({ namespace: NAMESPACE, factId: database.storedFactId });
      expect(stored.ok && stored.value?.fact.invalidatedAt).not.toBeNull();
      const entries = await store.listAuditEntries({
        namespace: NAMESPACE,
        targetKind: 'fact',
        targetId: database.storedFactId,
      });
      expect(entries.ok && entries.value.at(-1)).toMatchObject({
        operation: 'succession',
        trigger: 'person',
      });
    } finally {
      await store.close();
    }
  }, 30_000);

  it('refuses to approve the same proposal a second time, with already_exists and a non-zero exit code', async () => {
    const database = await createDatabase();
    await run(database, ['proposals', 'approve', database.proposalId]);

    const again = await run(database, ['proposals', 'approve', database.proposalId]);

    expect(again.code).not.toBe(0);
    expect(again.standardOutput).toContain('already_exists');
  }, 30_000);

  it('rejects a pending proposal, changes no fact, and no longer lists it', async () => {
    const database = await createDatabase();

    const rejected = await run(database, ['proposals', 'reject', database.proposalId]);
    const listed = await run(database, ['proposals', 'list']);

    expect(rejected.code).toBe(0);
    expect(listed.standardOutput).not.toContain(database.proposalId);
    const store = openStore(database.path);
    try {
      const stored = await store.getFact({ namespace: NAMESPACE, factId: database.storedFactId });
      expect(stored.ok && stored.value?.fact.invalidatedAt).toBeNull();
    } finally {
      await store.close();
    }
  }, 30_000);

  it('refuses to start with no namespace', async () => {
    const database = await createDatabase();

    const listed = await run(database, ['proposals', 'list'], null);

    expect(listed.code).not.toBe(0);
  }, 30_000);
});
