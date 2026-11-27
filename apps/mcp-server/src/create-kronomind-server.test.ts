import { createTestDeps } from '@kronomind/core';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { softwareDevelopmentDomain } from '@kronomind/graph-rag';
import { describe, expect, it } from 'vitest';
import { createKronomindServer, type ServerDeps } from './create-kronomind-server.ts';
import { SERVER_INSTRUCTIONS } from './server-instructions.ts';

function createFakeDeps(): ServerDeps {
  const deps = createTestDeps();
  return {
    store: deps.store,
    embedder: deps.embedder,
    domain: softwareDevelopmentDomain,
    llm: deps.llm,
    namespace: 'repo:shop-api',
    now: deps.now,
    newId: deps.newId,
    log: () => {},
  };
}

describe('createKronomindServer', () => {
  it('the instructions fit the limit', () => {
    expect(SERVER_INSTRUCTIONS.length).toBeGreaterThan(0);
    expect(SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(1000);
  });

  it('gives its instructions when a client connects', async () => {
    const server = createKronomindServer(createFakeDeps(), []);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'test-client', version: '0.0.0' });

    await client.connect(clientSide);

    expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
    expect(client.getServerVersion()?.name).toBe('kronomind');
    await client.close();
    await server.close();
  });

  it('registers each tool it is given', async () => {
    const registered: string[] = [];
    createKronomindServer(createFakeDeps(), [
      (_server, deps) => registered.push(`first in ${deps.namespace}`),
      () => registered.push('second'),
    ]);

    expect(registered).toEqual(['first in repo:shop-api', 'second']);
  });
});
