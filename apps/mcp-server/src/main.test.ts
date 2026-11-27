// The server as a host runs it: `node main.ts` as a child process, spoken to over stdio. None
// of these tests loads the embedding model: the server answers before it is needed.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDateInput } from '@kronomind/core';
import { openSqliteMemoryStore } from '@kronomind/storage';
import { afterEach, describe, expect, it } from 'vitest';
import { SERVER_INSTRUCTIONS } from './server-instructions.ts';
import {
  INITIALIZE_REQUEST,
  INITIALIZED_NOTIFICATION,
  parseOutputLines,
  startServerProcess,
  waitFor,
} from './testing/server-process.ts';

const MAIN = join(import.meta.dirname, 'main.ts');
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'kronomind-server-'));
  directories.push(directory);
  return directory;
}

describe('the server over stdio', () => {
  it('starts over stdio on a new SQLite file', async () => {
    const directory = createTemporaryDirectory();
    const databasePath = join(directory, 'memory', 'kronomind.db');
    const server = startServerProcess(
      MAIN,
      { KRONOMIND_DB: databasePath, KRONOMIND_NAMESPACE: 'repo:shop-api' },
      directory,
    );

    server.send(INITIALIZE_REQUEST);
    await waitFor(() => server.readStandardOutput().includes('"id":1'), 15_000);
    server.send(INITIALIZED_NOTIFICATION);
    server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    await waitFor(() => server.readStandardOutput().includes('"id":2'), 15_000);
    server.close();
    const { code, standardOutput } = await server.finished;

    expect(code).toBe(0);
    expect(existsSync(databasePath)).toBe(true);
    // Closing the last connection checkpoints the write-ahead log and removes its file.
    expect(existsSync(`${databasePath}-wal`)).toBe(false);
    const messages = parseOutputLines(standardOutput);
    for (const message of messages) expect(message).toMatchObject({ jsonrpc: '2.0' });
    expect(messages[0]).toMatchObject({ id: 1, result: { instructions: SERVER_INSTRUCTIONS } });
    expect(messages[1]).toMatchObject({
      id: 2,
      result: {
        tools: [
          { name: 'recall' },
          { name: 'remember' },
          { name: 'record_fact' },
          { name: 'invalidate_fact' },
          { name: 'get_fact_history' },
          { name: 'give_feedback' },
        ],
      },
    });
  }, 30_000);

  it('exits when no namespace is configured', async () => {
    const directory = createTemporaryDirectory();
    const { finished } = startServerProcess(
      MAIN,
      { KRONOMIND_DB: join(directory, 'kronomind.db') },
      directory,
    );

    const { code, standardError, standardOutput } = await finished;

    expect(code).not.toBe(0);
    expect(standardError).toContain('KRONOMIND_NAMESPACE');
    expect(standardOutput).toBe('');
  }, 30_000);

  it('exits when the database was built with another embedding model', async () => {
    const directory = createTemporaryDirectory();
    const databasePath = join(directory, 'kronomind.db');
    await writeFactWithAnotherModel(databasePath);
    const { finished } = startServerProcess(
      MAIN,
      { KRONOMIND_DB: databasePath, KRONOMIND_NAMESPACE: 'repo:shop-api' },
      directory,
    );

    const { code, standardError, standardOutput } = await finished;

    expect(code).not.toBe(0);
    expect(standardError).toContain('embedding_model_mismatch');
    expect(standardOutput).toBe('');
  }, 30_000);
});

/** Writes one fact whose vector names a model other than the local embedder's. */
async function writeFactWithAnotherModel(path: string): Promise<void> {
  const opened = openSqliteMemoryStore({ path, embeddingModel: 'another-model', embeddingDimensions: 4 });
  if (!opened.ok) throw new Error(opened.error.message);
  const store = opened.value;
  const day = parseDateInput('2026-01-10');
  if (!day.ok) throw new Error(day.error.message);
  const namespace = 'repo:shop-api';
  const committed = await store.commit({
    namespace,
    operationId: 'op-1',
    operation: 'remember',
    trigger: 'agent',
    reasonCode: 'stated',
    explainedBySourceId: 's-1',
    occurredAt: day.value,
    changes: [
      {
        kind: 'create_entity',
        entity: { id: 'e-shop', namespace, type: 'repository', name: 'shop-api', createdAt: day.value },
      },
      {
        kind: 'record_source',
        source: {
          id: 's-1',
          namespace,
          kind: 'agent_note',
          locator: null,
          version: null,
          content: 'The shop API depends on redis.',
          contentHash: null,
          purgedAt: null,
          observedAt: day.value,
          createdAt: day.value,
        },
      },
      {
        kind: 'record_fact',
        fact: {
          id: 'f-1',
          namespace,
          subjectEntityId: 'e-shop',
          predicate: 'depends_on',
          object: { kind: 'value', value: 'redis' },
          statement: 'The shop API depends on redis.',
          confidence: 1,
          validFrom: null,
          validTo: null,
          createdAt: day.value,
          invalidatedAt: null,
          purgedAt: null,
          supersededByFactId: null,
        },
        sourceIds: ['s-1'],
        embedding: new Float32Array([1, 0, 0, 0]),
        singleValued: false,
      },
    ],
  });
  if (!committed.ok) throw new Error(committed.error.message);
  await store.close();
}
