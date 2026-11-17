import { execFile } from 'node:child_process';
import { err, ok, type Result } from '@factloom/core';
import type { RepositoryReader } from '@factloom/maintenance';

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

/**
 * Reads a git repository for the verification ladder, at commits, never the working tree.
 * The commands are those the software development research ran (checks 4.1, 4.6 and 4.7),
 * re-read on 2026-11-17 in git-merge-base, git-cat-file, git-rev-parse and gitrevisions at
 * https://git-scm.com/docs. A directory that is not a repository fails `readHead` with
 * `invalid_input`, so the job fails before it reads anything else.
 */
export function createGitRepositoryReader(directory: string): RepositoryReader {
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
  };
}
