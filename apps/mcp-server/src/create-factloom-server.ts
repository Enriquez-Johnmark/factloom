import type {
  ConflictJudge,
  Domain,
  Embedder,
  FeedbackResponder,
  LlmClient,
  MemoryStore,
  Namespace,
  Timestamp,
} from '@factloom/core';
import { McpServer } from '@modelcontextprotocol/server';
import type { FileSourceAnchorer } from './anchor-file-source.ts';
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
  /** Used only by `remember`: the repository the memory is about, the subject of "we" (FL-078). */
  readonly repositoryName?: string;
  /** Used only by `remember`, to decide whether a stored fact gives way to a new one (FL-042). */
  readonly judge?: ConflictJudge;
  /** Used only by `giveFeedback`, to act on feedback once it is recorded (FL-060). */
  readonly feedbackResponder?: FeedbackResponder;
  /** Used by `record_fact` and `remember`: gives a file source with no commit the repository's HEAD (FL-082). */
  readonly anchorFileSource?: FileSourceAnchorer;
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
