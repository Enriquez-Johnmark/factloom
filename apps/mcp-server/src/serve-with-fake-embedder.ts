// A test entry: the server of main.ts with the fake embedder of core in place of the local
// model, so that tests over stdio need no model and no network. Never reached from main.ts.
// It reads the same configuration and differs from main.ts only in the embedder it builds.
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { createFakeEmbedder, toTimestamp } from '@factloom/core';
import { openSqliteMemoryStore } from '@factloom/storage';
import type { Logger } from './create-factloom-server.ts';
import { readConfiguration } from './read-configuration.ts';
import { registerRecallTool } from './recall-tool.ts';
import { serveFactloom } from './serve-factloom.ts';

const log: Logger = (message) => {
  process.stderr.write(`factloom (fake embedder): ${message}\n`);
};

const configuration = readConfiguration(process.env, homedir());
if (!configuration.ok) {
  log(configuration.error.message);
  process.exit(1);
}
const { databasePath, namespace } = configuration.value;

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

serveFactloom(
  {
    store: opened.value,
    embedder,
    namespace,
    now: () => toTimestamp(new Date()),
    newId: () => randomUUID(),
    log,
  },
  [registerRecallTool],
);
