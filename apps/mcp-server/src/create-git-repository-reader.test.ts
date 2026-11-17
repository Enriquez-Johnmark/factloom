// The git implementation of the repository reader, against a fixture repository with two
// commits on main and one on another branch.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGitRepositoryReader } from './create-git-repository-reader.ts';
import { createFixtureRepository } from './testing/fixture-repository.ts';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** main: first adds docs/database.md, second edits it. other: a commit on top of first. */
function buildRepository() {
  const repository = createFixtureRepository();
  cleanups.push(repository.remove);
  const first = repository.commit({ 'docs/database.md': 'PostgreSQL 14\n' }, 'Add the database note');
  repository.git('branch', 'other');
  const second = repository.commit({ 'docs/database.md': 'PostgreSQL 16\n' }, 'Upgrade the database');
  repository.git('checkout', '--quiet', 'other');
  const other = repository.commit({ 'notes.md': 'Elsewhere\n' }, 'A commit on another branch');
  repository.git('checkout', '--quiet', 'main');
  return { reader: createGitRepositoryReader(repository.directory), first, second, other };
}

describe('the git repository reader', () => {
  it('reads the commit HEAD names', async () => {
    const { reader, second } = buildRepository();

    expect(await reader.readHead()).toEqual({ ok: true, value: second });
  });

  it('tells an ancestor of HEAD from a commit on another branch and from an unknown commit', async () => {
    const { reader, first, second, other } = buildRepository();

    const answers = await Promise.all(
      [first, second, other, '0123456789abcdef0123456789abcdef01234567'].map((commit) =>
        reader.isAncestorOfHead(commit),
      ),
    );

    expect(answers.map((answer) => answer.ok && answer.value)).toEqual([true, true, false, false]);
  });

  it('reads whether a path exists, its content identifier and its text at a commit', async () => {
    const { reader, first, second } = buildRepository();

    expect(await reader.pathExists(second, 'docs/database.md')).toEqual({ ok: true, value: true });
    expect(await reader.pathExists(second, 'docs/missing.md')).toEqual({ ok: true, value: false });
    const [then, now, missing] = await Promise.all([
      reader.readContentId(first, 'docs/database.md'),
      reader.readContentId(second, 'docs/database.md'),
      reader.readContentId(second, 'docs/missing.md'),
    ]);
    expect(then.ok && now.ok && then.value !== null && then.value !== now.value).toBe(true);
    expect(missing).toEqual({ ok: true, value: null });
    expect(await reader.readText(first, 'docs/database.md')).toEqual({ ok: true, value: 'PostgreSQL 14\n' });
    expect(await reader.readText(first, 'docs/missing.md')).toEqual({ ok: true, value: null });
  });

  it('finds the path a file was renamed to, and none for a deleted file or one never removed', async () => {
    const repository = createFixtureRepository();
    cleanups.push(repository.remove);
    repository.commit({ 'a.md': 'Alpha\n', 'b.md': 'Beta\n', 'c.md': 'Gamma\n' }, 'Add three notes');
    repository.git('mv', 'a.md', 'renamed.md');
    repository.commit({ 'b.md': null }, 'Rename one note and delete another');
    const reader = createGitRepositoryReader(repository.directory);

    const answers = await Promise.all(['a.md', 'b.md', 'c.md'].map((path) => reader.findRenamedPath(path)));

    expect(answers).toEqual([
      { ok: true, value: 'renamed.md' },
      { ok: true, value: null },
      { ok: true, value: null },
    ]);
  });

  it('refuses with invalid_input to read HEAD of a directory that is not a repository', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'factloom-not-a-repo-'));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));

    const head = await createGitRepositoryReader(directory).readHead();

    expect(head.ok ? null : head.error.code).toBe('invalid_input');
  });
});
