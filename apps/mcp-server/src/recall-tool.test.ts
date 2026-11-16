import {
  createTestDeps,
  endFact,
  err,
  type FactDraft,
  invalidateFact,
  type MemoryStore,
  type OperationDeps,
  parseDateInput,
  recordFacts,
  type Timestamp,
} from '@factloom/core';
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createFactloomServer } from './create-factloom-server.ts';
import { registerRecallTool } from './recall-tool.ts';

const NAMESPACE = 'repo:shop-api';
const SHOP = { id: 'e-shop', type: 'repository', name: 'shop-api' } as const;
/** The moment every call is made, unless a test says otherwise. */
const NOW = '2026-04-01';

function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function draft(predicate: string, value: string, from: string | null): FactDraft {
  return {
    fact: {
      subjectEntityId: SHOP.id,
      predicate,
      object: { kind: 'value', value },
      statement: `The shop API ${predicate.replaceAll('_', ' ')} ${value}.`,
      confidence: 1,
      validFrom: from === null ? null : at(from),
      validTo: null,
    },
    newEntities: [],
  };
}

/**
 * The shop API's memory: since 2026-01-10 it depends on jest, corrected to vitest on
 * 2026-02-01; it ran on Postgres 15 from 2025-01-01, and on Postgres 16 from 2026-03-01.
 */
async function recordMemory() {
  const first = createTestDeps({ now: '2026-01-10' });
  const on = (date: string): OperationDeps =>
    createTestDeps({ now: date, store: first.store, newId: first.newId });
  const recorded = await recordFacts(on('2026-01-10'), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: {
      kind: 'agent_note',
      locator: 'notes/setup.md',
      version: null,
      content: 'What the agent learned.',
      observedAt: at('2026-01-10'),
    },
    drafts: [
      { ...draft('depends_on', 'jest', null), newEntities: [SHOP] },
      draft('uses_database_version', 'postgres 15', '2025-01-01'),
    ],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const [jest, postgres15] = recorded.value.factIds;
  if (jest === undefined || postgres15 === undefined) throw new Error('Nothing was recorded.');
  const note = (content: string, date: string) => ({
    kind: 'agent_note',
    locator: null,
    version: null,
    content,
    observedAt: at(date),
  });
  const corrected = await invalidateFact(on('2026-02-01'), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'reported_wrong',
    factId: jest,
    source: note('It is vitest, not jest.', '2026-02-01'),
    replacement: draft('depends_on', 'vitest', null),
  });
  if (!corrected.ok || corrected.value.replacementFactId === null) throw new Error('The correction failed.');
  const ended = await endFact(on('2026-03-05'), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'reported_ended',
    factId: postgres15,
    validTo: at('2026-03-01'),
    source: note('We moved to Postgres 16 on 1 March.', '2026-03-05'),
    successor: draft('uses_database_version', 'postgres 16', null),
  });
  if (!ended.ok || ended.value.successorFactId === null) throw new Error('The succession failed.');
  return {
    store: first.store,
    newId: first.newId,
    facts: {
      jest,
      vitest: corrected.value.replacementFactId,
      postgres15Ended: ended.value.endedFactId,
      postgres16: ended.value.successorFactId,
    },
  };
}

const clients: Client[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
});

/** A client connected in process to a server with the recall tool, on the given memory and clock. */
async function connect(store: MemoryStore, newId: () => string, now = NOW): Promise<Client> {
  const deps = createTestDeps({ now, store, newId });
  const server = createFactloomServer(
    {
      store,
      embedder: deps.embedder,
      domain: softwareDevelopmentDomain,
      llm: deps.llm,
      namespace: NAMESPACE,
      now: deps.now,
      newId,
      log: () => {},
    },
    [registerRecallTool],
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientSide);
  clients.push(client);
  return client;
}

const RecallResultSchema = z.object({
  structuredContent: z.object({
    facts: z.array(
      z.object({
        fact_id: z.string(),
        invalidated_at: z.string().nullable(),
        superseded_by_fact_id: z.string().nullable(),
        sources: z.array(z.record(z.string(), z.unknown())),
      }),
    ),
  }),
  content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
});

/** Calls recall and returns its structured result, failing the test on an error result. */
async function callRecall(client: Client, args: Record<string, unknown>) {
  const result = await client.callTool({ name: 'recall', arguments: args });
  if (result.isError === true) throw new Error(JSON.stringify(result.content));
  return RecallResultSchema.parse(result);
}

/** The text of an error result. */
async function errorText(client: Client, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name: 'recall', arguments: args });
  expect(result.isError).toBe(true);
  const [first] = z.array(z.object({ text: z.string() })).parse(result.content);
  return first?.text ?? '';
}

const QUESTION = 'What does the shop API use?';

describe('the recall tool', () => {
  it('lists recall with a description on every input field', async () => {
    const memory = await recordMemory();
    const client = await connect(memory.store, memory.newId);

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(['recall']);
    const properties = z
      .record(z.string(), z.object({ description: z.string().min(1) }))
      .parse(tools[0]?.inputSchema.properties);
    expect(Object.keys(properties).sort()).toEqual(['as_of', 'known_at', 'limit', 'question']);
  });

  it('declares an output schema and the read-only annotation', async () => {
    const memory = await recordMemory();
    const client = await connect(memory.store, memory.newId);

    const { tools } = await client.listTools();

    expect(tools[0]?.outputSchema).toBeDefined();
    expect(tools[0]?.annotations).toEqual({ readOnlyHint: true, openWorldHint: false });
  });

  it('returns the same facts as structured content and as text', async () => {
    const memory = await recordMemory();
    const client = await connect(memory.store, memory.newId);

    // As-of date: now (2026-04-01). Known-at date: now.
    const result = await client.callTool({ name: 'recall', arguments: { question: QUESTION } });

    const [text] = z.array(z.object({ text: z.string() })).parse(result.content);
    expect(result.structuredContent).toBeDefined();
    expect(JSON.parse(text?.text ?? '')).toEqual(result.structuredContent);
  });

  it('returns current facts when no date is given', async () => {
    const memory = await recordMemory();
    const client = await connect(memory.store, memory.newId);

    // As-of date: now (2026-04-01). Known-at date: now.
    const result = await callRecall(client, { question: QUESTION });

    expect(result.structuredContent.facts.map((fact) => fact.fact_id).sort()).toEqual(
      [memory.facts.vitest, memory.facts.postgres16].sort(),
    );
  });

  it('accepts a calendar date as the as-of date', async () => {
    const memory = await recordMemory();
    const client = await connect(memory.store, memory.newId);

    // As-of date: 2025-06-01. Known-at date: now (2026-04-01).
    const result = await callRecall(client, { question: QUESTION, as_of: '2025-06-01' });

    expect(result.structuredContent.facts.map((fact) => fact.fact_id).sort()).toEqual(
      [memory.facts.vitest, memory.facts.postgres15Ended].sort(),
    );
  });

  it('returns a fact withdrawn since the known-at date with its invalidation', async () => {
    const memory = await recordMemory();
    const client = await connect(memory.store, memory.newId);

    // As-of date: 2026-01-20, which the known-at date gives. Known-at date: 2026-01-20.
    const result = await callRecall(client, { question: QUESTION, known_at: '2026-01-20' });

    const jest = result.structuredContent.facts.find((fact) => fact.fact_id === memory.facts.jest);
    expect(jest?.invalidated_at).toBe(at('2026-02-01'));
    expect(jest?.superseded_by_fact_id).toBe(memory.facts.vitest);
  });

  it('returns invalid_input for a malformed date', async () => {
    const memory = await recordMemory();
    const client = await connect(memory.store, memory.newId);

    for (const field of ['as_of', 'known_at']) {
      expect(await errorText(client, { question: QUESTION, [field]: 'last tuesday' })).toMatch(
        new RegExp(`^invalid_input: ${field}: `),
      );
    }
  });

  it('returns each source without its content', async () => {
    const memory = await recordMemory();
    const client = await connect(memory.store, memory.newId);

    // As-of date: now (2026-04-01). Known-at date: now.
    const result = await callRecall(client, { question: QUESTION });

    const sources = result.structuredContent.facts.flatMap((fact) => fact.sources);
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(Object.keys(source).sort()).toEqual(['kind', 'locator', 'observed_at', 'version']);
    }
  });

  it('starts an error text with the error code', async () => {
    const memory = await recordMemory();
    const failing: MemoryStore = {
      ...memory.store,
      searchFactsByVector: () => Promise.resolve(err('storage_failed', 'The disk is full.')),
    };
    const client = await connect(failing, memory.newId);

    expect(await errorText(client, { question: QUESTION })).toMatch(/^storage_failed: The disk is full\./);
  });

  it('answers input of any shape with a tool result and keeps serving', async () => {
    const memory = await recordMemory();
    const client = await connect(memory.store, memory.newId);
    const anyValue = fc.jsonValue();
    // Generated with the library and the seed of FL-075: objects that pass the tool's schema
    // with any text in the date fields, which reach the handler; objects with the tool's own
    // fields set to values of any JSON type; and objects with any other keys.
    const argumentsArbitrary = fc.oneof(
      fc.record(
        {
          question: fc.string({ minLength: 1, maxLength: 200 }),
          as_of: fc.string(),
          known_at: fc.string(),
          limit: fc.integer({ min: 1, max: 50 }),
        },
        { requiredKeys: ['question'] },
      ),
      fc.record(
        { question: fc.oneof(fc.string(), anyValue), as_of: anyValue, known_at: anyValue, limit: anyValue },
        { requiredKeys: [] },
      ),
      fc.dictionary(fc.string(), anyValue),
    );

    await fc.assert(
      fc.asyncProperty(argumentsArbitrary, async (args) => {
        const result = await client.callTool({ name: 'recall', arguments: args });
        if (result.isError === true) {
          // Input the schema refuses is answered by the SDK with its own message (MCP-TOOLS.md, "Errors").
          const [first] = z.array(z.object({ text: z.string() })).parse(result.content);
          expect(first?.text).toMatch(/^(invalid_input: |Input validation error)/);
        } else {
          RecallResultSchema.parse(result);
        }
      }),
      { seed: 20261115, numRuns: 200 },
    );

    expect((await client.listTools()).tools).toHaveLength(1);
  });
});
