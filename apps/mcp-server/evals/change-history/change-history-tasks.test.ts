import { execFileSync } from 'node:child_process';
import { cpSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { AgentTask } from '../agent-comparison/agent-tasks.ts';
import { runTaskCheck } from '../agent-comparison/run-task-check.ts';
import { CHANGE_HISTORY_TASKS } from './change-history-tasks.ts';
import {
  CHANGE_HISTORY_CHECKS_DIRECTORY,
  CHANGE_HISTORY_SOLUTIONS_DIRECTORY,
  commitFirstSession,
  prepareChangeHistoryCopy,
} from './prepare-change-history-copy.ts';

const HISTORY_DIRECTORY = join(import.meta.dirname, 'history');
const CHECK_TEST_TIMEOUT = 60_000;

/**
 * Words of each task's reason, or of the date its change took effect, that must not be in the
 * tree: an agent must find them in the git history or in memory, not by reading the code.
 */
const REASON_WORDS: Readonly<Record<string, readonly string[]>> = {
  'carrier-retry-limit': ['label costs', 'outage', 'tripled'],
  'free-shipping-threshold': ['summer', 'July'],
  'one-label-at-a-time': ['blocked', 'Easter', 'at a time'],
  'ascii-address-lines': ['question mark', 'ASCII', 'printer'],
  'tracking-number-formats': ['SHP', 'eight-digit', 'looks shipments up'],
  'signature-threshold': ['insurer', 'lost parcel'],
  'rate-cache-lifetime': ['fuel surcharge', 'undercharged'],
  'volumetric-divisor': ['contract', 'April', 'July', 'price letter'],
  'tracking-batch-size': ['times out', 'days old'],
  'label-timeout': ['peak', 'billed', 'second one'],
};

const copies: string[] = [];
function prepareCopy(): string {
  const directory = prepareChangeHistoryCopy();
  copies.push(directory);
  return directory;
}

afterAll(() => {
  for (const directory of copies) rmSync(directory, { recursive: true, force: true });
});

describe('the change-history task set', () => {
  it('has ten tasks with distinct ids', () => {
    const ids = CHANGE_HISTORY_TASKS.map((task) => task.id);

    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('asks at least seven times why a change was made and at least twice for a value from before one', () => {
    const kinds = CHANGE_HISTORY_TASKS.map((task) => task.knowledge);

    expect(kinds.filter((kind) => kind === 'change reason').length).toBeGreaterThanOrEqual(7);
    expect(kinds.filter((kind) => kind === 'earlier value').length).toBeGreaterThanOrEqual(2);
  });

  it('gives every task a commit message for the work of its first session', () => {
    for (const task of CHANGE_HISTORY_TASKS) expect(task.firstSessionCommit, task.id).toMatch(/\S/);
  });

  it('has exactly one check and one set of session answers for each task', () => {
    const ids = CHANGE_HISTORY_TASKS.map((task) => task.id).sort();

    expect(readdirSync(CHANGE_HISTORY_CHECKS_DIRECTORY).sort()).toEqual(ids.map((id) => `${id}.test.mjs`));
    expect(readdirSync(CHANGE_HISTORY_SOLUTIONS_DIRECTORY).sort()).toEqual(ids);
    for (const id of ids) {
      expect(readdirSync(join(CHANGE_HISTORY_SOLUTIONS_DIRECTORY, id)).sort()).toEqual([
        'first',
        'second',
        'wrong',
      ]);
    }
  });

  it('names words of the reason of every task, and of no other', () => {
    expect(Object.keys(REASON_WORDS).sort()).toEqual(CHANGE_HISTORY_TASKS.map((task) => task.id).sort());
  });
});

describe('the fixture repository', () => {
  it(
    'builds the same history, down to the HEAD commit, on every build',
    () => {
      const first = gitOutput(prepareCopy(), ['rev-parse', 'HEAD']);
      const second = gitOutput(prepareCopy(), ['rev-parse', 'HEAD']);

      expect(second).toBe(first);
    },
    CHECK_TEST_TIMEOUT,
  );

  it(
    'has a history of at least fifteen commits',
    () => {
      const commits = gitOutput(prepareCopy(), ['rev-list', '--count', 'HEAD']);

      expect(Number(commits)).toBeGreaterThanOrEqual(15);
    },
    CHECK_TEST_TIMEOUT,
  );

  it(
    'commits the first session with its message, one day after the last commit of the history',
    () => {
      const directory = prepareCopy();
      const lastHistoryDate = Number(gitOutput(directory, ['log', '-1', '--format=%at']));

      commitFirstSession(directory, 'fix: a change\n\nThe reason for it.');

      expect(gitOutput(directory, ['log', '-1', '--format=%B'])).toBe('fix: a change\n\nThe reason for it.');
      expect(Number(gitOutput(directory, ['log', '-1', '--format=%at']))).toBe(lastHistoryDate + 86_400);
    },
    CHECK_TEST_TIMEOUT,
  );

  it(
    'holds no task reason in any file of the tree',
    () => {
      const tree = readTree(prepareCopy()).toLowerCase();

      for (const [taskId, words] of Object.entries(REASON_WORDS)) {
        for (const word of words) expect(tree, `${taskId}: ${word}`).not.toContain(word.toLowerCase());
      }
    },
    CHECK_TEST_TIMEOUT,
  );

  it(
    'holds no sentence of a commit message in any file of the tree',
    () => {
      const tree = readTree(prepareCopy());
      const messages = [
        ...CHANGE_HISTORY_TASKS.map(firstSessionCommitOf),
        ...readdirSync(HISTORY_DIRECTORY).map((step) =>
          readFileSync(join(HISTORY_DIRECTORY, step, 'message.txt'), 'utf8'),
        ),
      ];

      for (const sentence of messages.flatMap(splitIntoSentences)) expect(tree).not.toContain(sentence);
    },
    CHECK_TEST_TIMEOUT,
  );

  it(
    'passes its own tests in a clean copy',
    () => {
      const directory = prepareCopy();

      const exitCode = runTestsOnly(directory);

      expect(exitCode).toBe(0);
    },
    CHECK_TEST_TIMEOUT,
  );
});

describe.concurrent('each check', () => {
  for (const task of CHANGE_HISTORY_TASKS) {
    it(
      `fails on the fixture as it is: ${task.id}`,
      async () => {
        const directory = prepareCopy();

        const outcome = await runTaskCheck(directory, task.id, CHANGE_HISTORY_CHECKS_DIRECTORY);

        expect(outcome.passed).toBe(false);
      },
      CHECK_TEST_TIMEOUT,
    );

    it(
      `fails after the first session alone, so it needs the work of the second: ${task.id}`,
      async () => {
        const directory = prepareAfterFirstSession(task);

        const outcome = await runTaskCheck(directory, task.id, CHANGE_HISTORY_CHECKS_DIRECTORY);

        expect(outcome.passed).toBe(false);
      },
      CHECK_TEST_TIMEOUT,
    );

    it(
      `passes with a second session that keeps to the reason: ${task.id}`,
      async () => {
        const directory = prepareAfterFirstSession(task);
        applySolution(directory, task.id, 'second');

        const outcome = await runTaskCheck(directory, task.id, CHANGE_HISTORY_CHECKS_DIRECTORY);

        expect(outcome.output).toContain('# fail 0');
        expect(outcome.passed).toBe(true);
      },
      CHECK_TEST_TIMEOUT,
    );

    it(
      `fails with a second session that ignores the reason: ${task.id}`,
      async () => {
        const directory = prepareAfterFirstSession(task);
        applySolution(directory, task.id, 'wrong');

        const outcome = await runTaskCheck(directory, task.id, CHANGE_HISTORY_CHECKS_DIRECTORY);

        expect(outcome.passed).toBe(false);
      },
      CHECK_TEST_TIMEOUT,
    );
  }
});

/** Returns a copy of the fixture with the work of a right first session, committed as the runner does. */
function prepareAfterFirstSession(task: AgentTask): string {
  const directory = prepareCopy();
  applySolution(directory, task.id, 'first');
  commitFirstSession(directory, firstSessionCommitOf(task));
  return directory;
}

function applySolution(directory: string, taskId: string, session: 'first' | 'second' | 'wrong'): void {
  cpSync(join(CHANGE_HISTORY_SOLUTIONS_DIRECTORY, taskId, session), directory, { recursive: true });
}

function firstSessionCommitOf(task: AgentTask): string {
  if (task.firstSessionCommit === undefined) throw new Error(`Task ${task.id} has no first-session commit.`);
  return task.firstSessionCommit;
}

/** Splits a commit message into its subject and the sentences of its body. */
function splitIntoSentences(message: string): string[] {
  return message
    .split(/\n+|(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** Returns the text of every file in the working tree, outside `.git`, joined. */
function readTree(directory: string): string {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !join(entry.parentPath, entry.name).includes(`${directory}/.git`))
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n');
}

function gitOutput(directory: string, gitArguments: readonly string[]): string {
  return execFileSync('git', ['-C', directory, ...gitArguments], { encoding: 'utf8' }).trim();
}

/** Runs the fixture's own tests, without a check, and returns the exit code. */
function runTestsOnly(directory: string): number {
  try {
    execFileSync(process.execPath, ['--test'], { cwd: directory, stdio: 'ignore' });
    return 0;
  } catch (error) {
    return error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 1;
  }
}
