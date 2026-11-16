import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createFactloomServer, type RegisterTool, type ServerDeps } from './create-factloom-server.ts';

/**
 * Serves the Factloom server over stdio. When standard input closes, the host has gone: the
 * connection is torn down, the store is closed, and the process exits with code 0. Kept apart
 * from `main.ts` so that a test entry can serve the same server with other dependencies.
 */
export function serveFactloom(deps: ServerDeps, tools: readonly RegisterTool[]): void {
  const connection = serveStdio(() => createFactloomServer(deps, tools), {
    onerror: (error) => deps.log(`The MCP connection reported an error: ${error.message}`),
  });
  process.stdin.once('end', () => {
    void (async () => {
      await connection.close();
      await deps.store.close();
      process.exit(0);
    })();
  });
}
