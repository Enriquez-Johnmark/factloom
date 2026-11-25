// A clean copy of the fixture repository for one run of one task (technical requirement 3).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The fixture repository that every copy starts from. */
export const FIXTURE_DIRECTORY = join(import.meta.dirname, 'fixture');

/** The same author, committer and date on the first commit of every copy. */
const FIXED_IDENTITY = {
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_AUTHOR_DATE: '2026-03-01T09:00:00Z',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_DATE: '2026-03-01T09:00:00Z',
};

/**
 * Copies the fixture into a new temporary directory and makes it a git repository with one
 * commit, as a real checkout would be. Claude Code keys its auto memory by git repository, so
 * each copy also starts with an empty auto memory. Returns the directory.
 */
export function prepareFixtureCopy(): string {
  const directory = mkdtempSync(join(tmpdir(), 'invoice-service-'));
  cpSync(FIXTURE_DIRECTORY, directory, { recursive: true });
  // The person's git settings, such as signing or hooks, must not reach the copy.
  const environment = {
    PATH: process.env.PATH ?? '',
    HOME: directory,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    ...FIXED_IDENTITY,
  };
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', directory, ...args], { env: environment, stdio: 'ignore' });
  git('init', '--quiet', '--initial-branch=main');
  git('add', '--all');
  git('commit', '--quiet', '--message', 'Initial commit');
  return directory;
}
