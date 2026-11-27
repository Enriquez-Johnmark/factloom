// Adapter tests of the keyword lane on FTS5: what the contract cases K1 to K5 do not cover.
import type { Change, MemoryStore } from '@kronomind/core';
import { afterEach, describe, expect, it } from 'vitest';
import { at, changeSet, entity, fact, NAMESPACE, recordFact, source } from './memory-store-contract.ts';
import { closeTestStores, openOnFile } from './sqlite-test-store.ts';

afterEach(closeTestStores);

const NOW = at('2026-11-16');
const now = { validAt: NOW, knownAt: NOW };

/** A fact with the given statement. Each has its own predicate, so no two conflict. */
function statement(id: string, text: string, fields: Parameters<typeof fact>[3] = {}): Change {
  return recordFact(fact(id, `note_${id}`, id, { statement: text, ...fields }), { singleValued: false });
}

/** A store holding one repository, one source and the given facts. */
async function openWith(...facts: readonly Change[]): Promise<MemoryStore> {
  const { store } = openOnFile();
  const committed = await store.commit(
    changeSet('op-1', '2026-01-10', [
      { kind: 'create_entity', entity: entity('e-repo', 'example') },
      { kind: 'record_source', source: source('s-1', '2026-01-10', 'Notes.') },
      ...facts,
    ]),
  );
  if (!committed.ok) throw new Error(committed.error.message);
  return store;
}

async function search(store: MemoryStore, text: string, limit = 10, time = now): Promise<string[]> {
  const found = await store.searchFactsByKeyword({ namespace: NAMESPACE, text, time, limit });
  if (!found.ok) throw new Error(`${found.error.code}: ${found.error.message}`);
  return found.value.map((result) => result.fact.id);
}

describe('the keyword lane on SQLite', () => {
  it('applies the time filter before the limit', async () => {
    // Asked as of now and known now, with a limit of 1. The two stronger matches ended in 2026.
    const ended = { validTo: at('2026-03-01') };
    const store = await openWith(
      statement('strong', 'pnpm pnpm pnpm is the package manager', ended),
      statement('medium', 'pnpm pnpm runs the scripts of the repository', ended),
      statement('weak', 'The repository once considered pnpm among several other package managers and tools'),
    );

    expect(await search(store, 'pnpm', 1)).toEqual(['weak']);
    expect(await search(store, 'pnpm', 1, { validAt: at('2026-02-01'), knownAt: NOW })).not.toEqual(['weak']);
  });

  it.each([
    ['a double quote', 'the "package manager'],
    ['an asterisk', 'pack* manager'],
    ['a leading minus', '-package manager'],
    ['a colon', 'statement:package manager'],
    ['parentheses', '(package) manager )('],
    ['a caret', '^package manager'],
    ['the word AND', 'package AND manager'],
    ['the word OR', 'package OR OR manager'],
    ['the word NOT', 'NOT package'],
    ['the word NEAR', 'NEAR(package manager, 2)'],
    ['only operators', '* - : ( ) " AND'],
  ])('reads query operators as plain words: %s', async (_name, text) => {
    const store = await openWith(statement('pnpm', 'The package manager is pnpm'));

    const found = await store.searchFactsByKeyword({ namespace: NAMESPACE, text, time: now, limit: 10 });

    expect(found.ok).toBe(true);
  });

  it('finds a statement by an identifier with an underscore', async () => {
    const store = await openWith(
      statement('repository', 'Users are loaded through user_repository in the data layer'),
      statement('other', 'The user interface is written in React'),
    );

    expect((await search(store, 'user_repository'))[0]).toBe('repository');
  });

  it('finds a statement by a package name with a hyphen', async () => {
    const store = await openWith(
      statement('driver', 'The SQLite driver is better-sqlite3'),
      statement('other', 'The search uses FTS5'),
    );

    expect(await search(store, 'better-sqlite3')).toEqual(['driver']);
    expect(await search(store, 'which driver? better-sqlite3 13.1.1')).toEqual(['driver']);
  });

  it('finds a fact when only some words of the question are in its statement', async () => {
    const store = await openWith(statement('pnpm', 'The package manager is pnpm'));

    expect(await search(store, 'which package manager does this project use')).toEqual(['pnpm']);
  });

  it('ranks a statement with more matching terms first', async () => {
    const store = await openWith(
      statement('one-term', 'The manager of the team reviews every change'),
      statement('two-terms', 'The package manager is pnpm'),
    );

    expect(await search(store, 'package manager')).toEqual(['two-terms', 'one-term']);
  });

  it('finds a copy made by ending a fact', async () => {
    const store = await openWith(
      statement('jest', 'The test framework is Jest', { validFrom: at('2025-06-01') }),
    );
    const ended = await store.commit(
      changeSet(
        'op-2',
        '2026-04-02',
        [
          recordFact(
            fact('jest-ended', 'note_jest', 'jest', {
              statement: 'The test framework is Jest',
              validFrom: at('2025-06-01'),
              validTo: at('2026-03-15'),
              createdAt: at('2026-04-02'),
            }),
            { singleValued: false, embedding: { copyFromFactId: 'jest' } },
          ),
          { kind: 'invalidate_fact', factId: 'jest', supersededByFactId: 'jest-ended' },
        ],
        { operation: 'revision', reasonCode: 'reported_ended' },
      ),
    );
    expect(ended.ok).toBe(true);

    // As of 2026-02-01, inside the copy's valid period, known now: the copy, not the original.
    expect(await search(store, 'jest', 10, { validAt: at('2026-02-01'), knownAt: NOW })).toEqual([
      'jest-ended',
    ]);
    // As of now, known now: the framework is no longer Jest.
    expect(await search(store, 'jest')).toEqual([]);
  });

  it('returns invalid_input for a limit below 1 and an empty list for a text with no term', async () => {
    const store = await openWith(statement('pnpm', 'The package manager is pnpm'));

    const noLimit = await store.searchFactsByKeyword({
      namespace: NAMESPACE,
      text: 'pnpm',
      time: now,
      limit: 0,
    });

    expect(!noLimit.ok && noLimit.error.code).toBe('invalid_input');
    expect(await search(store, '  ')).toEqual([]);
  });
});
