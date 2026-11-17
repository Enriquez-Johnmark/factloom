import { type FactWithSources, ok, toTimestamp } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { createNameCheckRung } from './create-name-check-rung.ts';
import type { RepositoryReader } from './repository-reader.ts';

const AT = toTimestamp(new Date('2026-01-10'));

/** A fact about a symbol, built by hand: the rung reads only what `namesToFind` returns. */
const FOUND: FactWithSources = {
  fact: {
    id: 'f-1',
    namespace: 'repo:shop-api',
    subjectEntityId: 'e-parse',
    predicate: 'described_as',
    object: { kind: 'value', value: 'parses a calendar date' },
    statement: 'parseDate parses a calendar date.',
    confidence: 0.9,
    validFrom: null,
    validTo: null,
    createdAt: AT,
    invalidatedAt: null,
    supersededByFactId: null,
    purgedAt: null,
  },
  subject: { id: 'e-parse', namespace: 'repo:shop-api', type: 'symbol', name: 'parseDate', createdAt: AT },
  objectEntity: null,
  sources: [],
  archivedAt: null,
};

/** A repository whose file at HEAD holds `text`, and that records each path it was asked to read. */
function repositoryWith(text: string, read: string[]): RepositoryReader {
  return {
    readHead: async () => ok('c-head'),
    isAncestorOfHead: async () => ok(true),
    pathExists: async () => ok(true),
    readContentId: async () => ok('blob'),
    readText: async (_commit, path) => {
      read.push(path);
      return ok(text);
    },
    findRenamedPath: async () => ok(null),
  };
}

function check(names: readonly string[], text: string, read: string[] = []) {
  return createNameCheckRung(() => names).check({
    found: FOUND,
    anchor: { path: 'src/dates.ts', commit: 'c-anchor' },
    head: 'c-head',
    repository: repositoryWith(text, read),
  });
}

describe('the name check rung', () => {
  it('decides contradicted when a name is no longer in the file at HEAD', async () => {
    expect(await check(['parseDate'], 'export function toTimestamp() {}\n')).toEqual(ok('contradicted'));
  });

  it('decides contradicted when only a longer name holds it', async () => {
    expect(await check(['parseDate'], 'export function parseDateInput() {}\n')).toEqual(ok('contradicted'));
  });

  it('leaves the decision to the next rung when every name is found', async () => {
    expect(await check(['parseDate'], 'export function parseDate() {}\n')).toEqual(ok(null));
  });

  it('reads nothing and decides nothing for a fact that names no symbol', async () => {
    const read: string[] = [];

    expect(await check([], 'anything', read)).toEqual(ok(null));
    expect(read).toEqual([]);
  });
});
