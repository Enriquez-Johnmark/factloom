// The composition root of the MCP server: the one place that reads the environment and names
// the concrete implementations. Standard output belongs to the protocol, so everything a
// person should read goes to standard error.
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { toTimestamp } from '@factloom/core';
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { openSqliteMemoryStore } from '@factloom/storage';
import {
  createAnthropicLlmClient,
  createAnthropicMessageSender,
  DEFAULT_LLM_MODELS,
} from './create-anthropic-llm-client.ts';
import type { Logger } from './create-factloom-server.ts';
import { FACTLOOM_TOOLS } from './factloom-tools.ts';
import { createLocalEmbedder } from './create-local-embedder.ts';
import { readConfiguration } from './read-configuration.ts';
import { serveFactloom } from './serve-factloom.ts';

const log: Logger = (message) => {
  process.stderr.write(`factloom: ${message}\n`);
};

/** Says why the server cannot start, and stops it. */
function stop(message: string): never {
  log(message);
  process.exit(1);
}

const configuration = readConfiguration(process.env, homedir());
if (!configuration.ok) stop(configuration.error.message);
const { databasePath, namespace, modelCacheDirectory, anthropicApiKey } = configuration.value;

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
