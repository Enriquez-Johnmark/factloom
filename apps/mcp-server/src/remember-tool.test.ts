import {
  createInMemoryStore,
  createScriptedLlm,
  err,
  type LlmClient,
  type MemoryStore,
} from '@factloom/core';
import type { Client } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAnthropicLlmClient, DEFAULT_LLM_MODELS } from './create-anthropic-llm-client.ts';
import { registerRememberTool } from './remember-tool.ts';
import { connectInProcess, TEST_NAMESPACE } from './testing/connect-in-process.ts';

const RememberResultSchema = z.object({
  facts: z.array(
    z.object({
      fact_id: z.string(),
      statement: z.string(),
      valid_from: z.string().nullable(),
      valid_to: z.string().nullable(),
      outcome: z.enum(['recorded', 'restated']),
    }),
  ),
  skipped: z.array(
    z.object({ statement: z.string(), reason: z.string(), conflicting_fact_ids: z.array(z.string()) }),
  ),
});

/** A fact as the extraction model returns it, about shop-api's deployment target. */
function deploysTo(target: string, validFrom: string | null = null) {
  return {
    subject: { type: 'repository', name: 'shop-api' },
    predicate: 'deploys_to',
    object: { value: target },
    statement: `shop-api is deployed to ${target}.`,
    confidence: 0.9,
    valid_from: validFrom,
    valid_to: null,
  };
}

const clients: Client[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
});

/** One memory that several calls share. Each call connects with its own LLM and day. */
function createMemory() {
  const store: MemoryStore = createInMemoryStore();
  let count = 0;
  const newId = () => {
    count += 1;
    return `id-${count}`;
  };
  const connect = async (llm: LlmClient, now = '2026-03-10') => {
    const client = await connectInProcess({ tools: [registerRememberTool], store, newId, now, llm });
    clients.push(client);
    return client;
  };
  const rememberWith = async (facts: readonly unknown[], args: Record<string, unknown>, now?: string) => {
    const client = await connect(createScriptedLlm([{ facts }]), now);
    const result = await client.callTool({ name: 'remember', arguments: args });
    if (result.isError === true) throw new Error(JSON.stringify(result.content));
    return RememberResultSchema.parse(result.structuredContent);
  };
  return { store, connect, rememberWith };
}

async function errorText(client: Client, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name: 'remember', arguments: args });
  expect(result.isError).toBe(true);
  const [first] = z.array(z.object({ text: z.string() })).parse(result.content);
  return first?.text ?? '';
}

describe('the remember tool', () => {
  it('records the extracted facts and returns them with their valid time', async () => {
    const memory = createMemory();

    const result = await memory.rememberWith([deploysTo('Fly.io', '2026-02-03')], {
      text: 'Since 3 February 2026, shop-api has been deployed to Fly.io.',
    });

    expect(
      result.facts.map(({ statement, valid_from, valid_to, outcome }) => [
        statement,
        valid_from,
        valid_to,
        outcome,
      ]),
    ).toEqual([['shop-api is deployed to Fly.io.', '2026-02-03T00:00:00.000Z', null, 'recorded']]);
    expect(result.skipped).toEqual([]);
  });

  it('returns a restated fact with the outcome restated', async () => {
    const memory = createMemory();
    const first = await memory.rememberWith([deploysTo('Fly.io')], { text: 'shop-api runs on Fly.io.' });

    const second = await memory.rememberWith(
      [deploysTo('Fly.io')],
      { text: 'Still on Fly.io.' },
      '2026-03-11',
    );

    expect(second.facts.map((fact) => [fact.fact_id, fact.outcome])).toEqual([
      [first.facts[0]?.fact_id, 'restated'],
    ]);
  });

  it('returns a conflicting fact as skipped with the facts in the way', async () => {
    const memory = createMemory();
    const first = await memory.rememberWith([deploysTo('Fly.io')], { text: 'shop-api runs on Fly.io.' });

    const second = await memory.rememberWith(
      [deploysTo('Render')],
      { text: 'shop-api runs on Render.' },
      '2026-03-11',
    );

    expect(second.facts).toEqual([]);
    expect(second.skipped).toEqual([
      {
        statement: 'shop-api is deployed to Render.',
        reason: 'conflicts_with_stored_fact',
        conflicting_fact_ids: [first.facts[0]?.fact_id],
      },
    ]);
  });

  it('returns two empty lists when nothing is extracted', async () => {
    const memory = createMemory();

    const result = await memory.rememberWith([], { text: 'Thanks, that worked.' });

    expect(result).toEqual({ facts: [], skipped: [] });
  });

  it('uses a note from the agent as the source when none is given', async () => {
    const memory = createMemory();

    const result = await memory.rememberWith([deploysTo('Fly.io')], { text: 'shop-api runs on Fly.io.' });

    const stored = await memory.store.getFact({
      namespace: TEST_NAMESPACE,
      factId: result.facts[0]?.fact_id ?? '',
    });
    expect(
      stored.ok && stored.value?.sources.map((source) => [source.kind, source.locator, source.version]),
    ).toEqual([['agent_note', null, null]]);
  });

  it('keeps the source it is given', async () => {
    const memory = createMemory();

    const result = await memory.rememberWith([deploysTo('Fly.io')], {
      text: 'shop-api runs on Fly.io.',
      source: { kind: 'file', locator: 'docs/deploy.md', version: 'abc123' },
    });

    const stored = await memory.store.getFact({
      namespace: TEST_NAMESPACE,
      factId: result.facts[0]?.fact_id ?? '',
    });
    expect(
      stored.ok && stored.value?.sources.map((source) => [source.kind, source.locator, source.version]),
    ).toEqual([['file', 'docs/deploy.md', 'abc123']]);
  });

  it('says that record_fact needs no LLM when extraction fails', async () => {
    const memory = createMemory();
    const client = await memory.connect({
      generateObject: () => Promise.resolve(err('llm_failed', 'Overloaded.')),
    });

    const text = await errorText(client, { text: 'shop-api runs on Fly.io.' });

    expect(text).toBe('llm_failed: Overloaded. record_fact records a fact with no LLM call.');
  });

  it('returns llm_failed when no API key is configured', async () => {
    const memory = createMemory();
    const llm = createAnthropicLlmClient({
      apiKey: null,
      models: DEFAULT_LLM_MODELS,
      logUsage: () => {},
      sendMessage: () => {
        throw new Error('A request was sent with no key.');
      },
    });
    const client = await memory.connect(llm);

    const text = await errorText(client, { text: 'shop-api runs on Fly.io.' });

    expect(text).toMatch(/^llm_failed: No Anthropic API key is configured/);
    expect(text).toContain('record_fact records a fact with no LLM call.');
  });
});
