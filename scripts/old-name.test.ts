// The check of FL-085: after the rename to Kronomind (ADR 0025), no use of the old name is left
// outside the records kept as they were written.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

// Built from two parts, so that this file does not match itself.
const OLD_NAME = new RegExp(['fact', 'loom'].join(''), 'i');

/** The records that keep the old name, listed in ADR 0025. */
const KEPT_RECORDS = [
  'apps/mcp-server/evals/agent-comparison/results/',
  'packages/storage/migrations/',
  'docs/architecture/adr/',
  'docs/roadmap/',
  'docs/research/',
  'spikes/',
  'apps/mcp-server/MOVE-AFTER-RENAME.md',
];

/** The one sentence outside them that names the old name, in README.md. */
const KEPT_SENTENCE = `Kronomind was called ${['Fact', 'loom'].join('')} until 2026-11-27`;

/** The tracked files that are not kept records. */
function listCheckedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((path) => path !== '' && !KEPT_RECORDS.some((kept) => path.startsWith(kept)));
}

/** Each line of a file that names the old name, as `path:line`, with the kept sentence removed. */
function findOldName(path: string): string[] {
  const text = readFileSync(join(root, path), 'utf8');
  return text
    .split('\n')
    .flatMap((line, index) =>
      OLD_NAME.test(line.replace(KEPT_SENTENCE, '')) ? [`${path}:${index + 1}`] : [],
    );
}

describe('the rename to Kronomind', () => {
  it('leaves no file named with the old name outside the kept records', () => {
    expect(listCheckedFiles().filter((path) => OLD_NAME.test(path))).toEqual([]);
  });

  it('leaves no use of the old name, in any letter case, outside the kept records', () => {
    expect(listCheckedFiles().flatMap(findOldName)).toEqual([]);
  });
});
