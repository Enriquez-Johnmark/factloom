// The composition root of the MCP server: the one place that reads the environment and names
// the concrete implementations. Standard output belongs to the protocol, so everything a
// person should read goes to standard error. With the argument `purge` or `proposals`, it runs
// a command a person runs instead, which is not an MCP server (FL-072, FL-070).
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { toTimestamp } from '@factloom/core';
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { runMaintenance } from '@factloom/maintenance';
import { openSqliteMemoryStore } from '@factloom/storage';
import {
  createAnthropicLlmClient,
  createAnthropicMessageSender,
  DEFAULT_LLM_MODELS,
} from './create-anthropic-llm-client.ts';
import { buildServerDeps } from './build-server-deps.ts';
import type { Logger } from './create-factloom-server.ts';
import { FACTLOOM_TOOLS } from './factloom-tools.ts';
import { createGitRepositoryReader } from './create-git-repository-reader.ts';
import { createLocalEmbedder } from './create-local-embedder.ts';
import { buildMaintenanceJobs } from './maintenance-jobs.ts';
import { readCommand } from './read-command.ts';
import { readConfiguration } from './read-configuration.ts';
import { runPersonCommand } from './run-person-command.ts';
import { serveFactloom } from './serve-factloom.ts';

const log: Logger = (message) => {
  process.stderr.write(`factloom: ${message}\n`);
};

/** Says why the server cannot start, and stops it. */
function stop(message: string): never {
  log(message);
  process.exit(1);
}

const command = readCommand(process.argv.slice(2));
const configuration = readConfiguration(process.env, {
  homeDirectory: homedir(),
  workingDirectory: process.cwd(),
});
if (!configuration.ok) stop(configuration.error.message);
const {
  databasePath,
  namespace,
  modelCacheDirectory,
  anthropicApiKey,
  repositoryDirectory,
  archiveAfterDays,
} = configuration.value;

mkdirSync(dirname(databasePath), { recursive: true });
// The model is loaded on the first embedding, not here, so the server answers the host at once.
const embedder = createLocalEmbedder({ cacheDirectory: modelCacheDirectory, allowDownload: true });
const opened = openSqliteMemoryStore({
  path: databasePath,
  embeddingModel: embedder.model,
  embeddingDimensions: embedder.dimensions,
});
if (!opened.ok) stop(`${opened.error.code}: ${opened.error.message}`);

// The key goes to the Anthropic client and nowhere else. A call's usage is logged without it.
const llm = createAnthropicLlmClient({
  apiKey: anthropicApiKey,
  models: DEFAULT_LLM_MODELS,
  logUsage: (report) =>
    log(
      `${report.task} on ${report.model}: ${report.inputTokens} input tokens, ${report.outputTokens} output tokens, stop reason ${report.stopReason ?? 'none'}.`,
    ),
  sendMessage: createAnthropicMessageSender(),
});

if (command.kind === 'maintenance') {
  // A run is not an MCP server: the report is the one JSON document on standard output.
  const now = () => toTimestamp(new Date());
  const report = await runMaintenance(
    { now },
    buildMaintenanceJobs({
      store: opened.value,
      embedder,
      domain: softwareDevelopmentDomain,
      namespace,
      now,
      newId: () => randomUUID(),
      repository: createGitRepositoryReader(repositoryDirectory),
      archiveAfterDays,
      // With no key the LLM rung is skipped, and the facts it would ask about stay inconclusive.
      llm: anthropicApiKey === null ? null : llm,
    }),
  );
  await opened.value.close();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(report.jobs.some((job) => job.status === 'failed') ? 1 : 0);
}

if (command.kind !== 'serve') {
  const exitCode = await runPersonCommand(
    {
      store: opened.value,
      embedder,
      domain: softwareDevelopmentDomain,
      namespace,
      now: () => toTimestamp(new Date()),
      newId: () => randomUUID(),
      databasePath,
      write: (line) => process.stdout.write(`${line}\n`),
    },
    command,
  );
  process.exit(exitCode);
}

// The use cases receive the conflict judge (FL-042) and the feedback responder (FL-060).
serveFactloom(
  buildServerDeps({
    store: opened.value,
    embedder,
    domain: softwareDevelopmentDomain,
    llm,
    namespace,
    now: () => toTimestamp(new Date()),
    newId: () => randomUUID(),
    log,
  }),
  FACTLOOM_TOOLS,
);
