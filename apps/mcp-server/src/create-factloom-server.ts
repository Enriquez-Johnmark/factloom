import type { Domain, Embedder, LlmClient, MemoryStore, Namespace, Timestamp } from '@factloom/core';
import { McpServer } from '@modelcontextprotocol/server';
import { SERVER_INSTRUCTIONS } from './server-instructions.ts';

/** Writes one line for a person to read. The server's only way of logging: it goes to standard error. */
export type Logger = (message: string) => void;

/** What the tools of the server are built from. Only the composition root names the implementations. */
export type ServerDeps = {
  readonly store: MemoryStore;
  readonly embedder: Embedder;
  /** The domain the server's memory is about: its entity types and predicates. */
  readonly domain: Domain;
  /** Used only by `remember`, to extract facts from text. */
  readonly llm: LlmClient;
  readonly namespace: Namespace;
  readonly now: () => Timestamp;
  readonly newId: () => string;
  readonly log: Logger;
};

/** Adds one tool to a server. Each tool item adds one to the list the server is created with. */
export type RegisterTool = (server: McpServer, deps: ServerDeps) => void;

const SERVER_INFO = { name: 'factloom', version: '0.0.0' } as const;

/**
 * Creates the Factloom MCP server: its name, its instructions and the given tools, built
 * from the given dependencies. It opens nothing and loads nothing, so it answers the
 * initialise request at once.
 */
export function createFactloomServer(deps: ServerDeps, tools: readonly RegisterTool[]): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });
  for (const register of tools) register(server, deps);
  return server;
}
