// Throwaway spike for FL-087: does a new database refuse to open with "database is locked" when
// the processes of a first session open it at once? It starts, in the same moment and on a new
// database each round, what Claude Code starts at the beginning of a first session with
// Factloom: the server over stdio, kept open; the maintenance command of the session start hook;
// and the recall hook with a prompt. It uses the app as built, with no LLM key and no agent.
//
//   node spikes/first-open-lock/run.mjs [--rounds <n>]
//
// It prints one line per round and a summary of the open failures by process and step.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { rounds: { type: 'string', default: '20' } } });
const rounds = Number(values.rounds);
const serverEntry = resolve(import.meta.dirname, '..', '..', 'apps', 'mcp-server', 'src', 'main.ts');

/** A repository with one commit, for the maintenance jobs to read. */
function makeRepository(directory) {
  mkdirSync(join(directory, 'lib'), { recursive: true });
  writeFileSync(join(directory, 'lib', 'fees.js'), '/** Assesses a late fee. */\nexport function assessLateFee() {}\n');
  const git = (...args) => spawnSync('git', args, { cwd: directory, stdio: 'ignore' });
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=spike', '-c', 'user.email=spike@example.invalid', 'commit', '-q', '-m', 'init');
}

/** Starts the app with arguments; resolves with its exit code and standard error. */
function start(args, environment, input) {
  const child = spawn(process.execPath, [serverEntry, ...args], {
    env: { ...process.env, ...environment },
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (chunk) => {
    errors += chunk.toString();
  });
  if (input !== undefined) child.stdin.end(input);
  const exited = new Promise((done) => child.on('exit', (code) => done({ code, errors })));
  return { child, exited };
}

/** The step named in an open failure, or null when the process opened the database. */
function readOpenFailure(errors) {
  const line = errors.split('\n').find((text) => text.includes('could not be opened') || text.includes('could not be brought up to date'));
  if (line === undefined) return null;
  const step = /, while ([^.]+)$/.exec(line.trim())?.[1] ?? (line.includes('brought up to date') ? 'migrating' : 'step not named');
  const reason = line.includes('database is locked') ? 'database is locked' : line.slice(line.lastIndexOf('. ') + 2, line.lastIndexOf('. ') + 80);
  return `${reason}, while ${step}`;
}

const failures = new Map();
function count(process, failure) {
  const key = `${process}: ${failure}`;
  failures.set(key, (failures.get(key) ?? 0) + 1);
}

console.log(`Node.js ${process.version} on ${platform()} ${release()} ${arch()}, ${rounds} rounds`);
const root = mkdtempSync(join(tmpdir(), 'factloom-first-open-'));
try {
  for (let round = 1; round <= rounds; round += 1) {
    const directory = join(root, `round-${round}`);
    makeRepository(directory);
    const environment = {
      FACTLOOM_DB: join(directory, 'factloom.db'),
      FACTLOOM_NAMESPACE: 'repo:first-open-spike',
      FACTLOOM_REPO: directory,
      ANTHROPIC_API_KEY: '',
    };
    const server = start([], environment);
    const maintenance = start(['maintenance'], environment);
    const recallHook = start(['hook', 'recall'], environment, JSON.stringify({ prompt: 'Where is the late fee assessed?' }));
    const [maintenanceResult, recallResult] = await Promise.all([maintenance.exited, recallHook.exited]);
    server.child.stdin.end();
    const serverResult = await server.exited;

    const outcome = [];
    for (const [name, result] of [['server', serverResult], ['maintenance', maintenanceResult], ['recall hook', recallResult]]) {
      const failure = readOpenFailure(result.errors);
      if (failure !== null) count(name, failure);
      outcome.push(`${name} ${failure === null ? 'opened' : `FAILED (${failure})`}`);
    }
    console.log(`round ${round}: ${outcome.join('; ')}`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(failures.size === 0 ? 'No process failed to open the database.' : 'Open failures:');
for (const [key, times] of failures) console.log(`  ${times} x ${key}`);
