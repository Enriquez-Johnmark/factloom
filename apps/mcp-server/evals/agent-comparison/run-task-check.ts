// Runs a task's check in a working tree: the check file is copied into its test directory and
// `node --test` runs it with every other test there, so an answer that breaks the existing tests
// fails as well.
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Where the checks are kept, out of the agent's sight until the second session has ended. */
export const CHECKS_DIRECTORY = join(import.meta.dirname, 'checks');

/** The file name the check gets inside the working tree. */
export const CHECK_FILE_NAME = 'task-check.test.mjs';

/**
 * The time zone the checks run in. It is not UTC, so that code using local-time Date methods
 * gives a different answer from code using the UTC ones (task utc-dates).
 */
export const CHECK_TIME_ZONE = 'America/Los_Angeles';

/** A check that has not finished after this long fails. */
const CHECK_TIMEOUT = 120_000;

export type CheckOutcome = {
  readonly passed: boolean;
  /** The test runner's output, for the person reading the results. */
  readonly output: string;
};

/** Copies the check of a task into the working tree and runs every test there with `node --test`. */
export async function runTaskCheck(directory: string, taskId: string): Promise<CheckOutcome> {
  // The agent may have moved or removed the test directory; the check still runs.
  mkdirSync(join(directory, 'test'), { recursive: true });
  copyFileSync(join(CHECKS_DIRECTORY, `${taskId}.test.mjs`), join(directory, 'test', CHECK_FILE_NAME));
  const child = spawn(process.execPath, ['--test'], {
    cwd: directory,
    env: { PATH: process.env.PATH ?? '', TZ: CHECK_TIME_ZONE },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: CHECK_TIMEOUT,
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8');
  });
  const code = await new Promise<number | null>((resolve) => {
    child.on('close', (exitCode) => resolve(exitCode));
  });
  return { passed: code === 0, output };
}
