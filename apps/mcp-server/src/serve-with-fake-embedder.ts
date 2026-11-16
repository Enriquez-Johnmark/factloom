// A test entry: the server of main.ts with the fake embedder of core in place of the local
// model, so that tests over stdio need no model and no network. Never reached from main.ts.
// It reads the same configuration and differs from main.ts only in the embedder it builds.
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { createFakeEmbedder, toTimestamp } from '@factloom/core';
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { openSqliteMemoryStore } from '@factloom/storage';
import {
  createAnthropicLlmClient,
  createAnthropicMessageSender,
  DEFAULT_LLM_MODELS,
} from './create-anthropic-llm-client.ts';
import type { Logger } from './create-factloom-server.ts';
import { FACTLOOM_TOOLS } from './factloom-tools.ts';
import { readConfiguration } from './read-configuration.ts';
import { serveFactloom } from './serve-factloom.ts';

const log: Logger = (message) => {
  process.stderr.write(`factloom (fake embedder): ${message}\n`);
};

const configuration = readConfiguration(process.env, homedir());
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
  {
    store: opened.value,
    embedder,
    domain: softwareDevelopmentDomain,
    llm,
    namespace,
    now: () => toTimestamp(new Date()),
    newId: () => randomUUID(),
    log,
  },
  FACTLOOM_TOOLS,
);
