// The anchor repair job of FL-054 after the verification job of FL-050, as the maintenance
// command runs them, on fixture repositories and a SQLite file.
import type { MemoryStore } from '@factloom/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanUpFixtures,
  factRows,
  NAMESPACE,
  newRepository,
  openStore,
  PATH,
  recordAnchoredFact,
  runOn,
  verificationsOf,
} from './testing/maintenance-fixture.ts';

afterEach(cleanUpFixtures);

const TEXT = 'PostgreSQL 16 is the database.\nIt listens on port 5432.\nBackups run nightly.\n';

async function sourcesOf(store: MemoryStore, factId: string) {
  const found = await store.getFact({ namespace: NAMESPACE, factId });
  if (!found.ok || found.value === null) throw new Error(`No fact ${factId}.`);
  return found.value.sources.map((source) => [source.kind, source.locator, source.version]);
}

async function orphanedIds(store: MemoryStore) {
  const listed = await store.listOrphanedFacts({ namespace: NAMESPACE, limit: 10 });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.map(({ fact }) => fact.id);
}

/** The reason codes and triggers of the entries the repair wrote: every entry after the verification's. */
async function repairEntries(store: MemoryStore, factId: string) {
  const listed = await store.listAuditEntries({ namespace: NAMESPACE, targetKind: 'fact', targetId: factId });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value
    .filter((entry) => entry.reasonCode === 'anchor_moved')
    .map((entry) => [entry.action, entry.trigger, entry.reasonCode]);
}

/** A fact anchored to the file, and a later commit that moves it as `move` says. */
async function moveAnchoredFile(move: (repository: ReturnType<typeof newRepository>) => void) {
  const store = await openStore();
  const repository = newRepository();
  const anchor = repository.commit({ [PATH]: TEXT }, 'Add the database note');
  const factId = await recordAnchoredFact(store, anchor);
  move(repository);
  const head = repository.git('rev-parse', 'HEAD');
  return { store, repository, factId, head };
}

describe('the anchor repair job on a git repository', () => {
  it('gives a fact whose file was renamed a source at the new path, keeps its identifier, and confirms it', async () => {
    const { store, repository, factId, head } = await moveAnchoredFile((repository) => {
      repository.git('mv', PATH, 'docs/storage.md');
      repository.commit({}, 'Rename the note');
    });
    const before = await factRows(store);

    const report = await runOn('2026-03-01', store, repository.directory);

    expect(report.jobs.map((job) => [job.name, job.status, job.changed, job.flagged])).toEqual([
      ['verify_anchored_facts', 'ok', 0, 1],
      ['repair_moved_anchors', 'ok', 1, 0],
      ['find_duplicate_entities', 'ok', 0, 0],
      ['archive_unused_facts', 'ok', 0, 0],
    ]);
    expect(await sourcesOf(store, factId)).toEqual([
      ['file', PATH, expect.any(String)],
      ['file', 'docs/storage.md', head],
    ]);
    expect(await verificationsOf(store, factId)).toEqual(['source_missing', 'confirmed']);
    expect(await orphanedIds(store)).toEqual([]);
    expect(await factRows(store)).toEqual(before);
    expect(await repairEntries(store, factId)).toEqual([
      ['fact.source_attached', 'maintenance', 'anchor_moved'],
      ['fact.verified', 'maintenance', 'anchor_moved'],
    ]);
  });

  it('records inconclusive for a file renamed and edited in one commit, and takes it off the orphaned list', async () => {
    const { store, repository, factId } = await moveAnchoredFile((repository) => {
      repository.git('mv', PATH, 'docs/storage.md');
      repository.commit({ 'docs/storage.md': `${TEXT}Restores are tested weekly.\n` }, 'Rename and extend');
    });

    await runOn('2026-03-01', store, repository.directory);

    expect(await verificationsOf(store, factId)).toEqual(['source_missing', 'inconclusive']);
    expect(await orphanedIds(store)).toEqual([]);
  });

  it('follows a file renamed twice to its final path', async () => {
    const { store, repository, factId, head } = await moveAnchoredFile((repository) => {
      repository.git('mv', PATH, 'docs/storage.md');
      repository.commit({}, 'First rename');
      // Removed and written again with the same text: git reports it as a rename.
      repository.commit({ 'docs/storage.md': null, 'notes/database.md': TEXT }, 'Second rename');
    });

    await runOn('2026-03-01', store, repository.directory);

    expect((await sourcesOf(store, factId)).at(-1)).toEqual(['file', 'notes/database.md', head]);
  });

  it('attaches no source to a fact whose file was deleted, and leaves it flagged and orphaned', async () => {
    const { store, repository, factId } = await moveAnchoredFile((repository) => {
      repository.commit({ [PATH]: null }, 'Remove the note');
    });
    const before = await factRows(store);

    const report = await runOn('2026-03-01', store, repository.directory);

    expect(report.jobs[1]).toMatchObject({
      name: 'repair_moved_anchors',
      changed: 0,
      flagged: 1,
      flaggedItems: [{ id: factId, reason: 'source_missing' }],
    });
    expect(await sourcesOf(store, factId)).toHaveLength(1);
    expect(await orphanedIds(store)).toEqual([factId]);
    expect(await factRows(store)).toEqual(before);
    expect(await repairEntries(store, factId)).toEqual([]);
  });

  it('attaches no further source and writes no audit entry on a second run over a renamed file', async () => {
    const { store, repository, factId } = await moveAnchoredFile((repository) => {
      repository.git('mv', PATH, 'docs/storage.md');
      repository.commit({}, 'Rename the note');
    });
    await runOn('2026-03-01', store, repository.directory);
    const sources = await sourcesOf(store, factId);
    const entries = await store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'fact',
      targetId: factId,
    });

    await runOn('2026-03-02', store, repository.directory);

    expect(await sourcesOf(store, factId)).toEqual(sources);
    expect(
      await store.listAuditEntries({ namespace: NAMESPACE, targetKind: 'fact', targetId: factId }),
    ).toEqual(entries);
  });
});
