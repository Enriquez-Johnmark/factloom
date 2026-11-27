import { execFile } from 'node:child_process';
import { err, ok, type Result, toTimestamp } from '@kronomind/core';
import type { RepositoryReader } from '@kronomind/maintenance';

type GitRun = { readonly code: number; readonly standardOutput: string; readonly standardError: string };

/** Ten megabytes: more than any source file a fact is anchored to. */
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

/**
 * Runs git with its arguments as a list, never through a shell, in the repository's
 * directory. Resolves with the exit code; rejects only when git cannot be started.
 */
function runGit(directory: string, args: readonly string[]): Promise<GitRun> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-C', directory, ...args],
      { encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES },
      (error, standardOutput, standardError) => {
        if (error !== null && typeof error.code !== 'number') {
          reject(error);
          return;
        }
        resolve({ code: error === null ? 0 : Number(error.code), standardOutput, standardError });
      },
    );
  });
}

function unreadable(directory: string, detail: string): Result<never> {
  return err('invalid_input', `The repository at ${directory} could not be read: ${detail.trim()}`);
}

/** The repository reader of maintenance, and the list of files the code base map reads (FL-084). */
export type GitRepositoryReader = RepositoryReader & {
  /** The paths of the files at a commit, from the repository root. */
  readonly listFiles: (commit: string) => Promise<Result<readonly string[]>>;
};

/**
 * Reads a git repository for the verification ladder and the code base map, at commits, never
 * the working tree.
 * The commands are those the software development research ran (checks 4.1, 4.6 and 4.7),
 * re-read on 2026-11-17 in git-merge-base, git-cat-file, git-rev-parse and gitrevisions at
 * https://git-scm.com/docs. A directory that is not a repository fails `readHead` with
 * `invalid_input`, so the job fails before it reads anything else.
 */
export function createGitRepositoryReader(directory: string): GitRepositoryReader {
  const git = async (args: readonly string[]): Promise<Result<GitRun>> => {
    try {
      return ok(await runGit(directory, args));
    } catch (cause) {
      return unreadable(directory, cause instanceof Error ? cause.message : 'git could not be started.');
    }
  };
  /** `git cat-file -e` exits with zero when the object exists and is valid (git-cat-file). */
  const exists = async (object: string): Promise<Result<boolean>> => {
    const run = await git(['cat-file', '-e', object]);
    return run.ok ? ok(run.value.code === 0) : run;
  };
  return {
    async readHead() {
      const run = await git(['rev-parse', '--verify', 'HEAD^{commit}']);
      if (!run.ok) return run;
      if (run.value.code !== 0) return unreadable(directory, run.value.standardError);
      return ok(run.value.standardOutput.trim());
    },

    async isAncestorOfHead(commit) {
      // A commit the repository does not have is from elsewhere, not an error.
      const known = await exists(`${commit}^{commit}`);
      if (!known.ok || !known.value) return known;
      // Exit 0 if an ancestor, 1 if not; any other status is an error (git-merge-base).
      const run = await git(['merge-base', '--is-ancestor', commit, 'HEAD']);
      if (!run.ok) return run;
      if (run.value.code === 0) return ok(true);
      if (run.value.code === 1) return ok(false);
      return unreadable(directory, run.value.standardError);
    },

    pathExists: (commit, path) => exists(`${commit}:${path}`),

    async listFiles(commit) {
      // -r recurses into folders, --name-only prints paths alone, and -z ends each with a NUL,
      // so no path is quoted or split (git ls-tree -h, run on 2026-11-27).
      const run = await git(['ls-tree', '-r', '--name-only', '-z', `${commit}^{tree}`]);
      if (!run.ok) return run;
      if (run.value.code !== 0) return unreadable(directory, run.value.standardError);
      return ok(run.value.standardOutput.split('\0').filter((path) => path !== ''));
    },

    async readContentId(commit, path) {
      // `<rev>:<path>` names the blob or tree at the path (gitrevisions); --verify prints its
      // object name, and --quiet exits non-zero without a message when there is none.
      const run = await git(['rev-parse', '--verify', '--quiet', `${commit}:${path}`]);
      if (!run.ok) return run;
      return ok(run.value.code === 0 ? run.value.standardOutput.trim() : null);
    },

    async readText(commit, path) {
      const found = await exists(`${commit}:${path}`);
      if (!found.ok || !found.value) return found.ok ? ok(null) : found;
      // With a type, cat-file prints the raw contents of the object (git-cat-file).
      const run = await git(['cat-file', 'blob', `${commit}:${path}`]);
      if (!run.ok) return run;
      if (run.value.code !== 0) return unreadable(directory, run.value.standardError);
      return ok(run.value.standardOutput);
    },

    async findRenamedPath(path) {
      // Check 4.2 of the research: the last commit whose diff, limited to the path, deletes it.
      // --no-renames keeps a user's diff.renames setting from reporting it otherwise.
      const removed = await git([
        'log',
        '--no-renames',
        '--diff-filter=D',
        '--format=%H',
        '-1',
        'HEAD',
        '--',
        path,
      ]);
      if (!removed.ok) return removed;
      if (removed.value.code !== 0) return unreadable(directory, removed.value.standardError);
      const commit = removed.value.standardOutput.trim();
      if (commit === '') return ok(null);
      // That commit's changes with rename detection at git's default similarity: a line
      // "R<score>\t<old>\t<new>" names the new path.
      const shown = await git(['show', '-M', '--name-status', '--format=', commit]);
      if (!shown.ok) return shown;
      if (shown.value.code !== 0) return unreadable(directory, shown.value.standardError);
      for (const line of shown.value.standardOutput.split('\n')) {
        const [status, from, to] = line.split('\t');
        if (status?.startsWith('R') && from === path && to !== undefined) return ok(to);
      }
      return ok(null);
    },

    async listCommitsTouching(path, fromCommit) {
      // Check 4.3 of the research: commits with their committer times (%cI, strict ISO 8601).
      // `<from>..HEAD` keeps those reachable from HEAD and not from the anchor (gitrevisions),
      // `-- <path>` those that touch the path, and --reverse puts the oldest first (git-log).
      const run = await git(['log', '--reverse', '--format=%H %cI', `${fromCommit}..HEAD`, '--', path]);
      if (!run.ok) return run;
      if (run.value.code !== 0) return unreadable(directory, run.value.standardError);
      return ok(
        run.value.standardOutput
          .split('\n')
          .filter((line) => line !== '')
          .map((line) => {
            const [commit = '', committedAt = ''] = line.split(' ');
            return { commit, committedAt: toTimestamp(new Date(committedAt)) };
          }),
      );
    },
  };
}
