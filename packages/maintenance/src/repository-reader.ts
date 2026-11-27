import type { Result, Timestamp } from '@kronomind/core';

/**
 * What the verification ladder reads from a repository, and nothing more. Paths are relative
 * to the repository's root. A commit is a commit identifier as stored in a source's `version`.
 * The git implementation is in the application; tests use a fake. Every method returns
 * `invalid_input` when the repository cannot be read.
 */
export type RepositoryReader = {
  /** The commit `HEAD` names. */
  readonly readHead: () => Promise<Result<string>>;
  /** Whether a commit is `HEAD` or an ancestor of it. False for a commit the repository does not have. */
  readonly isAncestorOfHead: (commit: string) => Promise<Result<boolean>>;
  /** Whether a path exists at a commit. */
  readonly pathExists: (commit: string, path: string) => Promise<Result<boolean>>;
  /** The content identifier of a path at a commit, or null when the path does not exist there. */
  readonly readContentId: (commit: string, path: string) => Promise<Result<string | null>>;
  /** The text of a path at a commit, or null when the path does not exist there. */
  readonly readText: (commit: string, path: string) => Promise<Result<string | null>>;
  /**
   * The path a file was renamed to by the last commit on the branch that removed the given
   * path, or null when that commit deleted it or no commit removed it. One step: a file renamed
   * twice needs two calls.
   */
  readonly findRenamedPath: (path: string) => Promise<Result<string | null>>;
  /** The commits after `fromCommit`, up to and including HEAD, that touched a path, oldest first, with their committer times. */
  readonly listCommitsTouching: (
    path: string,
    fromCommit: string,
  ) => Promise<Result<readonly { readonly commit: string; readonly committedAt: Timestamp }[]>>;
};
