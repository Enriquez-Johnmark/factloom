// Fixture git repositories for the tests of verification (FL-050, and later FL-054, FL-062 and
// FL-071), built in a temporary directory with fixed dates. Nothing is committed inside this
// repository. Not a test file: it imports no test framework.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** The same author, committer and date on every commit, so that commit identifiers repeat. */
const FIXED_IDENTITY = {
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_AUTHOR_DATE: '2026-01-10T00:00:00Z',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_DATE: '2026-01-10T00:00:00Z',
};

/**
 * Creates an empty repository on branch `main`. `commit` writes or deletes files and commits
 * them, returning the commit's identifier; `git` runs any other git command there. `remove`
 * deletes the directory.
 */
export function createFixtureRepository() {
  const directory = mkdtempSync(join(tmpdir(), 'factloom-fixture-repo-'));
  // Settings outside the fixture, such as signing or hooks, must not reach it.
  const environment = {
    PATH: process.env.PATH ?? '',
    HOME: directory,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    ...FIXED_IDENTITY,
  };
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', directory, ...args], { env: environment, encoding: 'utf8' }).trim();
  git('init', '--quiet', '--initial-branch=main');
  return {
    directory,
    git,
    /** Writes each file given as text and deletes each given as null, then commits everything. */
    commit(files: Readonly<Record<string, string | null>>, message: string): string {
      for (const [path, text] of Object.entries(files)) {
        const target = join(directory, path);
        if (text === null) {
          rmSync(target);
        } else {
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, text);
        }
      }
      git('add', '--all');
      git('commit', '--quiet', '--allow-empty', '--message', message);
      return git('rev-parse', 'HEAD');
    },
    remove(): void {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
