// The verification job of FL-050 as the maintenance command runs it: the jobs the composition
// root builds, the git reader on a fixture repository, and a SQLite file. Each fixture is one
// fact about the database, recorded from docs/database.md at a commit.
import { type MemoryStore, toTimestamp } from '@factloom/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanUpFixtures,
  factRows,
  NAMESPACE,
  newPlainDirectory,
  newRepository,
  openStore,
  PATH,
  recordAnchoredFact,
  runOn,
  verificationsOf,
} from './testing/maintenance-fixture.ts';

afterEach(cleanUpFixtures);

/** The triggers of the audit entries the runs wrote: those other than the recording. */
async function verificationTriggers(store: MemoryStore, factId: string) {
  const listed = await store.listAuditEntries({ namespace: NAMESPACE, targetKind: 'fact', targetId: factId });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.filter((entry) => entry.operation === 'verification').map((entry) => entry.trigger);
}

describe('the verification job on a git repository', () => {
  it('flags a fact whose file a later commit deleted, records source_missing, and leaves it live and current', async () => {
    const store = await openStore();
    const repository = newRepository();
    const anchor = repository.commit({ [PATH]: 'PostgreSQL 16\n' }, 'Add the database note');
    const factId = await recordAnchoredFact(store, anchor);
    repository.commit({ [PATH]: null }, 'Remove the database note');
    const before = await factRows(store);

    const report = await runOn('2026-03-01', store, repository.directory);

    expect(report.jobs[0]).toEqual({
      name: 'verify_anchored_facts',
      status: 'ok',
      error: null,
      examined: 1,
      changed: 0,
      flagged: 1,
      failed: 0,
      flaggedItems: [{ id: factId, reason: 'source_missing' }],
    });
    expect(await verificationsOf(store, factId)).toEqual(['source_missing']);
    const orphaned = await store.listOrphanedFacts({ namespace: NAMESPACE, limit: 10 });
    expect(orphaned.ok && orphaned.value.map(({ fact }) => fact.id)).toEqual([factId]);
    const current = await store.listFacts({
      namespace: NAMESPACE,
      subjectEntityId: null,
      predicate: null,
      touchingEntityIds: null,
      supersededByFactId: null,
      time: { validAt: toTimestamp(new Date('2026-03-01')), knownAt: toTimestamp(new Date('2026-03-01')) },
      limit: 10,
    });
    expect(current.ok && current.value.map(({ fact }) => fact.id)).toEqual([factId]);
    expect(await factRows(store)).toEqual(before);
    expect(await verificationTriggers(store, factId)).toEqual(['maintenance']);
  });

  it('confirms a fact whose file is unchanged, and a second run inside the interval examines nothing', async () => {
    const store = await openStore();
    const repository = newRepository();
    const anchor = repository.commit({ [PATH]: 'PostgreSQL 16\n' }, 'Add the database note');
    const factId = await recordAnchoredFact(store, anchor);
    repository.commit({ 'README.md': 'shop-api\n' }, 'Add a readme');
    const before = await factRows(store);

    await runOn('2026-03-01', store, repository.directory);
    const second = await runOn('2026-03-03', store, repository.directory);

    expect(await verificationsOf(store, factId)).toEqual(['confirmed']);
    expect(second.jobs[0]?.examined).toBe(0);
    expect(await factRows(store)).toEqual(before);
    expect(await verificationTriggers(store, factId)).toEqual(['maintenance']);
  });

  it('records nothing for a fact anchored at a commit that is not an ancestor of HEAD', async () => {
    const store = await openStore();
    const repository = newRepository();
    repository.commit({ [PATH]: 'PostgreSQL 14\n' }, 'Add the database note');
    repository.git('checkout', '--quiet', '-b', 'other');
    const elsewhere = repository.commit({ [PATH]: 'PostgreSQL 16\n' }, 'Upgrade on another branch');
    repository.git('checkout', '--quiet', 'main');
    const factId = await recordAnchoredFact(store, elsewhere);
    const before = await factRows(store);

    const report = await runOn('2026-03-01', store, repository.directory);

    expect(report.jobs[0]).toMatchObject({ status: 'ok', examined: 1, changed: 0, flagged: 0 });
    expect(await verificationsOf(store, factId)).toEqual([]);
    expect(await factRows(store)).toEqual(before);
  });

  it('records inconclusive for a fact whose file a later commit edited, and changes no fact', async () => {
    const store = await openStore();
    const repository = newRepository();
    const anchor = repository.commit({ [PATH]: 'PostgreSQL 16\n' }, 'Add the database note');
    const factId = await recordAnchoredFact(store, anchor);
    repository.commit({ [PATH]: 'PostgreSQL 17\n' }, 'Upgrade the database');
    const before = await factRows(store);

    await runOn('2026-03-01', store, repository.directory);

    expect(await verificationsOf(store, factId)).toEqual(['inconclusive']);
    expect(await factRows(store)).toEqual(before);
    expect(await verificationTriggers(store, factId)).toEqual(['maintenance']);
  });

  it('reports both jobs as failed in a directory that is not a git repository, and changes nothing', async () => {
    const store = await openStore();
    const repository = newRepository();
    const anchor = repository.commit({ [PATH]: 'PostgreSQL 16\n' }, 'Add the database note');
    const factId = await recordAnchoredFact(store, anchor);
    const notARepository = newPlainDirectory();
    const before = await factRows(store);

    const report = await runOn('2026-03-01', store, notARepository);

    expect(report.jobs).toMatchObject([
      { name: 'verify_anchored_facts', status: 'failed', error: 'invalid_input' },
      { name: 'repair_moved_anchors', status: 'failed', error: 'invalid_input' },
      { name: 'find_duplicate_entities', status: 'ok' },
    ]);
    expect(await verificationsOf(store, factId)).toEqual([]);
    expect(await factRows(store)).toEqual(before);
  });
});
