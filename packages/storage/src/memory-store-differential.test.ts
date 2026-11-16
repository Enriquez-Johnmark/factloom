// Differential tests: the same generated sequences of changes go to the in-memory store and to
// the SQLite adapter, and every read must give the same answer from both. The two are written
// independently, so a difference is a defect in one of them or a gap in INTERFACES.md. A failure
// prints the seed, the shortest sequence that still differs, the read and both answers. Settle
// it in one store or in INTERFACES.md, and add the case to the contract suite.
import type { AuditEntry, CommitReceipt, Fact, MemoryStore, Result, TimeFilter } from '@factloom/core';
import { createInMemoryStore } from '@factloom/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allFacts,
  commitTime,
  PROPERTY_NAMESPACE,
  SUBJECT_IDS,
  type Step,
  seedChangeSet,
  sequenceArbitrary,
  toChangeSet,
  VALID_DAY_RANGE,
  validDay,
} from './change-sequence-generator.ts';
import { openSqliteMemoryStore } from './open-sqlite-memory-store.ts';
import { FIXTURE_MODEL } from './sqlite-test-store.ts';

/** Fixed, so that every run generates the same sequences. Change it to explore others. */
const SEED = 20261116;
const RUNS = 200;
/**
 * The test's own time limit. It takes about 5 seconds here, at the default limit, and timed out
 * once on a Linux runner in continuous integration (run 43800490944).
 */
const TIME_LIMIT = 60_000;
/** Large enough that no read in a generated sequence is cut short, so lanes compare as sets. */
const UNLIMITED = 10_000;

type StorePair = { readonly inMemory: MemoryStore; readonly sqlite: MemoryStore };

async function openSeededPair(): Promise<StorePair> {
  const opened = openSqliteMemoryStore({ path: ':memory:', ...FIXTURE_MODEL });
  if (!opened.ok) throw new Error(opened.error.message);
  const pair = { inMemory: createInMemoryStore(), sqlite: opened.value };
  for (const store of [pair.inMemory, pair.sqlite]) {
    const seeded = await store.commit(seedChangeSet());
    if (!seeded.ok) throw new Error(seeded.error.message);
  }
  return pair;
}

/** What a commit's result must agree on: success, or the error code and the facts in the way. */
function outcomeOf(result: Result<CommitReceipt>) {
  return result.ok
    ? { ok: true, receipt: result.value }
    : { ok: false, code: result.error.code, relatedFactIds: [...result.error.relatedFactIds].sort() };
}

/** Runs the same read on both stores and requires the same answer. */
async function expectSameAnswer<Answer>(
  pair: StorePair,
  read: string,
  ask: (store: MemoryStore) => Promise<Answer>,
): Promise<void> {
  const fromInMemory = await ask(pair.inMemory);
  const fromSqlite = await ask(pair.sqlite);
  expect(fromSqlite, `the SQLite store and the in-memory store differ on ${read}`).toEqual(fromInMemory);
}

const listFactsWith = (time: TimeFilter | 'live' | 'all') => (store: MemoryStore) =>
  store.listFacts({
    namespace: PROPERTY_NAMESPACE,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time,
    limit: UNLIMITED,
  });

/** The identifiers a lane returns, as a set: the two stores rank differently by design (ADR 0017). */
async function laneIds(lane: Promise<Result<readonly { readonly fact: Fact }[]>>): Promise<unknown> {
  const found = await lane;
  return found.ok ? found.value.map(({ fact }) => fact.id).sort() : { code: found.error.code };
}

/** Every read the two stores must agree on, after one commit. */
async function compareReads(
  pair: StorePair,
  state: { readonly facts: readonly Fact[]; readonly lastStep: number },
  times: readonly TimeFilter[],
): Promise<void> {
  const { facts, lastStep } = state;
  await expectSameAnswer(pair, "listFacts with 'all'", listFactsWith('all'));
  await expectSameAnswer(pair, "listFacts with 'live'", listFactsWith('live'));
  for (const time of times) {
    await expectSameAnswer(pair, `listFacts at ${JSON.stringify(time)}`, listFactsWith(time));
    await expectSameAnswer(pair, `the vector lane at ${JSON.stringify(time)}`, (store) =>
      laneIds(
        store.searchFactsByVector({
          namespace: PROPERTY_NAMESPACE,
          vector: new Float32Array([1, 1, 0, 0]),
          time,
          limit: UNLIMITED,
        }),
      ),
    );
    await expectSameAnswer(pair, `the keyword lane at ${JSON.stringify(time)}`, (store) =>
      laneIds(
        store.searchFactsByKeyword({
          namespace: PROPERTY_NAMESPACE,
          text: 'red green blue',
          time,
          limit: UNLIMITED,
        }),
      ),
    );
  }

  for (const factId of [...facts.map((fact) => fact.id), 'missing']) {
    await expectSameAnswer(pair, `getFact ${factId}`, (store) =>
      store.getFact({ namespace: PROPERTY_NAMESPACE, factId }),
    );
    await expectSameAnswer(pair, `the facts superseded by ${factId}`, (store) =>
      store.listFacts({
        namespace: PROPERTY_NAMESPACE,
        subjectEntityId: null,
        predicate: null,
        touchingEntityIds: null,
        supersededByFactId: factId,
        time: 'all',
        limit: UNLIMITED,
      }),
    );
    await expectSameAnswer(pair, `the audit entries of ${factId}`, (store) =>
      auditEntriesOf(store, 'fact', factId),
    );
  }
  for (const entityId of SUBJECT_IDS) {
    await expectSameAnswer(pair, `findEntities ${entityId}`, (store) =>
      store.findEntities({ namespace: PROPERTY_NAMESPACE, name: entityId, type: null }),
    );
    await expectSameAnswer(pair, `the audit entries of ${entityId}`, (store) =>
      auditEntriesOf(store, 'entity', entityId),
    );
  }
  // Every step records its own source, `s-<step>`, which exists only if that commit was accepted.
  const sourceIds = Array.from({ length: lastStep }, (_, position) => `s-${position + 1}`);
  for (const sourceId of [...sourceIds, 'missing']) {
    await expectSameAnswer(pair, `getSource ${sourceId}`, (store) =>
      store.getSource({ namespace: PROPERTY_NAMESPACE, sourceId }),
    );
    await expectSameAnswer(pair, `the audit entries of ${sourceId}`, (store) =>
      auditEntriesOf(store, 'source', sourceId),
    );
  }
}

async function auditEntriesOf(
  store: MemoryStore,
  targetKind: AuditEntry['targetKind'],
  targetId: string,
): Promise<Result<readonly AuditEntry[]>> {
  return store.listAuditEntries({ namespace: PROPERTY_NAMESPACE, targetKind, targetId });
}

const timeFilterArbitrary: fc.Arbitrary<TimeFilter> = fc.record({
  validAt: fc.integer({ min: -1, max: VALID_DAY_RANGE + 1 }).map(validDay),
  knownAt: fc.integer({ min: 0, max: 13 }).map(commitTime),
});

/** How many commits both stores accepted and refused, so the test can show it exercised both. */
const outcomes = { accepted: 0, refused: 0 };

/** Applies a sequence to both stores, comparing every commit's result and then every read. */
async function applyToBoth(steps: readonly Step[], times: readonly TimeFilter[]): Promise<void> {
  const pair = await openSeededPair();
  try {
    for (const [position, step] of steps.entries()) {
      const index = position + 1;
      const facts = (await allFacts(pair.inMemory)).map((entry) => entry.fact);
      const changeSet = toChangeSet(step, index, facts);
      const fromInMemory = outcomeOf(await pair.inMemory.commit(changeSet));
      const fromSqlite = outcomeOf(await pair.sqlite.commit(changeSet));
      expect(fromSqlite, `the SQLite store and the in-memory store differ on commit ${index}`).toEqual(
        fromInMemory,
      );
      if (fromInMemory.ok) outcomes.accepted += 1;
      else outcomes.refused += 1;
      const factsAfter = (await allFacts(pair.inMemory)).map((entry) => entry.fact);
      await compareReads(pair, { facts: factsAfter, lastStep: index }, times);
    }
  } finally {
    await pair.inMemory.close();
    await pair.sqlite.close();
  }
}

describe(`the in-memory store and SQLite, on ${RUNS} generated sequences with seed ${SEED}`, () => {
  it(
    'the in-memory store and SQLite give the same answers',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          sequenceArbitrary,
          fc.array(timeFilterArbitrary, { minLength: 1, maxLength: 3 }),
          async (steps, times) => applyToBoth(steps, times),
        ),
        { seed: SEED, numRuns: RUNS },
      );
      // Both outcomes must come up often, or agreeing on them proves less than it seems to.
      expect(outcomes.accepted).toBeGreaterThan(RUNS);
      expect(outcomes.refused).toBeGreaterThan(RUNS / 2);
    },
    TIME_LIMIT,
  );
});
