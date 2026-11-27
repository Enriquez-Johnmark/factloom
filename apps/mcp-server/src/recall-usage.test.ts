// The usage that the recall tool records after it answers (FL-055).
import { err, type MemoryStore } from '@kronomind/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { KRONOMIND_TOOLS } from './kronomind-tools.ts';
import { connectInProcess, TEST_NAMESPACE, UNREACHABLE_LLM } from './testing/connect-in-process.ts';
import { createToolSession } from './testing/tool-session.ts';

const RecordedSchema = z.object({ fact: z.object({ fact_id: z.string() }) });
const RecalledSchema = z.object({ facts: z.array(z.object({ fact_id: z.string() })) });
const QUESTION = { question: 'Where is shop-api deployed?' };

let session = createToolSession();
afterEach(async () => {
  await session.close();
  session = createToolSession();
});

async function recordFlyIo(): Promise<string> {
  return RecordedSchema.parse(
    await session.succeed('2026-03-10', 'record_fact', {
      subject: { type: 'repository', name: 'shop-api' },
      predicate: 'deploys_to',
      object: { value: 'Fly.io' },
      statement: 'shop-api is deployed to Fly.io.',
    }),
  ).fact.fact_id;
}

describe('usage recorded by the recall tool', () => {
  it('records each returned fact with a count of 1 and the time of the call, then 2 after a second call', async () => {
    const factId = await recordFlyIo();

    const first = RecalledSchema.parse(await session.succeed('2026-03-11', 'recall', QUESTION));
    expect(first.facts.map((fact) => fact.fact_id)).toContain(factId);
    expect(await session.store.getFactUsage({ namespace: TEST_NAMESPACE, factId })).toEqual({
      ok: true,
      value: { factId, lastRecalledAt: '2026-03-11T00:00:00.000Z', recallCount: 1 },
    });

    await session.succeed('2026-03-12', 'recall', QUESTION);
    expect(await session.store.getFactUsage({ namespace: TEST_NAMESPACE, factId })).toEqual({
      ok: true,
      value: { factId, lastRecalledAt: '2026-03-12T00:00:00.000Z', recallCount: 2 },
    });
  });

  it('returns the recall result unchanged when the usage write fails', async () => {
    const factId = await recordFlyIo();
    const expected = await session.succeed('2026-03-11', 'recall', QUESTION);
    const failing: MemoryStore = {
      ...session.store,
      recordFactUsage: () => Promise.resolve(err('storage_failed', 'The disk is full.')),
    };
    const client = await connectInProcess({
      tools: KRONOMIND_TOOLS,
      store: failing,
      newId: () => 'unused',
      now: '2026-03-11',
      llm: UNREACHABLE_LLM,
    });

    const result = await client.callTool({ name: 'recall', arguments: QUESTION });
    await client.close();

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(expected);
    expect(RecalledSchema.parse(result.structuredContent).facts.map((fact) => fact.fact_id)).toContain(
      factId,
    );
  });

  it('records no usage for get_fact_history', async () => {
    const factId = await recordFlyIo();

    await session.succeed('2026-03-11', 'get_fact_history', { fact_id: factId });

    expect(await session.store.getFactUsage({ namespace: TEST_NAMESPACE, factId })).toEqual({
      ok: true,
      value: null,
    });
  });
});
