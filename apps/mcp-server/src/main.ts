// The composition root of the MCP server: the one place that reads the environment and names
// the concrete implementations. Standard output belongs to the protocol, so everything a
// person should read goes to standard error. With the argument `purge` or `proposals`, it runs
// a command a person runs instead, which is not an MCP server (FL-072, FL-070).
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { toTimestamp } from '@kronomind/core';
import { runMaintenance } from '@kronomind/maintenance';
import { openSqliteMemoryStore } from '@kronomind/storage';
import {
  createAnthropicLlmClient,
  createAnthropicMessageSender,
  DEFAULT_LLM_MODELS,
} from './create-anthropic-llm-client.ts';
import { buildServerDeps } from './build-server-deps.ts';
import type { Logger } from './create-kronomind-server.ts';
import { KRONOMIND_TOOLS } from './kronomind-tools.ts';
import { createFileSourceAnchorer } from './anchor-file-source.ts';
import { createGitRepositoryReader } from './create-git-repository-reader.ts';
import { createLocalEmbedder } from './create-local-embedder.ts';
import { buildMaintenanceJobs } from './maintenance-jobs.ts';
import { readCommand } from './read-command.ts';
import { readConfiguration } from './read-configuration.ts';
import { runHealthcareDemo } from './run-healthcare-demo.ts';
import { runPersonCommand } from './run-person-command.ts';
import { readStandardInput, runRecallHook } from './run-recall-hook.ts';
import { serveKronomind } from './serve-kronomind.ts';

const log: Logger = (message) => {
  process.stderr.write(`kronomind: ${message}\n`);
};

/** Says why the server cannot start, and stops it. */
function stop(message: string): never {
  log(message);
  process.exit(1);
}

const command = readCommand(process.argv.slice(2));
// The demo reads no configuration and opens no database but its own, in a directory it removes.
if (command.kind === 'demo_healthcare') {
  const directory = mkdtempSync(join(tmpdir(), 'kronomind-demo-'));
  const exitCode = await runHealthcareDemo({ directory, write: (line) => process.stdout.write(`${line}\n`) });
  rmSync(directory, { recursive: true, force: true });
  process.exit(exitCode);
}
const configuration = readConfiguration(process.env, {
  homeDirectory: homedir(),
  workingDirectory: process.cwd(),
});
if (!configuration.ok) stop(configuration.error.message);
const {
  databasePath,
  namespace,
  domain,
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
      domain,
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

if (command.kind === 'recall_hook') {
  const exitCode = await runRecallHook(
    { store: opened.value, embedder, namespace, now: () => toTimestamp(new Date()), log },
    { standardInput: await readStandardInput(), write: (text) => process.stdout.write(text) },
  );
  await opened.value.close();
  process.exit(exitCode);
}
if (command.kind !== 'serve') {
  const exitCode = await runPersonCommand(
    {
      store: opened.value,
      embedder,
      domain,
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

// The use cases receive the conflict judge (FL-042) and the feedback responder (FL-060). A file
// source is anchored at the HEAD of the repository maintenance reads (FL-082).
const repository = createGitRepositoryReader(repositoryDirectory);
serveKronomind(
  buildServerDeps({
    store: opened.value,
    embedder,
    domain,
    llm,
    anchorFileSource: createFileSourceAnchorer(repositoryDirectory, repository.readHead),
    namespace,
    now: () => toTimestamp(new Date()),
    newId: () => randomUUID(),
    log,
  }),
  KRONOMIND_TOOLS,
);
