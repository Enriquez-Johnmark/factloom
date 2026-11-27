import { createInMemoryStore } from '@kronomind/core';
import { softwareDevelopmentDomain } from '@kronomind/graph-rag';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { KRONOMIND_TOOLS } from './kronomind-tools.ts';
import { connectInProcess, UNREACHABLE_LLM } from './testing/connect-in-process.ts';

async function listTools() {
  const client = await connectInProcess({
    tools: KRONOMIND_TOOLS,
    store: createInMemoryStore(),
    newId: () => 'id',
    now: '2026-03-10',
    llm: UNREACHABLE_LLM,
  });
  const { tools } = await client.listTools();
  await client.close();
  return tools;
}

const PropertiesSchema = z.record(z.string(), z.object({ description: z.string().min(1) }));

describe('the tools of the server', () => {
  it('lists the six tools in order with their annotations', async () => {
    const tools = await listTools();

    // The annotations of MCP-TOOLS.md, "Annotations".
    const writes = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };
    expect(tools.map((tool) => [tool.name, tool.annotations])).toEqual([
      ['recall', { readOnlyHint: true, openWorldHint: false }],
      ['remember', { ...writes, openWorldHint: true }],
      ['record_fact', { ...writes, openWorldHint: false }],
      ['invalidate_fact', { ...writes, openWorldHint: false }],
      ['get_fact_history', { readOnlyHint: true, openWorldHint: false }],
      ['give_feedback', { ...writes, openWorldHint: false }],
    ]);
    for (const tool of tools) {
      expect(tool.outputSchema, tool.name).toBeDefined();
      expect(() => PropertiesSchema.parse(tool.inputSchema.properties), tool.name).not.toThrow();
    }
  });

  it('describes every field of the replacement of invalidate_fact', async () => {
    const tools = await listTools();
    const invalidate = tools.find((tool) => tool.name === 'invalidate_fact');

    const replacement = z
      .object({ properties: PropertiesSchema })
      .parse(z.record(z.string(), z.unknown()).parse(invalidate?.inputSchema.properties).replacement);

    expect(Object.keys(replacement.properties).sort()).toEqual(
      ['confidence', 'object', 'predicate', 'statement', 'subject', 'valid_from', 'valid_to'].sort(),
    );
  });

  it('describes the predicate of record_fact with every predicate of the domain', async () => {
    const tools = await listTools();
    const recordFact = tools.find((tool) => tool.name === 'record_fact');

    const properties = PropertiesSchema.parse(recordFact?.inputSchema.properties);

    for (const predicate of softwareDevelopmentDomain.predicates) {
      expect(properties.predicate?.description).toContain(predicate.name);
    }
  });

  it('offers no tool that approves or rejects a proposal, because an agent must not decide its own', async () => {
    const tools = await listTools();

    expect(tools.map((tool) => tool.name).filter((name) => /approv|reject|propos/u.test(name))).toEqual([]);
  });
});
