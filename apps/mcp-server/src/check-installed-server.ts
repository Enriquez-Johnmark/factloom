// The check of the clean-install job (FL-003): starts the server installed from the packed
// archives, over stdio as a host does, with the real embedding model and no API key. It lists
// the tools, records one fact and recalls it. Exits non-zero if anything differs.
//
//   node apps/mcp-server/src/check-installed-server.ts <install directory>
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { runServerRequests } from './testing/server-process.ts';

/** The tools of MCP-TOOLS.md, in the order the server lists them. */
const EXPECTED_TOOLS = [
  'recall',
  'remember',
  'record_fact',
  'invalidate_fact',
  'get_fact_history',
  'give_feedback',
];

/** The first start downloads the embedding model, so a request may take minutes. */
const REQUEST_TIMEOUT = 600_000;

const ToolErrorSchema = z.object({
  isError: z.literal(true),
  content: z.array(z.object({ text: z.string() })),
});

/** Parses a tool's answer, or throws with the text of its error result. */
function parseAnswer<Output>(schema: z.ZodType<Output>, answer: unknown, tool: string): Output {
  const failed = ToolErrorSchema.safeParse(answer);
  if (failed.success)
    throw new Error(`${tool} failed: ${failed.data.content.map((part) => part.text).join(' ')}`);
  return schema.parse(answer);
}

const ToolListSchema = z.object({ tools: z.array(z.object({ name: z.string() })) });
const RecordedSchema = z.object({
  structuredContent: z.object({ fact: z.object({ fact_id: z.string(), outcome: z.literal('recorded') }) }),
});
const RecalledSchema = z.object({
  structuredContent: z.object({ facts: z.array(z.object({ fact_id: z.string(), statement: z.string() })) }),
});

/**
 * The proxy settings of this process, passed on so that the check also runs on a machine
 * whose network goes through a proxy. GitHub's hosted runners set none of them.
 */
const PROXY_VARIABLES = [
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'NODE_USE_ENV_PROXY',
];
const proxyVariables = Object.fromEntries(
  PROXY_VARIABLES.flatMap((name) => {
    const value = process.env[name];
    return value === undefined ? [] : [[name, value]];
  }),
);

const installDirectory = process.argv[2];
if (installDirectory === undefined) {
  console.error('Usage: node check-installed-server.ts <install directory>');
  process.exit(2);
}
const entry = join(installDirectory, 'node_modules', '@factloom', 'mcp-server', 'dist', 'main.js');
// The server's home and database live outside the install, so the install stays as installed.
const home = mkdtempSync(join(tmpdir(), 'factloom-installed-'));
try {
  const session = await runServerRequests({
    entry,
    variables: {
      ...proxyVariables,
      FACTLOOM_DB: join(home, 'factloom.db'),
      FACTLOOM_NAMESPACE: 'repo:clean-install',
    },
    home,
    requests: [
      { method: 'tools/list', params: {} },
      {
        method: 'tools/call',
        params: {
          name: 'record_fact',
          arguments: {
            subject: { type: 'repository', name: 'shop-api' },
            predicate: 'deploys_to',
            object: { value: 'Fly.io' },
            statement: 'shop-api is deployed to Fly.io.',
          },
        },
      },
      {
        method: 'tools/call',
        params: { name: 'recall', arguments: { question: 'Where is shop-api deployed?' } },
      },
    ],
    timeout: REQUEST_TIMEOUT,
  });
  const [listed, recorded, recalled] = session.answers;
  const tools = ToolListSchema.parse(listed).tools.map((tool) => tool.name);
  console.log(`Tools: ${tools.join(', ')}`);
  if (JSON.stringify(tools) !== JSON.stringify(EXPECTED_TOOLS)) {
    throw new Error(`Expected the tools ${EXPECTED_TOOLS.join(', ')}.`);
  }
  const factId = parseAnswer(RecordedSchema, recorded, 'record_fact').structuredContent.fact.fact_id;
  const found = parseAnswer(RecalledSchema, recalled, 'recall').structuredContent.facts.find(
    (fact) => fact.fact_id === factId,
  );
  if (found === undefined) throw new Error(`recall did not return the recorded fact ${factId}.`);
  console.log(`Recalled: ${found.fact_id}: ${found.statement}`);
  console.log(`Answer times in ms: ${session.answeredAt.join(', ')}`);
  if (session.code !== 0) throw new Error(`The server exited with code ${session.code}.`);
  console.log('The installed server passed.');
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
} finally {
  rmSync(home, { recursive: true, force: true });
}
