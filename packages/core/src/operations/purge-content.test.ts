import { describe, expect, it } from 'vitest';
import type { ChangeSet } from '../change-set.ts';
import { createTestDeps, TEST_DOMAIN } from '../create-test-deps.ts';
import { PURGED_MARKER } from '../fact.ts';
import { createInMemoryStore } from '../in-memory-store.ts';
import type { MemoryStore } from '../memory-store.ts';
import { toTimestamp } from '../timestamp.ts';
import { purgeContent } from './purge-content.ts';

const NAMESPACE = 'repo:example';
const MARKER = 'ZEBRA7731';
const purged = { namespace: NAMESPACE, trigger: 'person', reasonCode: 'secret_stored' } as const;
const at = (day: string) => toTimestamp(new Date(`${day}T00:00:00.000Z`));

function source(id: string, content: string, contentHash: string | null, day = '2026-01-10') {
  return {
    id,
    namespace: NAMESPACE,
    kind: 'agent_note',
    locator: null,
    version: null,
    content,
    contentHash,
    observedAt: at(day),
    createdAt: at(day),
    purgedAt: null,
  };
}

function fact(id: string, value: string, day: string, validTo: string | null = null) {
  return {
    id,
    namespace: NAMESPACE,
    subjectEntityId: 'e-repo',
    predicate: 'uses_database_version',
    object: { kind: 'value' as const, value },
    statement: `The deploy key is ${value}`,
    confidence: 0.9,
    validFrom: null,
    validTo: validTo === null ? null : at(validTo),
    createdAt: at(day),
    invalidatedAt: null,
    supersededByFactId: null,
    purgedAt: null,
  };
}

function changeSet(
  operationId: string,
  day: string,
  changes: ChangeSet['changes'],
  explainedBy: string | null,
): ChangeSet {
  return {
    namespace: NAMESPACE,
    operationId,
    operation: 'remember',
    trigger: 'agent',
    reasonCode: 'stated',
    explainedBySourceId: explainedBy,
    occurredAt: at(day),
    changes,
  };
}

/**
 * k-1 from s-1 and s-1b, which hold the same text; k-1 ended as k-1e with the note s-2;
 * feedback on k-1e whose comment s-5 quotes the marker; k-1e corrected by k-2 from s-3; and
 * u-1, unrelated, from s-4.
 */
async function buildMemory(): Promise<MemoryStore> {
  const store = createInMemoryStore();
  const commits: ChangeSet[] = [
    changeSet(
      'op-1',
      '2026-01-10',
      [
        {
          kind: 'create_entity',
          entity: {
            id: 'e-repo',
            namespace: NAMESPACE,
            type: 'repository',
            name: 'example',
            createdAt: at('2026-01-10'),
          },
        },
        { kind: 'record_source', source: source('s-1', `The key is ${MARKER}.`, 'h-1') },
        { kind: 'record_source', source: source('s-1b', `The key is ${MARKER}.`, 'h-1') },
        { kind: 'record_source', source: source('s-4', 'We use pnpm.', 'h-4') },
        {
          kind: 'record_fact',
          fact: fact('k-1', MARKER, '2026-01-10'),
          sourceIds: ['s-1', 's-1b'],
          embedding: new Float32Array([1, 0]),
          singleValued: true,
        },
        {
          kind: 'record_fact',
          fact: { ...fact('u-1', 'pnpm', '2026-01-10'), predicate: 'depends_on', statement: 'We use pnpm' },
          sourceIds: ['s-4'],
          embedding: new Float32Array([0, 1]),
          singleValued: false,
        },
        {
          kind: 'record_fact',
          fact: { ...fact('m-1', 'zod', '2026-01-10'), predicate: 'depends_on', statement: 'We use zod' },
          sourceIds: ['s-1', 's-4'],
          embedding: new Float32Array([1, 1]),
          singleValued: false,
        },
      ],
      's-1',
    ),
    changeSet(
      'op-2',
      '2026-03-02',
      [
        {
          kind: 'record_source',
          source: source('s-2', 'The key was rotated on 1 March.', null, '2026-03-02'),
        },
        {
          kind: 'record_fact',
          fact: fact('k-1e', MARKER, '2026-03-02', '2026-03-01'),
          sourceIds: ['s-1', 's-2'],
          embedding: { copyFromFactId: 'k-1' },
          singleValued: true,
        },
        { kind: 'invalidate_fact', factId: 'k-1', supersededByFactId: 'k-1e' },
      ],
      's-2',
    ),
    changeSet(
      'op-3',
      '2026-03-05',
      [
        { kind: 'record_source', source: source('s-5', `It never was ${MARKER}.`, 'h-5', '2026-03-05') },
        {
          kind: 'record_feedback',
          feedback: {
            id: 'fb-1',
            namespace: NAMESPACE,
            factId: 'k-1e',
            signal: 'wrong',
            trigger: 'agent',
            sourceId: 's-5',
            recordedAt: at('2026-03-05'),
          },
        },
      ],
      's-5',
    ),
    changeSet(
      'op-4',
      '2026-03-10',
      [
        {
          kind: 'record_source',
          source: source('s-3', `Correction: never ${MARKER}; it is KEY-B.`, 'h-3', '2026-03-10'),
        },
        {
          kind: 'record_fact',
          fact: fact('k-2', 'KEY-B', '2026-03-10', '2026-03-01'),
          sourceIds: ['s-3'],
          embedding: new Float32Array([1, 1]),
          singleValued: true,
        },
        { kind: 'invalidate_fact', factId: 'k-1e', supersededByFactId: 'k-2' },
      ],
      's-3',
    ),
  ];
  for (const commit of commits) {
    const result = await store.commit(commit);
    if (!result.ok) throw new Error(result.error.message);
  }
  return store;
}

function depsOn(store: MemoryStore, date = '2026-06-01') {
  let count = 0;
  const newId = (): string => {
    count += 1;
    return `purge-${count}`;
  };
  return createTestDeps({ now: date, domain: TEST_DOMAIN, store, newId });
}

describe('purgeContent', () => {
  it('purges the source, the sources with the same text, the facts from them and every copy, and the sources that explained changes', async () => {
    const store = await buildMemory();

    const result = await purgeContent(depsOn(store), { ...purged, sourceId: 's-1' });

    expect(result.ok && [...result.value.purgedSourceIds].sort()).toEqual([
      's-1',
      's-1b',
      's-2',
      's-3',
      's-5',
    ]);
    expect(result.ok && [...result.value.purgedFactIds].sort()).toEqual(['k-1', 'k-1e']);
    for (const factId of ['k-1', 'k-1e']) {
      const found = await store.getFact({ namespace: NAMESPACE, factId });
      expect(found.ok && found.value?.fact).toMatchObject({
        statement: PURGED_MARKER,
        object: { kind: 'value', value: PURGED_MARKER },
        purgedAt: at('2026-06-01'),
      });
    }
    const note = await store.getSource({ namespace: NAMESPACE, sourceId: 's-5' });
    expect(note.ok && note.value).toMatchObject({ content: PURGED_MARKER, contentHash: null, locator: null });
  });

  it('leaves a fact that came only from an explaining source, as an orphaned fact', async () => {
    const store = await buildMemory();

    await purgeContent(depsOn(store), { ...purged, sourceId: 's-1' });

    const correction = await store.getFact({ namespace: NAMESPACE, factId: 'k-2' });
    expect(correction.ok && correction.value?.fact).toMatchObject({
      statement: 'The deploy key is KEY-B',
      invalidatedAt: null,
      purgedAt: null,
    });
  });

  it('keeps a fact that another source also states', async () => {
    const store = await buildMemory();

    const result = await purgeContent(depsOn(store), { ...purged, sourceId: 's-1' });

    expect(result.ok && result.value.purgedFactIds).not.toContain('m-1');
    const found = await store.getFact({ namespace: NAMESPACE, factId: 'm-1' });
    expect(found.ok && found.value?.fact).toMatchObject({ statement: 'We use zod', purgedAt: null });
  });

  it('invalidates a live fact that it purges', async () => {
    const store = await buildMemory();

    await purgeContent(depsOn(store), { ...purged, sourceId: 's-4' });

    const found = await store.getFact({ namespace: NAMESPACE, factId: 'u-1' });
    expect(found.ok && found.value?.fact.invalidatedAt).toBe(at('2026-06-01'));
    const entries = await store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'fact',
      targetId: 'u-1',
    });
    expect(
      entries.ok && entries.value.filter((entry) => entry.operation === 'purge').map((entry) => entry.action),
    ).toEqual(['fact.invalidated', 'fact.purged']);
  });

  it('changes nothing and writes no audit entry when the source is already purged', async () => {
    const store = await buildMemory();
    await purgeContent(depsOn(store), { ...purged, sourceId: 's-1' });
    const before = await store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'source',
      targetId: 's-1',
    });

    const again = await purgeContent(depsOn(store, '2026-07-01'), { ...purged, sourceId: 's-1' });

    expect(again.ok).toBe(true);
    expect(
      await store.listAuditEntries({ namespace: NAMESPACE, targetKind: 'source', targetId: 's-1' }),
    ).toEqual(before);
  });

  it('returns not_found for a source that does not exist in the namespace', async () => {
    const store = await buildMemory();

    const result = await purgeContent(depsOn(store), { ...purged, namespace: 'repo:other', sourceId: 's-1' });

    expect(result.ok ? null : result.error.code).toBe('not_found');
  });
});
