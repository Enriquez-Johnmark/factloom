import { createInMemoryStore, type Domain, type MemoryStore } from '@kronomind/core';
import type { Client } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { KRONOMIND_TOOLS } from '../kronomind-tools.ts';
import { connectInProcess, UNREACHABLE_LLM } from './connect-in-process.ts';

const TextContentSchema = z.array(z.object({ text: z.string() }));

/**
 * One memory, reached through the six tools by a client connected anew for each call, on
 * the day the call names. The LLM fails the test if it is called. `close` closes every client.
 */
export function createToolSession(options: { readonly domain?: Domain } = {}) {
  const store: MemoryStore = createInMemoryStore();
  let count = 0;
  const newId = () => {
    count += 1;
    return `id-${count}`;
  };
  const clients: Client[] = [];
  const call = async (now: string, name: string, args: Record<string, unknown>) => {
    const client = await connectInProcess({
      tools: KRONOMIND_TOOLS,
      store,
      newId,
      now,
      llm: UNREACHABLE_LLM,
      ...(options.domain === undefined ? {} : { domain: options.domain }),
    });
    clients.push(client);
    return client.callTool({ name, arguments: args });
  };
  return {
    store,
    /** Calls a tool and returns its structured content, failing the test on an error result. */
    async succeed(now: string, name: string, args: Record<string, unknown>): Promise<unknown> {
      const result = await call(now, name, args);
      if (result.isError === true) throw new Error(JSON.stringify(result.content));
      return result.structuredContent;
    },
    /** Calls a tool that must fail, and returns its error text. */
    async fail(now: string, name: string, args: Record<string, unknown>): Promise<string> {
      const result = await call(now, name, args);
      if (result.isError !== true)
        throw new Error(`${name} did not fail: ${JSON.stringify(result.structuredContent)}`);
      const [first] = TextContentSchema.parse(result.content);
      return first?.text ?? '';
    },
    async close() {
      for (const client of clients.splice(0)) await client.close();
    },
  };
}
