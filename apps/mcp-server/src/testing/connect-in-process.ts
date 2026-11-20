import { type ConflictJudge, createTestDeps, type LlmClient, type MemoryStore } from '@factloom/core';
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createFactloomServer, type RegisterTool } from '../create-factloom-server.ts';

export const TEST_NAMESPACE = 'repo:shop-api';

/** An LLM client that fails the test if it is called. */
export const UNREACHABLE_LLM: LlmClient = {
  generateObject() {
    throw new Error('The LLM was called.');
  },
};

/**
 * Connects a client in process to a server with the given tools, on the software
 * development domain and the given memory, clock and LLM. The caller closes the client.
 */
export async function connectInProcess(options: {
  readonly tools: readonly RegisterTool[];
  readonly store: MemoryStore;
  readonly newId: () => string;
  readonly now: string;
  readonly llm: LlmClient;
  readonly judge?: ConflictJudge;
}): Promise<Client> {
  const deps = createTestDeps({ now: options.now, store: options.store, newId: options.newId });
  const server = createFactloomServer(
    {
      store: options.store,
      embedder: deps.embedder,
      domain: softwareDevelopmentDomain,
      llm: options.llm,
      ...(options.judge === undefined ? {} : { judge: options.judge }),
      namespace: TEST_NAMESPACE,
      now: deps.now,
      newId: options.newId,
      log: () => {},
    },
    options.tools,
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientSide);
  return client;
}
