// A test entry: the server of main.ts with the fake embedder of core in place of the local
// model, so that tests over stdio need no model and no network. Never reached from main.ts.
// It reads the same configuration and differs from main.ts only in the embedder it builds, and
// in running only the commands a person runs and the recall hook besides the server: not maintenance.
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createFakeEmbedder, ok, toTimestamp } from '@kronomind/core';
import { openSqliteMemoryStore } from '@kronomind/storage';
import {
  createAnthropicLlmClient,
  createAnthropicMessageSender,
  DEFAULT_LLM_MODELS,
} from './create-anthropic-llm-client.ts';
import { buildServerDeps } from './build-server-deps.ts';
import type { Logger } from './create-kronomind-server.ts';
import { KRONOMIND_TOOLS } from './kronomind-tools.ts';
import { readCommand } from './read-command.ts';
import { readConfiguration } from './read-configuration.ts';
import { runHealthcareDemo } from './run-healthcare-demo.ts';
import { runPersonCommand } from './run-person-command.ts';
import { readStandardInput, runRecallHook } from './run-recall-hook.ts';
import { serveKronomind } from './serve-kronomind.ts';

const log: Logger = (message) => {
  process.stderr.write(`kronomind (fake embedder): ${message}\n`);
};

const command = readCommand(process.argv.slice(2));
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
if (!configuration.ok) {
  log(configuration.error.message);
  process.exit(1);
}
const { databasePath, namespace, domain, anthropicApiKey } = configuration.value;

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

// For the usage timing of FL-055 only: with KRONOMIND_TIMING_USAGE=off, recall records no usage.
const store =
  process.env.KRONOMIND_TIMING_USAGE === 'off'
    ? { ...opened.value, recordFactUsage: () => Promise.resolve(ok(null)) }
    : opened.value;

if (command.kind === 'maintenance') {
  log('This test entry does not run maintenance.');
  process.exit(1);
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

serveKronomind(
  buildServerDeps({
    store,
    embedder,
    domain,
    llm,
    namespace,
    now: () => toTimestamp(new Date()),
    newId: () => randomUUID(),
    log,
  }),
  KRONOMIND_TOOLS,
);
