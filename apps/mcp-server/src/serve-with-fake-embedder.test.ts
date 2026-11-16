// The recall tool over stdio, from the tool call down to a SQLite file. It starts the test
// entry, which serves the server of main.ts with the fake embedder, so no model is needed.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeEmbedder, createTestDeps, recordFacts } from '@factloom/core';
import { openSqliteMemoryStore } from '@factloom/storage';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  INITIALIZE_REQUEST,
  INITIALIZED_NOTIFICATION,
  parseOutputLines,
  startServerProcess,
  waitFor,
} from './testing/server-process.ts';

const ENTRY = join(import.meta.dirname, 'serve-with-fake-embedder.ts');
const NAMESPACE = 'repo:shop-api';
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** Records one fact in a new SQLite file, with the fake embedder that the test entry uses. */
async function recordOneFact(path: string): Promise<string> {
  const embedder = createFakeEmbedder();
  const opened = openSqliteMemoryStore({
    path,
    embeddingModel: embedder.model,
    embeddingDimensions: embedder.dimensions,
  });
  if (!opened.ok) throw new Error(opened.error.message);
  const deps = createTestDeps({ now: '2026-01-10', store: opened.value });
  const recorded = await recordFacts(deps, {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: { kind: 'agent_note', locator: null, version: null, content: 'A note.', observedAt: deps.now() },
    drafts: [
      {
        fact: {
          subjectEntityId: 'e-shop',
          predicate: 'depends_on',
          object: { kind: 'value', value: 'redis' },
          statement: 'The shop API keeps its sessions in redis.',
          confidence: 1,
          validFrom: null,
          validTo: null,
        },
        newEntities: [{ id: 'e-shop', type: 'repository', name: 'shop-api' }],
      },
    ],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  await opened.value.close();
  return recorded.value.factIds[0] ?? '';
}

const CallResultSchema = z.object({
  id: z.literal(2),
  result: z.object({
    structuredContent: z.object({ facts: z.array(z.object({ fact_id: z.string(), statement: z.string() })) }),
  }),
});

describe('the recall tool over stdio', () => {
  it('answers recall over stdio from a SQLite file', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'factloom-recall-'));
    directories.push(directory);
    const databasePath = join(directory, 'factloom.db');
    const factId = await recordOneFact(databasePath);
    const server = startServerProcess(
      ENTRY,
      { FACTLOOM_DB: databasePath, FACTLOOM_NAMESPACE: NAMESPACE },
      directory,
    );

    server.send(INITIALIZE_REQUEST);
    await waitFor(() => server.readStandardOutput().includes('"id":1'), 15_000);
    server.send(INITIALIZED_NOTIFICATION);
    server.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'recall', arguments: { question: 'Where are the sessions of the shop API kept?' } },
    });
    await waitFor(() => server.readStandardOutput().includes('"id":2'), 15_000);
    server.close();
    const { code, standardOutput } = await server.finished;

    expect(code).toBe(0);
    const messages = parseOutputLines(standardOutput);
    for (const message of messages) expect(message).toMatchObject({ jsonrpc: '2.0' });
    const answer = CallResultSchema.parse(
      messages.find((message) => z.object({ id: z.literal(2) }).safeParse(message).success),
    );
    expect(answer.result.structuredContent.facts).toContainEqual(
      expect.objectContaining({ fact_id: factId, statement: 'The shop API keeps its sessions in redis.' }),
    );
  }, 30_000);
});
