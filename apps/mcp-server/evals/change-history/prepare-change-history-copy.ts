// A clean copy of the fixture repository of FL-081 for one run of one task, with its git history
// (technical requirement 3). The history is data: `fixture/` is the first commit, and each folder
// of `history/`, in name order, is one more commit: its `files/` are copied over the tree and its
// `message.txt` is the commit message. The identity and the dates are fixed, so every build makes
// the same commits, down to the HEAD commit's hash.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Where the checks of the change-history task set are kept, out of the agent's sight. */
export const CHANGE_HISTORY_CHECKS_DIRECTORY = join(import.meta.dirname, 'checks');

/** Where the files of each task's sessions are kept, for the tests that prove each check. */
export const CHANGE_HISTORY_SOLUTIONS_DIRECTORY = join(import.meta.dirname, 'solutions');

const FIXTURE_DIRECTORY = join(import.meta.dirname, 'fixture');
const HISTORY_DIRECTORY = join(import.meta.dirname, 'history');
const FIRST_COMMIT_MESSAGE = 'chore: start the shipping service';

/** 2026-03-02T09:00:00Z, in seconds since the epoch, as git's internal date format wants. */
const FIRST_COMMIT_SECONDS = 1_772_442_000;
const DAY_SECONDS = 86_400;
/** Days between two commits of the history, so that its dates read like real work. */
const DAYS_BETWEEN_COMMITS = 5;

/**
 * Copies the fixture into a new temporary directory and makes it a git repository with the
 * fixture's scripted history, the same on every build. Claude Code keys its auto memory by git
 * repository, so each copy also starts with an empty auto memory. Returns the directory.
 */
export function prepareChangeHistoryCopy(): string {
  const directory = mkdtempSync(join(tmpdir(), 'shipping-service-'));
  cpSync(FIXTURE_DIRECTORY, directory, { recursive: true });
  runGit(directory, {
    seconds: FIRST_COMMIT_SECONDS,
    arguments: ['init', '--quiet', '--initial-branch=main'],
  });
  commitAll(directory, { seconds: FIRST_COMMIT_SECONDS, arguments: ['--message', FIRST_COMMIT_MESSAGE] });
  listHistorySteps().forEach((step, index) => {
    cpSync(join(HISTORY_DIRECTORY, step, 'files'), directory, { recursive: true });
    const seconds = FIRST_COMMIT_SECONDS + (index + 1) * DAYS_BETWEEN_COMMITS * DAY_SECONDS;
    commitAll(directory, { seconds, arguments: ['--file', join(HISTORY_DIRECTORY, step, 'message.txt')] });
  });
  return directory;
}

/**
 * Commits everything in the working tree, even when nothing changed, with the given message and
 * a fixed date one day after the last commit of the history. The runner calls it after a task's
 * first session, so that the reason for the change is in the git history (FL-081, functional
 * requirement 2).
 */
export function commitFirstSession(directory: string, message: string): void {
  const lastHistorySeconds =
    FIRST_COMMIT_SECONDS + listHistorySteps().length * DAYS_BETWEEN_COMMITS * DAY_SECONDS;
  commitAll(directory, {
    seconds: lastHistorySeconds + DAY_SECONDS,
    arguments: ['--allow-empty', '--message', message],
  });
}

function listHistorySteps(): string[] {
  return readdirSync(HISTORY_DIRECTORY).sort();
}

/** A git command, and the date in seconds since the epoch that its commit, if any, gets. */
type GitCommand = { readonly seconds: number; readonly arguments: readonly string[] };

function commitAll(directory: string, commit: GitCommand): void {
  runGit(directory, { seconds: commit.seconds, arguments: ['add', '--all'] });
  runGit(directory, { seconds: commit.seconds, arguments: ['commit', '--quiet', ...commit.arguments] });
}

function runGit(directory: string, command: GitCommand): void {
  const date = `${command.seconds} +0000`;
  // The person's git settings, such as signing or hooks, must not reach the copy.
  const environment = {
    PATH: process.env.PATH ?? '',
    HOME: directory,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_DATE: date,
  };
  execFileSync('git', ['-C', directory, '-c', 'commit.gpgsign=false', ...command.arguments], {
    env: environment,
    stdio: 'pipe',
  });
}
