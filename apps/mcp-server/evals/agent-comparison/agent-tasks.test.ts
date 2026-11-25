import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AGENT_TASKS } from './agent-tasks.ts';
import { prepareFixtureCopy } from './prepare-fixture-copy.ts';
import { CHECKS_DIRECTORY, runTaskCheck } from './run-task-check.ts';

const SOLUTIONS_DIRECTORY = join(import.meta.dirname, 'solutions');
const CHECK_TEST_TIMEOUT = 60_000;

const copies: string[] = [];
function prepareCopy(): string {
  const directory = prepareFixtureCopy();
  copies.push(directory);
  return directory;
}

afterAll(() => {
  for (const directory of copies) rmSync(directory, { recursive: true, force: true });
});

describe('the task set', () => {
  it('has ten tasks with distinct ids', () => {
    const ids = AGENT_TASKS.map((task) => task.id);

    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has exactly one check and one reference answer for each task', () => {
    const ids = AGENT_TASKS.map((task) => task.id).sort();

    expect(readdirSync(CHECKS_DIRECTORY).sort()).toEqual(ids.map((id) => `${id}.test.mjs`).sort());
    expect(readdirSync(SOLUTIONS_DIRECTORY).sort()).toEqual(ids);
  });

  it('starts every run from a git repository with one commit and no check in it', () => {
    const directory = prepareCopy();

    const commits = execFileSync('git', ['-C', directory, 'rev-list', '--count', 'HEAD'], {
      encoding: 'utf8',
    });
    expect(commits.trim()).toBe('1');
    expect(existsSync(join(directory, 'test', 'task-check.test.mjs'))).toBe(false);
  });

  it(
    'passes its own tests in a clean copy of the fixture',
    () => {
      const directory = prepareCopy();

      const exitCode = runTestsOnly(directory);

      expect(exitCode).toBe(0);
    },
    CHECK_TEST_TIMEOUT,
  );
});

describe.concurrent('each check', () => {
  for (const task of AGENT_TASKS) {
    it(
      `fails on the untouched fixture: ${task.id}`,
      async () => {
        const directory = prepareCopy();

        const outcome = await runTaskCheck(directory, task.id);

        expect(outcome.passed).toBe(false);
      },
      CHECK_TEST_TIMEOUT,
    );

    it(
      `passes with the reference answer: ${task.id}`,
      async () => {
        const directory = prepareCopy();
        cpSync(join(SOLUTIONS_DIRECTORY, task.id), directory, { recursive: true });

        const outcome = await runTaskCheck(directory, task.id);

        expect(outcome.output).toContain('# fail 0');
        expect(outcome.passed).toBe(true);
      },
      CHECK_TEST_TIMEOUT,
    );
  }
});

/** Runs the fixture's own tests, without a check, and returns the exit code. */
function runTestsOnly(directory: string): number {
  try {
    execFileSync(process.execPath, ['--test'], { cwd: directory, stdio: 'ignore' });
    return 0;
  } catch (error) {
    return error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 1;
  }
}
