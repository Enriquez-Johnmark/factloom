import { createInMemoryStore, type MemoryStore } from '@kronomind/core';
import { softwareDevelopmentDomain } from '@kronomind/graph-rag';
import type { Client } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { registerRecordFactTool } from './record-fact-tool.ts';
import { connectInProcess, TEST_NAMESPACE, UNREACHABLE_LLM } from './testing/connect-in-process.ts';

// Every client here is connected with an LLM that fails the test if it is called.

const RecordFactResultSchema = z.object({
  fact: z.object({
    fact_id: z.string(),
    statement: z.string(),
    valid_from: z.string().nullable(),
    valid_to: z.string().nullable(),
    outcome: z.enum(['recorded', 'restated']),
  }),
});

const SHOP = { type: 'repository', name: 'shop-api' };

function deploysTo(target: string, extra: Record<string, unknown> = {}) {
  return {
    subject: SHOP,
    predicate: 'deploys_to',
    object: { value: target },
    statement: `shop-api is deployed to ${target}.`,
    ...extra,
  };
}

const clients: Client[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
});

function createMemory() {
  const store: MemoryStore = createInMemoryStore();
  let count = 0;
  const newId = () => {
    count += 1;
    return `id-${count}`;
  };
  const connect = async (now = '2026-03-10') => {
    const client = await connectInProcess({
      tools: [registerRecordFactTool],
      store,
      newId,
      now,
      llm: UNREACHABLE_LLM,
      anchorFileSource: (locator) =>
        Promise.resolve(
          locator.startsWith('/') ? null : { locator, version: 'c0ffee0000000000000000000000000000000000' },
        ),
    });
    clients.push(client);
    return client;
  };
  const record = async (args: Record<string, unknown>, now?: string) => {
    const result = await (await connect(now)).callTool({ name: 'record_fact', arguments: args });
    if (result.isError === true) throw new Error(JSON.stringify(result.content));
    return RecordFactResultSchema.parse(result.structuredContent).fact;
  };
  const errorText = async (args: Record<string, unknown>, now?: string) => {
    const result = await (await connect(now)).callTool({ name: 'record_fact', arguments: args });
    expect(result.isError).toBe(true);
    const [first] = z.array(z.object({ text: z.string() })).parse(result.content);
    return first?.text ?? '';
  };
  return { store, record, errorText };
}

const DEFINED_IN = {
  subject: { type: 'symbol', name: 'createLabel' },
  predicate: 'defined_in',
  object: { value: 'lib/labels.js' },
  statement: 'createLabel, in lib/labels.js, asks the carrier for a shipping label.',
};

describe('the record_fact tool', () => {
  it('records a file source without a commit at the commit HEAD names, so it can be verified', async () => {
    const memory = createMemory();

    const fact = await memory.record({ ...DEFINED_IN, source: { kind: 'file', locator: 'lib/labels.js' } });

    const stored = await memory.store.getFact({ namespace: TEST_NAMESPACE, factId: fact.fact_id });
    expect(
      stored.ok && stored.value?.sources.map(({ kind, locator, version }) => ({ kind, locator, version })),
    ).toEqual([
      { kind: 'file', locator: 'lib/labels.js', version: 'c0ffee0000000000000000000000000000000000' },
    ]);
  });

  it('keeps the commit a file source names', async () => {
    const memory = createMemory();

    const fact = await memory.record({
      ...DEFINED_IN,
      source: { kind: 'file', locator: 'lib/labels.js', version: 'abc1234' },
    });

    const stored = await memory.store.getFact({ namespace: TEST_NAMESPACE, factId: fact.fact_id });
    expect(stored.ok && stored.value?.sources[0]?.version).toBe('abc1234');
  });

  it('records a file source it cannot anchor as given, without a commit', async () => {
    const memory = createMemory();

    const fact = await memory.record({
      ...DEFINED_IN,
      source: { kind: 'file', locator: '/elsewhere/labels.js' },
    });

    const stored = await memory.store.getFact({ namespace: TEST_NAMESPACE, factId: fact.fact_id });
    expect(stored.ok && stored.value?.sources[0]).toMatchObject({
      locator: '/elsewhere/labels.js',
      version: null,
    });
  });

  it('records a fact with no LLM call', async () => {
    const memory = createMemory();

    const fact = await memory.record(deploysTo('Fly.io'));

    expect(fact).toMatchObject({ statement: 'shop-api is deployed to Fly.io.', outcome: 'recorded' });
  });

  it('records a fact whose object is an entity', async () => {
    const memory = createMemory();

    const fact = await memory.record({
      subject: SHOP,
      predicate: 'uses_test_framework',
      object: { type: 'dependency', name: 'Vitest' },
      statement: 'shop-api runs its tests with Vitest.',
    });

    const stored = await memory.store.getFact({ namespace: TEST_NAMESPACE, factId: fact.fact_id });
    expect(stored.ok && stored.value?.objectEntity?.name).toBe('Vitest');
  });

  it('accepts calendar dates for the valid period', async () => {
    const memory = createMemory();

    const fact = await memory.record(
      deploysTo('Heroku', { valid_from: '2025-01-01', valid_to: '2026-02-01' }),
    );

    expect([fact.valid_from, fact.valid_to]).toEqual([
      '2025-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
    ]);
  });

  it('returns invalid_input naming the field for a date it cannot read', async () => {
    const memory = createMemory();

    const text = await memory.errorText(deploysTo('Fly.io', { valid_from: 'last week' }));

    expect(text).toMatch(/^invalid_input: valid_from: /);
  });

  it('uses confidence 1 when none is given', async () => {
    const memory = createMemory();

    const fact = await memory.record(deploysTo('Fly.io'));

    const stored = await memory.store.getFact({ namespace: TEST_NAMESPACE, factId: fact.fact_id });
    expect(stored.ok && stored.value?.fact.confidence).toBe(1);
  });

  it('returns the outcome restated for a fact that is already live', async () => {
    const memory = createMemory();
    const first = await memory.record(deploysTo('Fly.io'));

    const second = await memory.record(deploysTo('Fly.io'), '2026-03-11');

    expect([second.fact_id, second.outcome]).toEqual([first.fact_id, 'restated']);
  });

  it('returns conflict with the stored fact for a second value of a single-valued predicate', async () => {
    const memory = createMemory();
    const first = await memory.record(deploysTo('Fly.io'));

    const text = await memory.errorText(deploysTo('Render'), '2026-03-11');

    expect(text).toMatch(/^conflict: /);
    expect(text).toContain(`Related facts: ${first.fact_id}.`);
  });

  it('lists the allowed predicates for an unknown predicate', async () => {
    const memory = createMemory();

    const text = await memory.errorText({ ...deploysTo('Fly.io'), predicate: 'runs_on' });

    expect(text).toMatch(/^invalid_input: /);
    for (const predicate of softwareDevelopmentDomain.predicates) expect(text).toContain(predicate.name);
  });

  it('lists the allowed entity types for an unknown entity type', async () => {
    const memory = createMemory();

    const text = await memory.errorText({
      ...deploysTo('Fly.io'),
      subject: { type: 'service', name: 'shop-api' },
    });

    expect(text).toMatch(/^invalid_input: /);
    for (const type of softwareDevelopmentDomain.entityTypes) expect(text).toContain(type);
  });
});
