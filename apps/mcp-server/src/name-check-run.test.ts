// The name check of FL-071 in the verification job, as the maintenance command runs it, on
// fixture repositories and a SQLite file.
import type { MemoryStore } from '@factloom/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanUpFixtures,
  factRows,
  NAMESPACE,
  newRepository,
  openStore,
  recordAnchoredFact,
  recordSymbolFact,
  runOn,
} from './testing/maintenance-fixture.ts';

afterEach(cleanUpFixtures);

const FILE = 'src/dates.ts';
const BOTH =
  'export function parseDate(text) {\n  return text;\n}\n\nexport function toTimestamp(date) {\n  return date;\n}\n';

async function verificationsOf(store: MemoryStore, factId: string) {
  const listed = await store.listVerifications({ namespace: NAMESPACE, factId });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.map((verification) => [verification.outcome, verification.method]);
}

async function triggersOf(store: MemoryStore, factId: string) {
  const listed = await store.listAuditEntries({ namespace: NAMESPACE, targetKind: 'fact', targetId: factId });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.filter((entry) => entry.operation === 'verification').map((entry) => entry.trigger);
}

/** A fact about parseDate from the file at its first commit, then a commit that writes `later`. */
async function changeTheFile(later: string) {
  const store = await openStore();
  const repository = newRepository();
  const anchor = repository.commit({ [FILE]: BOTH }, 'Add the date helpers');
  const factId = await recordSymbolFact(store, anchor, FILE, 'parseDate');
  repository.commit({ [FILE]: later }, 'Change the date helpers');
  return { store, repository, factId };
}

describe('the name check on a git repository', () => {
  it('records contradicted for a fact about a function that a later commit removed from its file, flags it, and leaves it live', async () => {
    const { store, repository, factId } = await changeTheFile(
      'export function toTimestamp(date) {\n  return date;\n}\n',
    );
    const before = await factRows(store);

    const report = await runOn('2026-03-01', store, repository.directory);

    expect(await verificationsOf(store, factId)).toEqual([['contradicted', 'deterministic']]);
    expect(report.jobs[0]).toMatchObject({
      name: 'verify_anchored_facts',
      flagged: 1,
      flaggedItems: [{ id: factId, reason: 'contradicted' }],
    });
    expect(await factRows(store)).toEqual(before);
    expect(await triggersOf(store, factId)).toEqual(['maintenance']);
  });

  it('records inconclusive when the function is still there and another part of the file changed', async () => {
    const { store, repository, factId } = await changeTheFile(
      BOTH.replace('return date;', 'return new Date(date);'),
    );

    await runOn('2026-03-01', store, repository.directory);

    expect(await verificationsOf(store, factId)).toEqual([['inconclusive', 'deterministic']]);
  });

  it('records contradicted when the file holds only a longer name', async () => {
    const { store, repository, factId } = await changeTheFile(BOTH.replace('parseDate(', 'parseDateInput('));

    await runOn('2026-03-01', store, repository.directory);

    expect(await verificationsOf(store, factId)).toEqual([['contradicted', 'deterministic']]);
  });

  it('leaves a fact that names no symbol to the file-unchanged rung, which records inconclusive', async () => {
    const store = await openStore();
    const repository = newRepository();
    const anchor = repository.commit({ 'docs/database.md': 'PostgreSQL 16\n' }, 'Add the database note');
    const factId = await recordAnchoredFact(store, anchor);
    repository.commit({ 'docs/database.md': 'PostgreSQL 16, tuned.\n' }, 'Edit the note');

    await runOn('2026-03-01', store, repository.directory);

    expect(await verificationsOf(store, factId)).toEqual([['inconclusive', 'deterministic']]);
    expect(await triggersOf(store, factId)).toEqual(['maintenance']);
  });
});
