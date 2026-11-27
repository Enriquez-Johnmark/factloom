import { type FactWithSources, ok, toTimestamp } from '@kronomind/core';
import { describe, expect, it } from 'vitest';
import {
  type CheckedValue,
  createStructuredValueRung,
  type StructuredCheck,
} from './create-structured-value-rung.ts';
import type { RepositoryReader } from './repository-reader.ts';

const AT = toTimestamp(new Date('2026-01-10'));
const PATH = 'settings.txt';

/** A fact whose predicate the check below reads. */
function factWith(predicate: string): FactWithSources {
  return {
    fact: {
      id: 'f-1',
      namespace: 'repo:shop-api',
      subjectEntityId: 'e-shop',
      predicate,
      object: { kind: 'value', value: '1' },
      statement: 'The level is 1.',
      confidence: 0.9,
      validFrom: null,
      validTo: null,
      createdAt: AT,
      invalidatedAt: null,
      supersededByFactId: null,
      purgedAt: null,
    },
    subject: {
      id: 'e-shop',
      namespace: 'repo:shop-api',
      type: 'repository',
      name: 'shop-api',
      createdAt: AT,
    },
    objectEntity: null,
    sources: [],
    archivedAt: null,
  };
}

/** Reads `level=<value>` from a text; `broken` makes it unreadable. */
const LEVEL_CHECK: StructuredCheck = {
  readValue: (_found, text): CheckedValue => {
    if (text.includes('broken')) return { kind: 'unreadable' };
    const match = /level=(\S+)/.exec(text);
    return { kind: 'value', value: match?.[1] ?? null };
  },
  describeSuccessor: (_found, value) => `The level is ${value}.`,
};

/** Commits in order: the anchor, then each later commit with its text and committer time. */
function repository(
  history: readonly { readonly commit: string; readonly text: string; readonly day: string }[],
): RepositoryReader {
  const byCommit = new Map(history.map((entry) => [entry.commit, entry]));
  const head = history.at(-1)?.commit ?? 'none';
  return {
    readHead: async () => ok(head),
    isAncestorOfHead: async () => ok(true),
    pathExists: async () => ok(true),
    readContentId: async (commit) => ok(commit),
    readText: async (commit) => ok(byCommit.get(commit)?.text ?? null),
    findRenamedPath: async () => ok(null),
    listCommitsTouching: async () =>
      ok(history.slice(1).map(({ commit, day }) => ({ commit, committedAt: toTimestamp(new Date(day)) }))),
  };
}

function check(predicate: string, history: Parameters<typeof repository>[0]) {
  const reader = repository(history);
  return createStructuredValueRung({ has_level: LEVEL_CHECK }).check({
    found: factWith(predicate),
    anchor: { path: PATH, commit: 'c-1' },
    head: history.at(-1)?.commit ?? 'none',
    repository: reader,
  });
}

describe('the structured value rung', () => {
  it('confirms a fact whose value is the same at HEAD although the file changed', async () => {
    const result = await check('has_level', [
      { commit: 'c-1', text: 'level=1\n', day: '2026-01-10' },
      { commit: 'c-2', text: 'level=1\nname=shop\n', day: '2026-02-01' },
    ]);

    expect(result).toEqual(
      ok({ outcome: 'confirmed', method: 'deterministic', successor: null, note: null }),
    );
  });

  it('contradicts a fact whose value changed, naming the new value and the first commit in which it differs', async () => {
    const result = await check('has_level', [
      { commit: 'c-1', text: 'level=1\n', day: '2026-01-10' },
      { commit: 'c-2', text: 'level=1\nname=shop\n', day: '2026-02-01' },
      { commit: 'c-3', text: 'level=2\nname=shop\n', day: '2026-03-01' },
      { commit: 'c-4', text: 'level=2\nname=shop-api\n', day: '2026-04-01' },
    ]);

    expect(result).toEqual(
      ok({
        outcome: 'contradicted',
        method: 'deterministic',
        note: null,
        successor: {
          value: '2',
          statement: 'The level is 2.',
          changedAt: toTimestamp(new Date('2026-03-01')),
        },
      }),
    );
  });

  it('contradicts a fact whose value is gone at HEAD, with no successor', async () => {
    const result = await check('has_level', [
      { commit: 'c-1', text: 'level=1\n', day: '2026-01-10' },
      { commit: 'c-2', text: 'name=shop\n', day: '2026-02-01' },
    ]);

    expect(result).toEqual(
      ok({ outcome: 'contradicted', method: 'deterministic', successor: null, note: null }),
    );
  });

  it('decides nothing for a predicate the domain has no check for', async () => {
    const result = await check('deploys_to', [
      { commit: 'c-1', text: 'level=1\n', day: '2026-01-10' },
      { commit: 'c-2', text: 'level=2\n', day: '2026-02-01' },
    ]);

    expect(result).toEqual(ok(null));
  });

  it('decides nothing when the file cannot be read at HEAD', async () => {
    const result = await check('has_level', [
      { commit: 'c-1', text: 'level=1\n', day: '2026-01-10' },
      { commit: 'c-2', text: 'broken {\n', day: '2026-02-01' },
    ]);

    expect(result).toEqual(ok(null));
  });
});
