// Property-based tests of the rules of memory. Where the contract suite checks chosen
// examples, these check invariants against generated sequences of changes. A failure prints
// its seed and the shortest sequence that still fails; add that sequence to the contract suite.
import type { Fact, FactWithSources, MemoryStore, TimeFilter } from '@factloom/core';
import { createInMemoryStore, matchesTimeFilter, periodsOverlap } from '@factloom/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allFacts,
  commitTime,
  PREDICATES,
  PROPERTY_NAMESPACE,
  type Step,
  seedChangeSet,
  sequenceArbitrary,
  toChangeSet,
  VALID_DAY_RANGE,
  validDay,
} from './change-sequence-generator.ts';

/** Fixed, so that every run generates the same sequences. Change it to explore others. */
const SEED = 20261115;
const RUNS = 300;
const SETTINGS = { seed: SEED, numRuns: RUNS } as const;

async function createSeededStore(): Promise<MemoryStore> {
  const store = createInMemoryStore();
  const seeded = await store.commit(seedChangeSet());
  if (!seeded.ok) throw new Error(seeded.error.message);
  return store;
}

const factsOf = (found: readonly FactWithSources[]): Fact[] => found.map((entry) => entry.fact);

/** The rules that must hold for everything memory holds, whatever sequence led there. */
function checkRulesOfMemory(
  before: readonly FactWithSources[],
  after: readonly FactWithSources[],
  accepted: boolean,
): void {
  const afterById = new Map(after.map((entry) => [entry.fact.id, entry.fact]));

  // Nothing is ever removed.
  expect(after.length).toBeGreaterThanOrEqual(before.length);
  for (const { fact: old } of before) {
    const now = afterById.get(old.id);
    expect(now, `the fact ${old.id} is gone`).toBeDefined();
    if (now === undefined) continue;
    // A fact changes only by being invalidated, once.
    const { invalidatedAt: oldInvalidatedAt, supersededByFactId: oldLink, ...oldRest } = old;
    const { invalidatedAt: newInvalidatedAt, supersededByFactId: newLink, ...newRest } = now;
    expect(newRest).toEqual(oldRest);
    if (oldInvalidatedAt !== null) {
      expect(newInvalidatedAt).toBe(oldInvalidatedAt);
      expect(newLink).toBe(oldLink);
    }
  }

  // The single-value rule.
  const singleValued: ReadonlySet<string> = new Set(
    PREDICATES.filter((predicate) => predicate.singleValued).map((predicate) => predicate.name),
  );
  const live = factsOf(after).filter(
    (fact) => fact.invalidatedAt === null && singleValued.has(fact.predicate),
  );
  for (const first of live) {
    for (const second of live) {
      if (
        first.id >= second.id ||
        first.subjectEntityId !== second.subjectEntityId ||
        first.predicate !== second.predicate
      )
        continue;
      expect(
        periodsOverlap(first, second),
        `${first.id} and ${second.id} overlap for ${first.predicate}`,
      ).toBe(false);
    }
  }

  // Every fact has a source, and a valid period that is not empty or reversed.
  for (const { fact, sources } of after) {
    expect(sources.length, `the fact ${fact.id} has no source`).toBeGreaterThan(0);
    if (fact.validFrom !== null && fact.validTo !== null) expect(fact.validFrom < fact.validTo).toBe(true);
    if (fact.supersededByFactId !== null) {
      expect(fact.invalidatedAt).not.toBeNull();
      expect(afterById.has(fact.supersededByFactId)).toBe(true);
    }
  }

  // A refused commit changes nothing.
  if (!accepted) expect(after).toEqual(before);
}

/** Applies a sequence step by step, and hands each state to `afterEachCommit`. */
async function run(
  steps: readonly Step[],
  afterEachCommit: (state: {
    store: MemoryStore;
    index: number;
    before: readonly FactWithSources[];
    after: readonly FactWithSources[];
    accepted: boolean;
  }) => Promise<void>,
): Promise<void> {
  const store = await createSeededStore();
  try {
    let before = await allFacts(store);
    for (const [position, step] of steps.entries()) {
      const index = position + 1;
      const result = await store.commit(toChangeSet(step, index, factsOf(before)));
      const after = await allFacts(store);
      await afterEachCommit({ store, index, before, after, accepted: result.ok });
      before = after;
    }
  } finally {
    await store.close();
  }
}

const timeFilterArbitrary = (lastCommit: number): fc.Arbitrary<TimeFilter> =>
  fc.record({
    validAt: fc.integer({ min: -1, max: VALID_DAY_RANGE + 1 }).map(validDay),
    knownAt: fc.integer({ min: 0, max: lastCommit + 1 }).map(commitTime),
  });

async function idsAt(store: MemoryStore, time: TimeFilter): Promise<string[]> {
  const listed = await store.listFacts({
    namespace: PROPERTY_NAMESPACE,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time,
    limit: 10_000,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.map((entry) => entry.fact.id).sort();
}

describe(`the rules of memory, on ${RUNS} generated sequences with seed ${SEED}`, () => {
  it('every commit keeps the rules of memory', async () => {
    let accepted = 0;
    let refused = 0;
    await fc.assert(
      fc.asyncProperty(sequenceArbitrary, async (steps) => {
        await run(steps, async (state) => {
          if (state.accepted) accepted += 1;
          else refused += 1;
          checkRulesOfMemory(state.before, state.after, state.accepted);
        });
      }),
      SETTINGS,
    );
    // The generator must exercise both outcomes, or the property proves less than it seems to.
    expect(accepted).toBeGreaterThan(RUNS);
    expect(refused).toBeGreaterThan(RUNS / 2);
  });

  it('a read by time agrees with the time predicate', async () => {
    await fc.assert(
      fc.asyncProperty(
        sequenceArbitrary,
        fc.array(timeFilterArbitrary(12), { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 1, max: 3 }),
        async (steps, filters, limit) => {
          await run(steps, async ({ store, after }) => {
            for (const time of filters) {
              const expected = factsOf(after)
                .filter((fact) => matchesTimeFilter(fact, time))
                .map((fact) => fact.id)
                .sort();
              expect(await idsAt(store, time)).toEqual(expected);

              // Both lanes return only facts that pass the filter, and never more than the limit.
              const byVector = await store.searchFactsByVector({
                namespace: PROPERTY_NAMESPACE,
                vector: new Float32Array([1, 1, 0, 0]),
                time,
                limit,
              });
              const byKeyword = await store.searchFactsByKeyword({
                namespace: PROPERTY_NAMESPACE,
                text: 'red green blue',
                time,
                limit,
              });
              for (const lane of [byVector, byKeyword]) {
                if (!lane.ok) throw new Error(lane.error.message);
                expect(lane.value.length).toBeLessThanOrEqual(limit);
                expect(lane.value.length).toBe(Math.min(limit, expected.length));
                for (const { fact } of lane.value) expect(expected).toContain(fact.id);
              }
            }
          });
        },
      ),
      SETTINGS,
    );
  });

  it('what was believed at a past date does not change later', async () => {
    await fc.assert(
      fc.asyncProperty(
        sequenceArbitrary,
        fc.integer({ min: -1, max: VALID_DAY_RANGE + 1 }),
        async (steps, validOffset) => {
          const answersThen: { readonly time: TimeFilter; readonly ids: readonly string[] }[] = [];
          await run(steps, async ({ store, index }) => {
            // Every answer recorded at an earlier commit must still be the answer now.
            for (const earlier of answersThen) expect(await idsAt(store, earlier.time)).toEqual(earlier.ids);
            const time: TimeFilter = { validAt: validDay(validOffset), knownAt: commitTime(index) };
            answersThen.push({ time, ids: await idsAt(store, time) });
          });
        },
      ),
      SETTINGS,
    );
  });
});
