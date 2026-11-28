import {
  type ConflictJudge,
  createTestDeps,
  type Domain,
  type LlmClient,
  type MemoryStore,
} from '@kronomind/core';
import { softwareDevelopmentDomain } from '@kronomind/graph-rag';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import type { FileSourceAnchorer } from '../anchor-file-source.ts';
import { createKronomindServer, type RegisterTool } from '../create-kronomind-server.ts';

export const TEST_NAMESPACE = 'repo:shop-api';

/** An LLM client that fails the test if it is called. */
export const UNREACHABLE_LLM: LlmClient = {
  generateObject() {
    throw new Error('The LLM was called.');
  },
};

/**
 * Connects a client in process to a server with the given tools, on the given domain or the
 * software development domain, and the given memory, clock and LLM. The caller closes the client.
 */
export async function connectInProcess(options: {
  readonly tools: readonly RegisterTool[];
  readonly store: MemoryStore;
  readonly newId: () => string;
  readonly now: string;
  readonly llm: LlmClient;
  readonly judge?: ConflictJudge;
  readonly anchorFileSource?: FileSourceAnchorer;
  readonly domain?: Domain;
}): Promise<Client> {
  const deps = createTestDeps({ now: options.now, store: options.store, newId: options.newId });
  const server = createKronomindServer(
    {
      store: options.store,
      embedder: deps.embedder,
      domain: options.domain ?? softwareDevelopmentDomain,
      llm: options.llm,
      ...(options.judge === undefined ? {} : { judge: options.judge }),
      ...(options.anchorFileSource === undefined ? {} : { anchorFileSource: options.anchorFileSource }),
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
