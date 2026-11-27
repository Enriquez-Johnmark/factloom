// The purge command of FL-072, run as a child process of the real entry point on a temporary
// database: it lists a fact's sources, purges one with a reason, and prints no content.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ChangeSet, createInMemoryStore, parseDateInput } from '@kronomind/core';
import { openSqliteMemoryStore } from '@kronomind/storage';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalEmbedder } from './create-local-embedder.ts';
import { FACTLOOM_TOOLS } from './factloom-tools.ts';
import { connectInProcess, UNREACHABLE_LLM } from './testing/connect-in-process.ts';
import { startServerProcess } from './testing/server-process.ts';

const MAIN = join(import.meta.dirname, 'main.ts');
const NAMESPACE = 'repo:shop-api';
const MARKER = 'ZEBRA7731';
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function day(text: string) {
  const parsed = parseDateInput(text);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

/** A database with one fact about a deploy key, from a source that holds the marker. */
async function createDatabase(): Promise<{ directory: string; path: string }> {
  const directory = mkdtempSync(join(tmpdir(), 'factloom-purge-'));
  directories.push(directory);
  const path = join(directory, 'factloom.db');
  // The vectors are written with the local embedder's model name and size, which the
  // command's store checks on open; no model is loaded.
  const embedder = createLocalEmbedder({ cacheDirectory: join(directory, 'models'), allowDownload: false });
  const opened = openSqliteMemoryStore({
    path,
    embeddingModel: embedder.model,
    embeddingDimensions: embedder.dimensions,
  });
  if (!opened.ok) throw new Error(opened.error.message);
  const at = day('2026-01-10');
  const changeSet: ChangeSet = {
    namespace: NAMESPACE,
    operationId: 'op-1',
    operation: 'remember',
    trigger: 'agent',
    reasonCode: 'stated',
    explainedBySourceId: 's-key',
    occurredAt: at,
    changes: [
      {
        kind: 'create_entity',
        entity: { id: 'e-shop', namespace: NAMESPACE, type: 'repository', name: 'shop-api', createdAt: at },
      },
      {
        kind: 'record_source',
        source: {
          id: 's-key',
          namespace: NAMESPACE,
          kind: 'agent_note',
          locator: 'notes/deploy.md',
          version: null,
          content: `The deploy key of shop-api is ${MARKER}.`,
          contentHash: 'h-key',
          observedAt: at,
          createdAt: at,
          purgedAt: null,
        },
      },
      {
        kind: 'record_fact',
        fact: {
          id: 'f-key',
          namespace: NAMESPACE,
          subjectEntityId: 'e-shop',
          predicate: 'deploys_to',
          object: { kind: 'value', value: MARKER },
          statement: `shop-api deploys with the key ${MARKER}.`,
          confidence: 0.9,
          validFrom: null,
          validTo: null,
          createdAt: at,
          invalidatedAt: null,
          supersededByFactId: null,
          purgedAt: null,
        },
        sourceIds: ['s-key'],
        embedding: new Float32Array(embedder.dimensions).fill(0.01),
        singleValued: true,
      },
    ],
  };
  const committed = await opened.value.commit(changeSet);
  if (!committed.ok) throw new Error(committed.error.message);
  await opened.value.close();
  return { directory, path };
}

async function run(
  directory: string,
  path: string,
  args: readonly string[],
  namespace: string | null = NAMESPACE,
) {
  const variables: Record<string, string> = { FACTLOOM_DB: path };
  if (namespace !== null) variables.FACTLOOM_NAMESPACE = namespace;
  const started = startServerProcess(MAIN, variables, directory, args);
  started.close();
  return started.finished;
}

/** The tables of the file in which the marker is found, in any column. */
function findMarkerInTables(path: string): string[] {
  const db = new Database(path, { readonly: true });
  try {
    const found: string[] = [];
    const tables = db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_schema WHERE type = 'table'")
      .all();
    for (const { name: table } of tables) {
      for (const { name } of db
        .prepare<[], { name: string }>(`SELECT name FROM pragma_table_info('${table}')`)
        .all()) {
        const row = db
          .prepare<[string], { n: number }>(
            `SELECT count(*) AS n FROM "${table}" WHERE instr(lower(CAST("${name}" AS BLOB)), lower(CAST(? AS BLOB))) > 0`,
          )
          .get(MARKER);
        if ((row?.n ?? 0) > 0) found.push(`${table}.${name}`);
      }
    }
    return found;
  } finally {
    db.close();
  }
}

function purgeEntries(path: string) {
  const db = new Database(path, { readonly: true });
  try {
    return db
      .prepare(
        "SELECT action, target_id, trigger, reason_code FROM audit_log WHERE operation = 'purge' ORDER BY id",
      )
      .all();
  } finally {
    db.close();
  }
}

describe('the purge command', () => {
  it('lists the sources of a fact, purges one with a reason, and prints no content', async () => {
    const { directory, path } = await createDatabase();

    const listed = await run(directory, path, ['purge', 'sources', 'f-key']);
    const purged = await run(directory, path, ['purge', 'source', 's-key', '--reason', 'secret_stored']);

    expect(listed.code).toBe(0);
    expect(listed.standardOutput).toBe('s-key\tagent_note\tnotes/deploy.md\t2026-01-10T00:00:00.000Z\n');
    expect(purged.code).toBe(0);
    expect(purged.standardOutput).toContain('Purged sources: s-key');
    expect(purged.standardOutput).toContain('Purged facts: f-key');
    expect(purged.standardOutput).toContain('Freed pages cleared.');
    for (const output of [listed, purged]) {
      expect(`${output.standardOutput}${output.standardError}`).not.toContain(MARKER);
    }
    expect(findMarkerInTables(path)).toEqual([]);
    expect(purgeEntries(path)).toEqual([
      { action: 'fact.invalidated', target_id: 'f-key', trigger: 'person', reason_code: 'secret_stored' },
      { action: 'fact.purged', target_id: 'f-key', trigger: 'person', reason_code: 'secret_stored' },
      { action: 'source.purged', target_id: 's-key', trigger: 'person', reason_code: 'secret_stored' },
    ]);
  }, 30_000);

  it('refuses a purge with no reason and leaves the database as it was', async () => {
    const { directory, path } = await createDatabase();

    const refused = await run(directory, path, ['purge', 'source', 's-key']);

    expect(refused.code).not.toBe(0);
    expect(refused.standardOutput).toMatch(/^invalid_input: /);
    expect(findMarkerInTables(path).length).toBeGreaterThan(0);
    expect(purgeEntries(path)).toEqual([]);
  }, 30_000);

  it('refuses to start with no namespace', async () => {
    const { directory, path } = await createDatabase();

    const refused = await run(directory, path, ['purge', 'sources', 'f-key'], null);

    expect(refused.code).not.toBe(0);
    expect(refused.standardError).toContain('FACTLOOM_NAMESPACE is not set');
  }, 30_000);

  it('the server built by the composition root lists no tool for purge', async () => {
    const client = await connectInProcess({
      tools: FACTLOOM_TOOLS,
      store: createInMemoryStore(),
      newId: () => 'id',
      now: '2026-03-10',
      llm: UNREACHABLE_LLM,
    });
    const { tools } = await client.listTools();
    await client.close();

    expect(tools.map((tool) => tool.name).filter((name) => name.includes('purge'))).toEqual([]);
  });
});
