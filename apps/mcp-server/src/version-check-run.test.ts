// The version check of FL-062 in the verification job, as the maintenance command runs it, on
// fixture repositories whose commits have their own dates, and a SQLite file.
import { type MemoryStore, type TimeFilter, toTimestamp } from '@kronomind/core';
import { softwareDevelopmentDomain } from '@kronomind/graph-rag';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanUpFixtures,
  factRows,
  NAMESPACE,
  newRepository,
  openStore,
  recordAnchoredFact,
  recordVersionFact,
  runOn,
} from './testing/maintenance-fixture.ts';

afterEach(cleanUpFixtures);

const FIRST_DATE = '2026-01-05T09:00:00Z';
const SECOND_DATE = '2026-02-14T10:30:00Z';

function manifest(dependencies: Readonly<Record<string, string>>, name = 'shop-api'): string {
  return `${JSON.stringify({ name, devDependencies: dependencies }, null, 2)}\n`;
}

async function verificationsOf(store: MemoryStore, factId: string) {
  const listed = await store.listVerifications({ namespace: NAMESPACE, factId });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.map((verification) => [verification.outcome, verification.method]);
}

/** The version facts about vitest under a time filter, as [value, validTo]. */
async function vitestVersions(store: MemoryStore, time: TimeFilter) {
  const listed = await store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: 'dependency-vitest',
    predicate: 'pins_version',
    touchingEntityIds: null,
    supersededByFactId: null,
    time,
    limit: 10,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.map(({ fact, sources }) => ({
    value: fact.object.kind === 'value' ? fact.object.value : null,
    validTo: fact.validTo,
    sources: sources.map((source) => [source.kind, source.locator, source.version]),
  }));
}

/** vitest 5.0.0 in the manifest at the first commit, a fact about it, then a second commit. */
async function changeTheManifest(second: string) {
  const store = await openStore();
  const repository = newRepository();
  const anchor = repository.commit(
    { 'package.json': manifest({ vitest: '5.0.0' }) },
    'Pin vitest',
    FIRST_DATE,
  );
  const factId = await recordVersionFact(store, anchor, 'vitest', '5.0.0');
  const head = repository.commit({ 'package.json': second }, 'Change the manifest', SECOND_DATE);
  return { store, repository, factId, head };
}

const at = (date: string) => toTimestamp(new Date(date));

describe('the version check on a git repository', () => {
  it('ends the fact at the committer time of the commit that changed the version, and records the new version from the manifest', async () => {
    const { store, repository, factId, head } = await changeTheManifest(manifest({ vitest: '5.1.0' }));

    const report = await runOn('2026-03-01', store, repository.directory);

    expect(report.jobs[0]).toMatchObject({
      name: 'verify_anchored_facts',
      changed: 1,
      flagged: 0,
      failed: 0,
    });
    expect(await verificationsOf(store, factId)).toEqual([['contradicted', 'deterministic']]);
    const now = { validAt: at('2026-03-01'), knownAt: at('2026-03-01') };
    expect(await vitestVersions(store, now)).toEqual([
      { value: '5.1.0', validTo: null, sources: [['file', 'package.json', head]] },
    ]);
    const audit = await store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'fact',
      targetId: factId,
    });
    const changes = audit.ok ? audit.value.filter((entry) => entry.operation !== 'remember') : [];
    expect(changes.map((entry) => [entry.operation, entry.trigger])).toEqual([
      ['verification', 'maintenance'],
      ['succession', 'maintenance'],
    ]);
    expect(changes.at(-1)?.reasonCode).toBe('source_changed');
  });

  it('answers the past afterwards: the old version as of a date between the commits, and as current when known at a date before the run', async () => {
    const { store, repository } = await changeTheManifest(manifest({ vitest: '5.1.0' }));
    await runOn('2026-03-01', store, repository.directory);

    const between = await vitestVersions(store, { validAt: at('2026-02-01'), knownAt: at('2026-03-01') });
    const believedBefore = await vitestVersions(store, {
      validAt: at('2026-02-20'),
      knownAt: at('2026-02-20'),
    });

    expect(between.map((fact) => [fact.value, fact.validTo])).toEqual([['5.0.0', at(SECOND_DATE)]]);
    expect(believedBefore.map((fact) => [fact.value, fact.validTo])).toEqual([['5.0.0', null]]);
  });

  it('confirms a fact whose version is the same after another line of the manifest changed, and changes no fact', async () => {
    const { store, repository, factId } = await changeTheManifest(
      manifest({ vitest: '5.0.0' }, 'shop-api-renamed'),
    );
    const before = await factRows(store);

    await runOn('2026-03-01', store, repository.directory);

    expect(await verificationsOf(store, factId)).toEqual([['confirmed', 'deterministic']]);
    expect(await factRows(store)).toEqual(before);
  });

  it('flags a fact whose dependency was removed, and leaves it live', async () => {
    const { store, repository, factId } = await changeTheManifest(manifest({ zod: '4.6.7' }));
    const before = await factRows(store);

    const report = await runOn('2026-03-01', store, repository.directory);

    expect(await verificationsOf(store, factId)).toEqual([['contradicted', 'deterministic']]);
    expect(report.jobs[0]).toMatchObject({
      flagged: 1,
      flaggedItems: [{ id: factId, reason: 'contradicted' }],
    });
    expect(await factRows(store)).toEqual(before);
  });

  it('records inconclusive for a changed file whose fact has no structured check', async () => {
    const store = await openStore();
    const repository = newRepository();
    const anchor = repository.commit({ 'docs/database.md': 'PostgreSQL 16\n' }, 'Add the note', FIRST_DATE);
    const factId = await recordAnchoredFact(store, anchor);
    repository.commit({ 'docs/database.md': 'PostgreSQL 17\n' }, 'Edit the note', SECOND_DATE);
    const before = await factRows(store);

    await runOn('2026-03-01', store, repository.directory);

    expect(await verificationsOf(store, factId)).toEqual([['inconclusive', 'deterministic']]);
    expect(await factRows(store)).toEqual(before);
  });

  it('under human_approval records contradicted, changes no fact and flags it', async () => {
    const { store, repository, factId } = await changeTheManifest(manifest({ vitest: '5.1.0' }));
    const before = await factRows(store);

    const report = await runOn('2026-03-01', store, repository.directory, {
      ...softwareDevelopmentDomain,
      correctionPolicy: 'human_approval',
    });

    expect(await verificationsOf(store, factId)).toEqual([['contradicted', 'deterministic']]);
    expect(report.jobs[0]).toMatchObject({ changed: 0, flagged: 1 });
    expect(await factRows(store)).toEqual(before);
  });

  it('changes nothing on a second run: the successor is anchored at HEAD and not yet due', async () => {
    const { store, repository } = await changeTheManifest(manifest({ vitest: '5.1.0' }));
    await runOn('2026-03-01', store, repository.directory);
    const afterFirst = await factRows(store);

    const second = await runOn('2026-03-02', store, repository.directory);

    expect(second.jobs[0]).toMatchObject({ changed: 0, flagged: 0 });
    expect(await factRows(store)).toEqual(afterFirst);
  });
});
