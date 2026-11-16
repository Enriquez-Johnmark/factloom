// The performance benchmark of FL-066: recall, record_fact and server start on namespaces of
// 10,000 and 100,000 facts, against the budgets of REQ-35. Run by hand or by the scheduled
// eval job: it needs the real embedding model and takes minutes. It sits in src, not evals,
// because it builds the local embedder and starts main.ts (the precedent of FL-033).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { cpus, arch, release, tmpdir, type } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { type Embedder, type MemoryStore, parseDateInput, type Timestamp } from '@factloom/core';
import { recall, recordStructuredFacts, remember, softwareDevelopmentDomain } from '@factloom/graph-rag';
import { openSqliteMemoryStore } from '@factloom/storage';
import {
  type BenchmarkRow,
  formatBenchmarkTable,
  judgeRow,
  percentile,
} from '../evals/benchmark/benchmark-budgets.ts';
import { buildSyntheticNamespace } from '../evals/benchmark/build-synthetic-namespace.ts';
import {
  createAnthropicLlmClient,
  createAnthropicMessageSender,
  DEFAULT_LLM_MODELS,
} from './create-anthropic-llm-client.ts';
import { createLocalEmbedder } from './create-local-embedder.ts';
import { INITIALIZE_REQUEST, startServerProcess, waitFor } from './testing/server-process.ts';

/** The one place in the evals that reads the real time: durations, in milliseconds. */
type Clock = () => number;
const clock: Clock = () => performance.now();

const NAMESPACE = 'bench:benchmark';
const SEED = 20261116;
const QUESTIONS = [
  'Which conventions does repo-12 follow?',
  'Who uses squash merges and semantic versioning?',
  'What does the team do about release trains and canary deploys?',
  'Which repositories follow trunk based development?',
  'How are feature flags and rollbacks handled?',
];
const RECALL_REPEATS = 10;
const RECORD_REPEATS = 20;
const SERVER_STARTS = 5;
const REMEMBER_REPEATS = 3;

function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}
const NOW = at('2026-06-01');

/** Identifiers that count up from a prefix, so that new rows never collide with the generator's. */
function countingIds(prefix: string): () => string {
  let count = 0;
  return () => {
    count += 1;
    return `${prefix}-${count}`;
  };
}
const now = () => NOW;

/** An embedder that adds the time spent inside it to a running total, so it can be subtracted. */
function timeEmbedder(inner: Embedder, timeClock: Clock) {
  const spent = { total: 0 };
  const embedder: Embedder = {
    model: inner.model,
    dimensions: inner.dimensions,
    async embed(texts, purpose) {
      const start = timeClock();
      const result = await inner.embed(texts, purpose);
      spent.total += timeClock() - start;
      return result;
    },
  };
  return { embedder, spent };
}

/** Durations of `recall`, after one warm-up call, over every question a fixed number of times. */
async function measureRecall(store: MemoryStore, embedder: Embedder, timeClock: Clock): Promise<number[]> {
  const ask = async (question: string) => {
    const result = await recall(
      { store, embedder, now },
      { namespace: NAMESPACE, question, validAt: null, knownAt: null, limit: 10 },
    );
    if (!result.ok) throw new Error(`recall failed: ${result.error.code}: ${result.error.message}`);
  };
  await ask(QUESTIONS[0] ?? 'warm-up');
  const durations: number[] = [];
  for (let repeat = 0; repeat < RECALL_REPEATS; repeat += 1) {
    for (const question of QUESTIONS) {
      const start = timeClock();
      await ask(question);
      durations.push(timeClock() - start);
    }
  }
  return durations;
}

/** Durations of `recordStructuredFacts` for one new fact each, without the time inside the embedder. */
async function measureRecordFact(
  store: MemoryStore,
  embedder: Embedder,
  size: number,
  timeClock: Clock,
): Promise<number[]> {
  const timed = timeEmbedder(embedder, timeClock);
  const deps = {
    store,
    embedder: timed.embedder,
    domain: softwareDevelopmentDomain,
    now,
    newId: countingIds(`bench-new-${size}`),
  };
  const durations: number[] = [];
  for (let repeat = 0; repeat < RECORD_REPEATS; repeat += 1) {
    const embedBefore = timed.spent.total;
    const start = timeClock();
    const result = await recordStructuredFacts(deps, {
      namespace: NAMESPACE,
      facts: [
        {
          subject: { type: 'repository', name: `bench-new-repo-${repeat}` },
          predicate: 'follows_convention',
          object: { kind: 'entity', type: 'convention', name: `benchmark convention ${repeat}` },
          statement: `bench-new-repo-${repeat} follows benchmark convention ${repeat}.`,
          confidence: 1,
          validFrom: null,
          validTo: null,
        },
      ],
      source: { kind: 'agent_note', locator: null, version: null },
      trigger: 'agent',
    });
    const total = timeClock() - start;
    if (!result.ok) throw new Error(`record_fact failed: ${result.error.code}: ${result.error.message}`);
    durations.push(total - (timed.spent.total - embedBefore));
  }
  return durations;
}

/** The time from starting main.ts until it answers the initialise request, once per start. */
async function measureServerStart(databasePath: string, home: string, timeClock: Clock): Promise<number[]> {
  const entry = join(import.meta.dirname, 'main.ts');
  const durations: number[] = [];
  for (let attempt = 0; attempt < SERVER_STARTS; attempt += 1) {
    const start = timeClock();
    const server = startServerProcess(
      entry,
      { FACTLOOM_DB: databasePath, FACTLOOM_NAMESPACE: NAMESPACE },
      home,
    );
    server.send(INITIALIZE_REQUEST);
    await waitFor(() => server.readStandardOutput().includes('"id":1'), 30_000);
    durations.push(timeClock() - start);
    server.close();
    const finished = await server.finished;
    if (finished.code !== 0)
      throw new Error(`The server exited with ${finished.code}: ${finished.standardError}`);
  }
  return durations;
}

/** The time of `remember` with the real model, when a key is set. Reported, not budgeted. */
async function measureRemember(
  store: MemoryStore,
  embedder: Embedder,
  timeClock: Clock,
): Promise<BenchmarkRow> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey === '') {
    return {
      label: 'remember, median (reported)',
      value: null,
      budgetName: null,
      note: 'not measured: ANTHROPIC_API_KEY is not set',
    };
  }
  const llm = createAnthropicLlmClient({
    apiKey,
    models: DEFAULT_LLM_MODELS,
    logUsage: () => {},
    sendMessage: createAnthropicMessageSender(),
  });
  const deps = {
    store,
    embedder,
    llm,
    domain: softwareDevelopmentDomain,
    now,
    newId: countingIds('bench-remember'),
  };
  const durations: number[] = [];
  for (let repeat = 0; repeat < REMEMBER_REPEATS; repeat += 1) {
    const start = timeClock();
    const result = await remember(deps, {
      namespace: NAMESPACE,
      text: `bench-remember-repo-${repeat} follows the convention of benchmark reviews ${repeat}.`,
      source: { kind: 'agent_note', locator: null, version: null },
      trigger: 'agent',
    });
    durations.push(timeClock() - start);
    if (!result.ok) throw new Error(`remember failed: ${result.error.code}: ${result.error.message}`);
  }
  return { label: 'remember, median (reported)', value: percentile(durations, 50), budgetName: null };
}

/** The SQLite version that better-sqlite3 bundles, read in the storage package where it is installed. */
function readSqliteVersion(): string {
  const storageDirectory = join(import.meta.dirname, '..', '..', '..', 'packages', 'storage');
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import Database from 'better-sqlite3'; process.stdout.write(new Database(':memory:').prepare('SELECT sqlite_version() AS v').get().v);",
    ],
    { cwd: storageDirectory, encoding: 'utf8' },
  );
}

function describeMachine(): string[] {
  const processors = cpus();
  return [
    `Operating system: ${type()} ${release()}`,
    `Processor: ${arch()}, ${processors[0]?.model ?? 'unknown model'}, ${processors.length} cores`,
    `Node.js ${process.version}, SQLite ${readSqliteVersion()}`,
  ];
}

const cacheDirectory = join(import.meta.dirname, '..', '..', '..', '.cache', 'models');
const embedder = createLocalEmbedder({ cacheDirectory, allowDownload: true });
const directory = mkdtempSync(join(tmpdir(), 'factloom-bench-'));
const rows: BenchmarkRow[] = [];
try {
  for (const size of [10_000, 100_000]) {
    const path = join(directory, `bench-${size}.db`);
    const opened = openSqliteMemoryStore({
      path,
      embeddingModel: embedder.model,
      embeddingDimensions: embedder.dimensions,
    });
    if (!opened.ok) throw new Error(opened.error.message);
    const store = opened.value;
    const buildStart = clock();
    const built = await buildSyntheticNamespace(store, {
      namespace: NAMESPACE,
      size,
      seed: SEED,
      dimensions: embedder.dimensions,
      createdAt: at('2026-01-01'),
    });
    if (!built.ok) throw new Error(built.error.message);
    process.stderr.write(`Built ${size} facts in ${((clock() - buildStart) / 1000).toFixed(1)} s.\n`);
    const label = size === 10_000 ? '10,000' : '100,000';
    const recallDurations = await measureRecall(store, embedder, clock);
    rows.push(
      { label: `recall, ${label} facts, p50`, value: percentile(recallDurations, 50), budgetName: null },
      {
        label: `recall, ${label} facts, p95`,
        value: percentile(recallDurations, 95),
        budgetName: size === 10_000 ? 'recall_10k_p95' : 'recall_100k_p95',
      },
    );
    const recordDurations = await measureRecordFact(store, embedder, size, clock);
    rows.push(
      {
        label: `record_fact excluding embedding, ${label} facts, p50`,
        value: percentile(recordDurations, 50),
        budgetName: null,
      },
      {
        label: `record_fact excluding embedding, ${label} facts, p95`,
        value: percentile(recordDurations, 95),
        budgetName: 'record_fact_p95',
      },
    );
    if (size === 10_000) rows.push(await measureRemember(store, embedder, clock));
    await store.close();
    if (size === 10_000) {
      const starts = await measureServerStart(path, directory, clock);
      rows.push({
        label: `server start, median of ${SERVER_STARTS}`,
        value: percentile(starts, 50),
        budgetName: 'server_start_median',
      });
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}

const judged = rows.map((row) => judgeRow(row));
process.stdout.write(`${formatBenchmarkTable(judged, describeMachine())}\n`);
process.exitCode = judged.some((row) => row.outcome === 'missed') ? 1 : 0;
