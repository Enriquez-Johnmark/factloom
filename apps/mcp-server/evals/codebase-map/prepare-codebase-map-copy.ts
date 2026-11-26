// A clean copy of the fixture repository of FL-082 for one run of one task: `fixture/` as one
// commit. The runner then adds, in this order: for the second baseline only, the hand-written map
// `claude-md-map.md` as CLAUDE.md; the work of the first session; and, for some tasks, a
// teammate's commit from `teammate-changes.ts`. The identity and the dates are fixed, so every
// build makes the same commits, down to the HEAD commit's hash.
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { moveFunctions } from './move-functions.ts';
import { redirectImports } from './redirect-imports.ts';
import { TEAMMATE_CHANGES } from './teammate-changes.ts';

/** Where the checks of the codebase-map task set are kept, out of the agent's sight. */
export const CODEBASE_MAP_CHECKS_DIRECTORY = join(import.meta.dirname, 'checks');

/** Where the files of each task's sessions are kept, for the tests that prove each check. */
export const CODEBASE_MAP_SOLUTIONS_DIRECTORY = join(import.meta.dirname, 'solutions');

/** The hand-written map of the second baseline, as a developer would keep it in CLAUDE.md. */
export const CLAUDE_MD_MAP_FILE = join(import.meta.dirname, 'claude-md-map.md');

const FIXTURE_DIRECTORY = join(import.meta.dirname, 'fixture');
const FIRST_COMMIT_MESSAGE = 'chore: start the lending desk service';
const CLAUDE_MD_COMMIT_MESSAGE = 'docs: add a map of the code base for coding agents';

/** 2026-11-02T09:00:00Z, in seconds since the epoch, as git's internal date format wants. */
const FIRST_COMMIT_SECONDS = 1_793_610_000;
const HOUR_SECONDS = 3_600;
const DAY_SECONDS = 86_400;

const FIXTURE_AUTHOR: Author = { name: 'Fixture', email: 'fixture@example.com' };
const TEAMMATE: Author = { name: 'Robin Teammate', email: 'robin@example.com' };

/**
 * Copies the fixture into a new temporary directory and makes it a git repository of one commit,
 * the same on every build. Claude Code keys its auto memory by git repository, so each copy also
 * starts with an empty auto memory. Returns the directory.
 */
export function prepareCodebaseMapCopy(): string {
  const directory = mkdtempSync(join(tmpdir(), 'lending-desk-'));
  cpSync(FIXTURE_DIRECTORY, directory, { recursive: true });
  runGit(directory, {
    seconds: FIRST_COMMIT_SECONDS,
    arguments: ['init', '--quiet', '--initial-branch=main'],
  });
  commitAll(directory, { seconds: FIRST_COMMIT_SECONDS, arguments: ['--message', FIRST_COMMIT_MESSAGE] });
  return directory;
}

/**
 * Writes the hand-written map into the copy as CLAUDE.md and commits it, an hour after the first
 * commit. The runner calls it for the second baseline only, before the first session; nothing
 * updates it after.
 */
export function writeClaudeMdBaseline(directory: string): void {
  copyFileSync(CLAUDE_MD_MAP_FILE, join(directory, 'CLAUDE.md'));
  commitAll(directory, {
    seconds: FIRST_COMMIT_SECONDS + HOUR_SECONDS,
    arguments: ['--message', CLAUDE_MD_COMMIT_MESSAGE],
  });
}

/**
 * Commits everything in the working tree, even when nothing changed, with the given message, one
 * day after the first commit. The runner calls it after a task's first session.
 */
export function commitFirstSession(directory: string, message: string): void {
  commitAll(directory, {
    seconds: FIRST_COMMIT_SECONDS + DAY_SECONDS,
    arguments: ['--allow-empty', '--message', message],
  });
}

/**
 * Makes the teammate's commit of a task, two days after the first commit, on top of whatever the
 * first session left; does nothing for a task without one. The runner calls it between the two
 * sessions, in both configurations.
 */
export function applyBetweenSessions(directory: string, taskId: string): void {
  const change = TEAMMATE_CHANGES[taskId];
  if (change === undefined) return;
  const seconds = FIRST_COMMIT_SECONDS + 2 * DAY_SECONDS;
  for (const rename of change.renames) {
    mkdirSync(dirname(join(directory, rename.to)), { recursive: true });
    runGit(directory, { seconds, arguments: ['mv', rename.from, rename.to] });
    redirectImports(directory, { from: rename.from, to: rename.to, names: null });
  }
  for (const move of change.moves) moveFunctions(directory, move);
  commitAll(directory, { seconds, author: TEAMMATE, arguments: ['--message', change.message] });
}

type Author = { readonly name: string; readonly email: string };

/** A git command, the date in seconds since the epoch its commit gets, and who makes it. */
type GitCommand = {
  readonly seconds: number;
  readonly author?: Author;
  readonly arguments: readonly string[];
};

function commitAll(directory: string, commit: GitCommand): void {
  runGit(directory, { ...commit, arguments: ['add', '--all'] });
  runGit(directory, { ...commit, arguments: ['commit', '--quiet', ...commit.arguments] });
}

function runGit(directory: string, command: GitCommand): void {
  const date = `${command.seconds} +0000`;
  const author = command.author ?? FIXTURE_AUTHOR;
  // The person's git settings, such as signing or hooks, must not reach the copy.
  const environment = {
    PATH: process.env.PATH ?? '',
    HOME: directory,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
    GIT_COMMITTER_DATE: date,
  };
  execFileSync('git', ['-C', directory, '-c', 'commit.gpgsign=false', ...command.arguments], {
    env: environment,
    stdio: 'pipe',
  });
}
