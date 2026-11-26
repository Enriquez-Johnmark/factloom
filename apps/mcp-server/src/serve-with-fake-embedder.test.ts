// The server over stdio, from the tool call down to a SQLite file, as a host starts it. It
// starts the test entry, which serves the server of main.ts with the fake embedder, so no
// model is needed, and passes no API key.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeEmbedder, createTestDeps, recordFacts } from '@factloom/core';
import { openSqliteMemoryStore } from '@factloom/storage';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SERVER_INSTRUCTIONS } from './server-instructions.ts';
import {
  INITIALIZE_REQUEST,
  INITIALIZED_NOTIFICATION,
  parseOutputLines,
  runServerRequests,
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

describe('the recall hook over stdio', () => {
  it('adds the facts that match a prompt to the context from a SQLite file', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'factloom-hook-'));
    directories.push(directory);
    const databasePath = join(directory, 'factloom.db');
    const factId = await recordOneFact(databasePath);
    const hook = startServerProcess(
      ENTRY,
      { FACTLOOM_DB: databasePath, FACTLOOM_NAMESPACE: NAMESPACE },
      directory,
      ['hook', 'recall'],
    );

    hook.send({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Where are the sessions of the shop API kept?',
    });
    hook.close();
    const { code, standardOutput } = await hook.finished;

    expect(code).toBe(0);
    const output = z
      .object({ hookSpecificOutput: z.object({ hookEventName: z.string(), additionalContext: z.string() }) })
      .parse(JSON.parse(standardOutput));
    expect(output.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    expect(output.hookSpecificOutput.additionalContext).toContain(
      `- The shop API keeps its sessions in redis. (fact ${factId})`,
    );
  }, 30_000);
});

describe('the server instructions over stdio', () => {
  it('gives its instructions in the initialize result', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'factloom-instructions-'));
    directories.push(directory);
    const server = startServerProcess(
      ENTRY,
      { FACTLOOM_DB: join(directory, 'factloom.db'), FACTLOOM_NAMESPACE: NAMESPACE },
      directory,
    );

    server.send(INITIALIZE_REQUEST);
    await waitFor(() => server.readStandardOutput().includes('"id":1'), 15_000);
    server.close();
    const { code, standardOutput } = await server.finished;

    expect(code).toBe(0);
    const initialized = z
      .object({ id: z.literal(1), result: z.object({ instructions: z.string() }) })
      .parse(
        parseOutputLines(standardOutput).find(
          (message) => z.object({ id: z.literal(1) }).safeParse(message).success,
        ),
      );
    expect(initialized.result.instructions).toBe(SERVER_INSTRUCTIONS);
  }, 30_000);
});

const ToolResultSchema = z.object({
  isError: z.boolean().optional(),
  structuredContent: z.unknown().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string() })),
});

/** One session of the test entry on the database file of a directory, which is also its home. */
function runServerSession(directory: string, requests: readonly { method: string; params: unknown }[]) {
  return runServerRequests({
    entry: ENTRY,
    variables: { FACTLOOM_DB: join(directory, 'factloom.db'), FACTLOOM_NAMESPACE: NAMESPACE },
    home: directory,
    requests,
    timeout: 15_000,
  });
}

const callTool = (name: string, args: Record<string, unknown>) => ({
  method: 'tools/call',
  params: { name, arguments: args },
});

const RECORDED_FACT = {
  subject: { type: 'repository', name: 'shop-api' },
  predicate: 'deploys_to',
  object: { value: 'Fly.io' },
  // Below 1, so that 'right' feedback can raise it (FL-060).
  confidence: 0.8,
  statement: 'shop-api is deployed to Fly.io.',
};
const QUESTION = { question: 'Where is shop-api deployed?' };

describe('the server over stdio', () => {
  it('the server keeps a recorded fact across a restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'factloom-smoke-'));
    directories.push(directory);

    const first = await runServerSession(directory, [
      { method: 'tools/list', params: {} },
      callTool('record_fact', RECORDED_FACT),
      callTool('remember', { text: 'shop-api is deployed to Fly.io.' }),
    ]);

    expect(first.code).toBe(0);
    const [listed, recorded, remembered] = first.answers;
    expect(
      z
        .object({ tools: z.array(z.object({ name: z.string() })) })
        .parse(listed)
        .tools.map((tool) => tool.name),
    ).toEqual(['recall', 'remember', 'record_fact', 'invalidate_fact', 'get_fact_history', 'give_feedback']);
    // The host research names 10 seconds as one host's default start-up limit.
    expect(first.answeredAt[0]).toBeLessThan(10_000);
    const fact = z
      .object({ fact: z.object({ fact_id: z.string(), outcome: z.string() }) })
      .parse(ToolResultSchema.parse(recorded).structuredContent).fact;
    expect(fact.outcome).toBe('recorded');
    const rememberResult = ToolResultSchema.parse(remembered);
    expect(rememberResult.isError).toBe(true);
    expect(rememberResult.content[0]?.text).toMatch(/^llm_failed: /);

    const second = await runServerSession(directory, [
      callTool('recall', QUESTION),
      callTool('get_fact_history', { fact_id: fact.fact_id }),
      // 'right', so that the fact stays live for invalidate_fact: 'wrong' retracts it (FL-060).
      callTool('give_feedback', { fact_id: fact.fact_id, signal: 'right' }),
      callTool('invalidate_fact', {
        fact_id: fact.fact_id,
        because: 'was_wrong',
        reason: 'A test of retraction.',
      }),
      callTool('recall', QUESTION),
    ]);

    expect(second.code).toBe(0);
    const [recalled, history, feedback, invalidated, recalledAfter] = second.answers.map((answer) =>
      ToolResultSchema.parse(answer),
    );
    const factIds = (result: z.infer<typeof ToolResultSchema> | undefined) =>
      z
        .object({ facts: z.array(z.object({ fact_id: z.string() })) })
        .parse(result?.structuredContent)
        .facts.map((found) => found.fact_id);
    expect(factIds(recalled)).toContain(fact.fact_id);
    const entries = z
      .object({ entries: z.array(z.object({ changes: z.array(z.object({ action: z.string() })) })) })
      .parse(history?.structuredContent).entries;
    expect(entries.map((entry) => entry.changes.map((change) => change.action))).toEqual([['fact.recorded']]);
    expect(
      z
        .object({
          feedback_id: z.string().min(1),
          follow_up: z.literal('confidence_raised'),
        })
        .safeParse(feedback?.structuredContent).success,
    ).toBe(true);
    expect(invalidated?.isError).toBeUndefined();
    expect(factIds(recalledAfter)).not.toContain(fact.fact_id);

    for (const line of [
      ...parseOutputLines(first.standardOutput),
      ...parseOutputLines(second.standardOutput),
    ]) {
      expect(line).toMatchObject({ jsonrpc: '2.0' });
    }
    for (const name of readdirSync(directory)) expect(name).toMatch(/^factloom\.db(-wal|-shm|-journal)?$/);
  }, 60_000);
});
