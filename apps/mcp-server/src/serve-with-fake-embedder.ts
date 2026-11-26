// A test entry: the server of main.ts with the fake embedder of core in place of the local
// model, so that tests over stdio need no model and no network. Never reached from main.ts.
// It reads the same configuration and differs from main.ts only in the embedder it builds, and
// in running only the commands a person runs besides the server: not maintenance.
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { createFakeEmbedder, ok, toTimestamp } from '@factloom/core';
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { openSqliteMemoryStore } from '@factloom/storage';
import {
  createAnthropicLlmClient,
  createAnthropicMessageSender,
  DEFAULT_LLM_MODELS,
} from './create-anthropic-llm-client.ts';
import { buildServerDeps } from './build-server-deps.ts';
import type { Logger } from './create-factloom-server.ts';
import { FACTLOOM_TOOLS } from './factloom-tools.ts';
import { readCommand } from './read-command.ts';
import { readConfiguration } from './read-configuration.ts';
import { runPersonCommand } from './run-person-command.ts';
import { serveFactloom } from './serve-factloom.ts';

const log: Logger = (message) => {
  process.stderr.write(`factloom (fake embedder): ${message}\n`);
};

const command = readCommand(process.argv.slice(2));
const configuration = readConfiguration(process.env, {
  homeDirectory: homedir(),
  workingDirectory: process.cwd(),
});
if (!configuration.ok) {
  log(configuration.error.message);
  process.exit(1);
}
const { databasePath, namespace, anthropicApiKey } = configuration.value;

mkdirSync(dirname(databasePath), { recursive: true });
const embedder = createFakeEmbedder();
const opened = openSqliteMemoryStore({
  path: databasePath,
  embeddingModel: embedder.model,
  embeddingDimensions: embedder.dimensions,
});
if (!opened.ok) {
  log(`${opened.error.code}: ${opened.error.message}`);
  process.exit(1);
}

// For the usage timing of FL-055 only: with FACTLOOM_TIMING_USAGE=off, recall records no usage.
const store =
  process.env.FACTLOOM_TIMING_USAGE === 'off'
    ? { ...opened.value, recordFactUsage: () => Promise.resolve(ok(null)) }
    : opened.value;

if (command.kind === 'maintenance') {
  log('This test entry does not run maintenance.');
  process.exit(1);
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

serveFactloom(
  buildServerDeps({
    store,
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
