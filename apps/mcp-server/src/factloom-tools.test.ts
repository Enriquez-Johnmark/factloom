import { createInMemoryStore } from '@factloom/core';
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FACTLOOM_TOOLS } from './factloom-tools.ts';
import { connectInProcess, UNREACHABLE_LLM } from './testing/connect-in-process.ts';

async function listTools() {
  const client = await connectInProcess({
    tools: FACTLOOM_TOOLS,
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
  it('lists three tools in order with their annotations', async () => {
    const tools = await listTools();

    // The annotations of MCP-TOOLS.md, "Annotations".
    expect(tools.map((tool) => [tool.name, tool.annotations])).toEqual([
      ['recall', { readOnlyHint: true, openWorldHint: false }],
      [
        'remember',
        { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      ],
      [
        'record_fact',
        { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      ],
    ]);
    for (const tool of tools) {
      expect(tool.outputSchema, tool.name).toBeDefined();
      expect(() => PropertiesSchema.parse(tool.inputSchema.properties), tool.name).not.toThrow();
    }
  });

  it('describes the predicate of record_fact with every predicate of the domain', async () => {
    const tools = await listTools();
    const recordFact = tools.find((tool) => tool.name === 'record_fact');

    const properties = PropertiesSchema.parse(recordFact?.inputSchema.properties);

    for (const predicate of softwareDevelopmentDomain.predicates) {
      expect(properties.predicate?.description).toContain(predicate.name);
    }
  });
});
