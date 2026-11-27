// The timing of Q-11 for FL-055: the time of 100 `recall` calls to the server over stdio, on a
// database of 10,000 facts, with usage recording on and with it off, run twice each in turn.
// Run by hand: `pnpm run time:usage`. It starts the test entry, which serves the server of
// main.ts with the fake embedder, so it needs no model and no network; it measures the cost of
// the usage write, not of the embedding model. Not part of `pnpm check`.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { arch, cpus, release, tmpdir, type } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { createFakeEmbedder, parseDateInput } from '@kronomind/core';
import { openSqliteMemoryStore } from '@kronomind/storage';
import { percentile } from '../evals/benchmark/benchmark-budgets.ts';
import { buildSyntheticNamespace } from '../evals/benchmark/build-synthetic-namespace.ts';
import { INITIALIZE_REQUEST, INITIALIZED_NOTIFICATION } from './testing/server-process.ts';

const ENTRY = join(import.meta.dirname, 'serve-with-fake-embedder.ts');
const NAMESPACE = 'bench:usage-timing';
const FACTS = 10_000;
const CALLS = 100;
const WARM_UP_CALLS = 5;
const QUESTIONS = [
  'Which conventions does repo-12 follow?',
  'Who uses squash merges and semantic versioning?',
  'What does the team do about release trains and canary deploys?',
  'Which repositories follow trunk based development?',
];

/** Times the calls of one server process: each `recall` is sent when the one before is answered. */
async function timeRecalls(databasePath: string, home: string, usage: 'on' | 'off') {
  const child = spawn(process.execPath, [ENTRY], {
    env: {
      PATH: process.env.PATH ?? '',
      HOME: home,
      FACTLOOM_DB: databasePath,
      FACTLOOM_NAMESPACE: NAMESPACE,
      FACTLOOM_TIMING_USAGE: usage,
    },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const waiting = new Map<number, () => void>();
  createInterface({ input: child.stdout }).on('line', (line) => {
    const id: unknown = JSON.parse(line).id;
    if (typeof id === 'number') waiting.get(id)?.();
  });
  let nextId = 1;
  const request = (method: string, params: unknown) =>
    new Promise<void>((resolve) => {
      const id = nextId;
      nextId += 1;
      waiting.set(id, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  const recallOnce = (index: number) =>
    request('tools/call', { name: 'recall', arguments: { question: QUESTIONS[index % QUESTIONS.length] } });

  await request(INITIALIZE_REQUEST.method, INITIALIZE_REQUEST.params);
  child.stdin.write(`${JSON.stringify(INITIALIZED_NOTIFICATION)}\n`);
  for (let index = 0; index < WARM_UP_CALLS; index += 1) await recallOnce(index);
  const durations: number[] = [];
  const start = performance.now();
  for (let index = 0; index < CALLS; index += 1) {
    const callStart = performance.now();
    await recallOnce(index);
    durations.push(performance.now() - callStart);
  }
  const total = performance.now() - start;
  child.stdin.end();
  await new Promise((resolve) => child.on('exit', resolve));
  return { usage, total, median: percentile(durations, 50), p95: percentile(durations, 95) };
}

const directory = mkdtempSync(join(tmpdir(), 'factloom-usage-timing-'));
try {
  const databasePath = join(directory, 'factloom.db');
  const embedder = createFakeEmbedder();
  const opened = openSqliteMemoryStore({
    path: databasePath,
    embeddingModel: embedder.model,
    embeddingDimensions: embedder.dimensions,
  });
  if (!opened.ok) throw new Error(opened.error.message);
  const createdAt = parseDateInput('2026-01-01');
  if (!createdAt.ok) throw new Error(createdAt.error.message);
  const built = await buildSyntheticNamespace(opened.value, {
    namespace: NAMESPACE,
    size: FACTS,
    seed: 20261126,
    dimensions: embedder.dimensions,
    createdAt: createdAt.value,
  });
  if (!built.ok) throw new Error(built.error.message);
  await opened.value.close();

  const runs = [];
  for (const usage of ['on', 'off', 'on', 'off'] as const)
    runs.push(await timeRecalls(databasePath, directory, usage));

  const processor = cpus()[0]?.model ?? 'unknown';
  process.stdout.write(
    `Machine: ${type()} ${release()}, ${arch()}, ${processor}, ${cpus().length} cores, Node.js ${process.version}\n`,
  );
  process.stdout.write(
    `${CALLS} recall calls over stdio on ${FACTS.toLocaleString('en')} facts, after ${WARM_UP_CALLS} untimed:\n\n`,
  );
  process.stdout.write(
    '| Usage recording | Total (ms) | Median per call (ms) | p95 per call (ms) |\n|---|---|---|---|\n',
  );
  for (const run of runs) {
    process.stdout.write(
      `| ${run.usage} | ${run.total.toFixed(0)} | ${run.median.toFixed(1)} | ${run.p95.toFixed(1)} |\n`,
    );
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
