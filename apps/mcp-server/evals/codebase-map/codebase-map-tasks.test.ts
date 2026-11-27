import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { AgentTask } from '../agent-comparison/agent-tasks.ts';
import { runTaskCheck } from '../agent-comparison/run-task-check.ts';
import { CODEBASE_MAP_TASKS } from './codebase-map-tasks.ts';
import {
  applyBetweenSessions,
  CODEBASE_MAP_CHECKS_DIRECTORY,
  CODEBASE_MAP_SOLUTIONS_DIRECTORY,
  commitFirstSession,
  prepareCodebaseMapCopy,
  writeClaudeMdBaseline,
} from './prepare-codebase-map-copy.ts';
import { TEAMMATE_CHANGES } from './teammate-changes.ts';

const CHECK_TEST_TIMEOUT = 60_000;
const TASK_IDS = CODEBASE_MAP_TASKS.map((task) => task.id);
const CHANGED_TASK_IDS = Object.keys(TEAMMATE_CHANGES);
const UNCHANGED_TASK_IDS = TASK_IDS.filter((id) => !CHANGED_TASK_IDS.includes(id));
const CHANGES = Object.values(TEAMMATE_CHANGES);

const copies: string[] = [];
function prepareCopy(): string {
  const directory = prepareCodebaseMapCopy();
  copies.push(directory);
  return directory;
}

afterAll(() => {
  for (const directory of copies) rmSync(directory, { recursive: true, force: true });
});

describe('the codebase-map task set', () => {
  it('has ten tasks with distinct ids', () => {
    expect(TASK_IDS).toHaveLength(10);
    expect(new Set(TASK_IDS).size).toBe(TASK_IDS.length);
  });

  it('asks every task to find code', () => {
    for (const task of CODEBASE_MAP_TASKS) expect(task.knowledge, task.id).toBe('code location');
  });

  it('gives every task a commit message for the work of its first session', () => {
    for (const task of CODEBASE_MAP_TASKS) expect(task.firstSessionCommit, task.id).toMatch(/\S/);
  });

  it('ends every second session by asking to keep the existing tests passing', () => {
    for (const task of CODEBASE_MAP_TASKS) {
      expect(task.secondSession, task.id).toMatch(/Keep the existing tests passing\.$/);
    }
  });

  it('names no file in any prompt, so that the agent has to find the code', () => {
    for (const task of CODEBASE_MAP_TASKS) {
      for (const prompt of [task.firstSession, task.secondSession]) {
        expect(prompt, task.id).not.toMatch(/\.js\b|\blib\/|\btest\//);
      }
    }
  });

  it('has a teammate change only for tasks of the set', () => {
    for (const id of CHANGED_TASK_IDS) expect(TASK_IDS).toContain(id);
  });

  it('moves code between the sessions of at least four tasks: two renames of a file and two moves of a function', () => {
    expect(CHANGED_TASK_IDS.length).toBeGreaterThanOrEqual(4);
    expect(CHANGES.filter((change) => change.renames.length > 0).length).toBeGreaterThanOrEqual(2);
    expect(CHANGES.filter((change) => change.moves.length > 0).length).toBeGreaterThanOrEqual(2);
  });

  it('has exactly one check and one set of session answers for each task', () => {
    const ids = [...TASK_IDS].sort();

    expect(readdirSync(CODEBASE_MAP_CHECKS_DIRECTORY).sort()).toEqual(ids.map((id) => `${id}.test.mjs`));
    expect(readdirSync(CODEBASE_MAP_SOLUTIONS_DIRECTORY).sort()).toEqual(ids);
    for (const id of ids) {
      expect(readdirSync(join(CODEBASE_MAP_SOLUTIONS_DIRECTORY, id)).sort()).toEqual(['first', 'second']);
    }
  });
});

describe('the fixture repository', () => {
  it(
    'builds the same commit, down to its hash, on every build',
    () => {
      const first = gitOutput(prepareCopy(), ['rev-parse', 'HEAD']);
      const second = gitOutput(prepareCopy(), ['rev-parse', 'HEAD']);

      expect(second).toBe(first);
    },
    CHECK_TEST_TIMEOUT,
  );

  it(
    'has some forty source files in several folders',
    () => {
      const sourceFiles = readdirSync(join(prepareCopy(), 'lib'), { recursive: true }).filter((path) =>
        String(path).endsWith('.js'),
      );

      expect(sourceFiles.length).toBeGreaterThanOrEqual(30);
      expect(sourceFiles.length).toBeLessThanOrEqual(45);
    },
    CHECK_TEST_TIMEOUT,
  );

  it(
    'passes its own tests in a clean copy',
    () => {
      expect(runTestsOnly(prepareCopy())).toBe(0);
    },
    CHECK_TEST_TIMEOUT,
  );

  it(
    'commits the first session with its message, after the first commit',
    () => {
      const directory = prepareCopy();
      const firstDate = Number(gitOutput(directory, ['log', '-1', '--format=%at']));

      commitFirstSession(directory, 'fix: a change');

      expect(gitOutput(directory, ['log', '-1', '--format=%B'])).toBe('fix: a change');
      expect(Number(gitOutput(directory, ['log', '-1', '--format=%at']))).toBeGreaterThan(firstDate);
    },
    CHECK_TEST_TIMEOUT,
  );

  it(
    'adds the hand-written map as a committed CLAUDE.md that names where the moved code was',
    () => {
      const directory = prepareCopy();

      writeClaudeMdBaseline(directory);

      const claudeMd = readFileSync(join(directory, 'CLAUDE.md'), 'utf8');
      expect(gitOutput(directory, ['ls-files', 'CLAUDE.md'])).toBe('CLAUDE.md');
      expect(gitOutput(directory, ['status', '--porcelain'])).toBe('');
      for (const change of CHANGES) {
        for (const rename of change.renames) {
          expect(claudeMd).toContain(rename.from);
          expect(claudeMd).not.toContain(rename.to);
        }
        for (const move of change.moves) {
          expect(claudeMd).toContain(move.from);
          for (const name of move.names) expect(claudeMd).toContain(name);
        }
      }
    },
    CHECK_TEST_TIMEOUT,
  );
});

describe.concurrent('the teammate change between the sessions', () => {
  for (const id of CHANGED_TASK_IDS) {
    it(
      `moves the code out of its first place, as one commit, and keeps the fixture's tests passing: ${id}`,
      () => {
        const directory = prepareCopy();
        const before = gitOutput(directory, ['rev-parse', 'HEAD']);

        applyBetweenSessions(directory, id);

        expect(gitOutput(directory, ['rev-parse', 'HEAD~1'])).toBe(before);
        expect(gitOutput(directory, ['status', '--porcelain'])).toBe('');
        expectCodeMoved(directory, id);
        expect(runTestsOnly(directory)).toBe(0);
      },
      CHECK_TEST_TIMEOUT,
    );
  }

  for (const id of UNCHANGED_TASK_IDS) {
    it(
      `leaves the repository as it was: ${id}`,
      () => {
        const directory = prepareCopy();
        const before = gitOutput(directory, ['rev-parse', 'HEAD']);

        applyBetweenSessions(directory, id);

        expect(gitOutput(directory, ['rev-parse', 'HEAD'])).toBe(before);
        expect(gitOutput(directory, ['status', '--porcelain'])).toBe('');
      },
      CHECK_TEST_TIMEOUT,
    );
  }
});

describe.concurrent('each check', () => {
  for (const task of CODEBASE_MAP_TASKS) {
    it(
      `fails on the fixture as it is: ${task.id}`,
      async () => {
        const outcome = await runTaskCheck(prepareCopy(), task.id, CODEBASE_MAP_CHECKS_DIRECTORY);

        expect(outcome.passed).toBe(false);
      },
      CHECK_TEST_TIMEOUT,
    );

    it(
      `fails after the first session and the teammate change, so it needs the work of the second: ${task.id}`,
      async () => {
        const directory = prepareBeforeSecondSession(task);

        const outcome = await runTaskCheck(directory, task.id, CODEBASE_MAP_CHECKS_DIRECTORY);

        expect(outcome.passed).toBe(false);
      },
      CHECK_TEST_TIMEOUT,
    );

    it(
      `passes after a right second session: ${task.id}`,
      async () => {
        const directory = prepareBeforeSecondSession(task);
        applySolution(directory, task.id, 'second');

        const outcome = await runTaskCheck(directory, task.id, CODEBASE_MAP_CHECKS_DIRECTORY);

        expect(outcome.output).toContain('# fail 0');
        expect(outcome.passed).toBe(true);
      },
      CHECK_TEST_TIMEOUT,
    );
  }
});

/**
 * Returns a copy of the fixture as the second session finds it: the work of a right first
 * session, committed as the runner does, then the teammate change of the task, if any.
 */
function prepareBeforeSecondSession(task: AgentTask): string {
  const directory = prepareCopy();
  applySolution(directory, task.id, 'first');
  if (task.firstSessionCommit === undefined) throw new Error(`Task ${task.id} has no first-session commit.`);
  commitFirstSession(directory, task.firstSessionCommit);
  applyBetweenSessions(directory, task.id);
  return directory;
}

function applySolution(directory: string, taskId: string, session: 'first' | 'second'): void {
  cpSync(join(CODEBASE_MAP_SOLUTIONS_DIRECTORY, taskId, session), directory, { recursive: true });
}

function expectCodeMoved(directory: string, taskId: string): void {
  const change = TEAMMATE_CHANGES[taskId];
  if (change === undefined) throw new Error(`Task ${taskId} has no teammate change.`);
  for (const rename of change.renames) {
    expect(existsSync(join(directory, rename.from)), rename.from).toBe(false);
    expect(existsSync(join(directory, rename.to)), rename.to).toBe(true);
  }
  for (const move of change.moves) {
    const source = readFileSync(join(directory, move.from), 'utf8');
    const target = readFileSync(join(directory, move.to), 'utf8');
    for (const name of move.names) {
      expect(source).not.toContain(`function ${name}(`);
      expect(target).toContain(`export function ${name}(`);
    }
  }
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
