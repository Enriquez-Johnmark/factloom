import {
  createTestDeps,
  type Domain,
  type FactId,
  type FeedbackSignal,
  type MemoryStore,
  type OperationDeps,
  recordFacts,
  recordFeedback,
  TEST_DOMAIN,
  toTimestamp,
} from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { actOnFeedback, FEEDBACK_CONFIDENCE_DROP, FEEDBACK_CONFIDENCE_RAISE } from './act-on-feedback.ts';

const NAMESPACE = 'repo:shop-api';
/** The fact is recorded on the first day, and the feedback is given on the second. */
const RECORDED_ON = '2026-01-10';
const FEEDBACK_ON = '2026-04-02';
const FEEDBACK_AT = '2026-04-02T00:00:00.000Z';
const HUMAN_APPROVAL: Domain = { ...TEST_DOMAIN, correctionPolicy: 'human_approval' };

/**
 * A memory holding "shop-api runs on Postgres 15" at the given confidence, and a function
 * that gives deps on that memory with the clock at a date, under one correction policy.
 */
async function recordPostgres(options: {
  readonly domain: Domain;
  readonly confidence: number;
  readonly validTo?: string;
}) {
  let count = 0;
  const newId = () => {
    count += 1;
    return `id-${count}`;
  };
  const first = createTestDeps({ now: RECORDED_ON, domain: options.domain, newId });
  const { store } = first;
  const on = (date: string): OperationDeps =>
    createTestDeps({ now: date, domain: options.domain, store, newId });
  const recorded = await recordFacts(first, {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: {
      kind: 'agent_note',
      locator: null,
      version: null,
      content: 'shop-api runs on Postgres 15.',
      observedAt: first.now(),
    },
    drafts: [
      {
        fact: {
          subjectEntityId: 'e-shop-api',
          predicate: 'uses_database_version',
          object: { kind: 'value', value: 'Postgres 15' },
          statement: 'shop-api runs on Postgres 15.',
          confidence: options.confidence,
          validFrom: null,
          validTo: options.validTo === undefined ? null : toTimestamp(new Date(options.validTo)),
        },
        newEntities: [{ id: 'e-shop-api', type: 'repository', name: 'shop-api' }],
      },
    ],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const factId = recorded.value.factIds[0];
  if (factId === undefined) throw new Error('No fact was recorded.');
  return { store, on, factId };
}

/** Records feedback from an agent on the feedback day, as `giveFeedback` does, and acts on it. */
async function giveAndAct(deps: OperationDeps, factId: FactId, signal: FeedbackSignal) {
  const recorded = await recordFeedback(deps, {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'feedback_given',
    factId,
    signal,
    source: null,
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const followUp = await actOnFeedback(deps, {
    namespace: NAMESPACE,
    factId,
    feedbackId: recorded.value.feedbackId,
  });
  return { feedbackId: recorded.value.feedbackId, followUp };
}

async function readFact(store: MemoryStore, factId: FactId) {
  const found = await store.getFact({ namespace: NAMESPACE, factId });
  if (!found.ok || found.value === null) throw new Error(`No fact ${factId}.`);
  return found.value.fact;
}

/** The audit entries on the fact that the feedback's follow-up wrote. */
async function followUpEntriesOf(store: MemoryStore, factId: FactId) {
  const listed = await store.listAuditEntries({ namespace: NAMESPACE, targetKind: 'fact', targetId: factId });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.filter((entry) => entry.occurredAt === FEEDBACK_AT);
}

describe('actOnFeedback', () => {
  it.each([
    { signal: 'right', policy: TEST_DOMAIN, reasonCode: 'feedback_right' },
    { signal: 'right', policy: HUMAN_APPROVAL, reasonCode: 'feedback_right' },
  ] as const)(
    'raises the confidence by a fixed step on right under $policy.correctionPolicy',
    async ({ signal, policy, reasonCode }) => {
      const { store, on, factId } = await recordPostgres({ domain: policy, confidence: 0.5 });

      const { followUp } = await giveAndAct(on(FEEDBACK_ON), factId, signal);

      expect(followUp).toEqual({ ok: true, value: 'confidence_raised' });
      const fact = await readFact(store, factId);
      expect(fact.confidence).toBeCloseTo(0.5 + FEEDBACK_CONFIDENCE_RAISE);
      expect(fact.invalidatedAt).toBeNull();
      expect(await followUpEntriesOf(store, factId)).toMatchObject([
        {
          action: 'fact.confidence_adjusted',
          operation: 'confidence_adjustment',
          trigger: 'feedback',
          reasonCode,
        },
      ]);
    },
  );

  it.each([
    { signal: 'wrong', reasonCode: 'feedback_wrong' },
    { signal: 'outdated', reasonCode: 'feedback_outdated' },
  ] as const)(
    'lowers the confidence by a fixed step on $signal under human_approval',
    async ({ signal, reasonCode }) => {
      const { store, on, factId } = await recordPostgres({ domain: HUMAN_APPROVAL, confidence: 0.5 });

      const { followUp } = await giveAndAct(on(FEEDBACK_ON), factId, signal);

      expect(followUp).toEqual({ ok: true, value: 'confidence_lowered' });
      const fact = await readFact(store, factId);
      expect(fact.confidence).toBeCloseTo(0.5 - FEEDBACK_CONFIDENCE_DROP);
      expect(fact.invalidatedAt).toBeNull();
      expect(fact.validTo).toBeNull();
      expect(await followUpEntriesOf(store, factId)).toMatchObject([
        { action: 'fact.confidence_adjusted', trigger: 'feedback', reasonCode },
      ]);
    },
  );

  it('retracts the fact on wrong under automatic, explained by a feedback source with no content', async () => {
    const { store, on, factId } = await recordPostgres({ domain: TEST_DOMAIN, confidence: 0.5 });

    const { followUp } = await giveAndAct(on(FEEDBACK_ON), factId, 'wrong');

    expect(followUp).toEqual({ ok: true, value: 'retracted' });
    const fact = await readFact(store, factId);
    expect(fact).toMatchObject({ invalidatedAt: FEEDBACK_AT, supersededByFactId: null, confidence: 0.5 });
    const [entry, ...others] = await followUpEntriesOf(store, factId);
    expect(others).toEqual([]);
    expect(entry).toMatchObject({
      action: 'fact.invalidated',
      operation: 'retraction',
      trigger: 'feedback',
      reasonCode: 'feedback_wrong',
    });
    const source = await store.getSource({ namespace: NAMESPACE, sourceId: entry?.sourceId ?? 'none' });
    expect(source.ok && source.value).toMatchObject({
      kind: 'feedback',
      content: null,
      observedAt: FEEDBACK_AT,
    });
  });

  it('ends the fact at the moment of the feedback on outdated under automatic, with no successor', async () => {
    const { store, on, factId } = await recordPostgres({ domain: TEST_DOMAIN, confidence: 0.5 });

    const { followUp } = await giveAndAct(on(FEEDBACK_ON), factId, 'outdated');

    expect(followUp).toEqual({ ok: true, value: 'ended' });
    const original = await readFact(store, factId);
    expect(original.invalidatedAt).toBe(FEEDBACK_AT);
    const endedCopy = await readFact(store, original.supersededByFactId ?? 'none');
    expect(endedCopy).toMatchObject({
      validTo: FEEDBACK_AT,
      invalidatedAt: null,
      statement: original.statement,
    });
    expect(await followUpEntriesOf(store, factId)).toMatchObject([
      {
        action: 'fact.invalidated',
        operation: 'revision',
        trigger: 'feedback',
        reasonCode: 'feedback_outdated',
      },
    ]);
    const live = await store.listFacts({
      namespace: NAMESPACE,
      subjectEntityId: 'e-shop-api',
      predicate: null,
      touchingEntityIds: null,
      supersededByFactId: null,
      time: 'live',
      limit: 10,
    });
    expect(live.ok && live.value.map((found) => found.fact.id)).toEqual([endedCopy.id]);
  });

  it('leaves a confidence of 1 at 1 on right, and writes nothing', async () => {
    const { store, on, factId } = await recordPostgres({ domain: TEST_DOMAIN, confidence: 1 });

    const { followUp } = await giveAndAct(on(FEEDBACK_ON), factId, 'right');

    expect(followUp).toEqual({ ok: true, value: 'none' });
    expect((await readFact(store, factId)).confidence).toBe(1);
    expect(await followUpEntriesOf(store, factId)).toEqual([]);
  });

  it('leaves a confidence of 0 at 0 on wrong under human_approval, and writes nothing', async () => {
    const { store, on, factId } = await recordPostgres({ domain: HUMAN_APPROVAL, confidence: 0 });

    const { followUp } = await giveAndAct(on(FEEDBACK_ON), factId, 'wrong');

    expect(followUp).toEqual({ ok: true, value: 'none' });
    expect((await readFact(store, factId)).confidence).toBe(0);
    expect(await followUpEntriesOf(store, factId)).toEqual([]);
  });

  it('stops at 0 when the step would go below it', async () => {
    const { store, on, factId } = await recordPostgres({ domain: HUMAN_APPROVAL, confidence: 0.1 });

    const { followUp } = await giveAndAct(on(FEEDBACK_ON), factId, 'outdated');

    expect(followUp).toEqual({ ok: true, value: 'confidence_lowered' });
    expect((await readFact(store, factId)).confidence).toBe(0);
  });

  it('does nothing on feedback about a fact that is no longer live', async () => {
    const { store, on, factId } = await recordPostgres({ domain: TEST_DOMAIN, confidence: 0.5 });
    const retracted = await giveAndAct(on('2026-03-01'), factId, 'wrong');
    expect(retracted.followUp).toEqual({ ok: true, value: 'retracted' });

    const { followUp } = await giveAndAct(on(FEEDBACK_ON), factId, 'right');

    expect(followUp).toEqual({ ok: true, value: 'none' });
    expect(await followUpEntriesOf(store, factId)).toEqual([]);
  });

  it('does not end on outdated a fact whose record already ends before the feedback', async () => {
    const { store, on, factId } = await recordPostgres({
      domain: TEST_DOMAIN,
      confidence: 0.5,
      validTo: '2026-02-01T00:00:00.000Z',
    });

    const { followUp } = await giveAndAct(on(FEEDBACK_ON), factId, 'outdated');

    expect(followUp).toEqual({ ok: true, value: 'none' });
    expect(await readFact(store, factId)).toMatchObject({
      invalidatedAt: null,
      validTo: '2026-02-01T00:00:00.000Z',
    });
  });

  it('returns not_found for feedback that is not on the fact', async () => {
    const { on, factId } = await recordPostgres({ domain: TEST_DOMAIN, confidence: 0.5 });

    const followUp = await actOnFeedback(on(FEEDBACK_ON), {
      namespace: NAMESPACE,
      factId,
      feedbackId: 'id-999',
    });

    expect(followUp.ok ? null : followUp.error.code).toBe('not_found');
  });

  it('keeps a retracted fact visible at a known-at date before the feedback, and gone for now', async () => {
    const { store, on, factId } = await recordPostgres({ domain: TEST_DOMAIN, confidence: 0.5 });

    await giveAndAct(on(FEEDBACK_ON), factId, 'wrong');

    const listAt = async (validAt: string, knownAt: string) => {
      const listed = await store.listFacts({
        namespace: NAMESPACE,
        subjectEntityId: 'e-shop-api',
        predicate: null,
        touchingEntityIds: null,
        supersededByFactId: null,
        time: { validAt: toTimestamp(new Date(validAt)), knownAt: toTimestamp(new Date(knownAt)) },
        limit: 10,
      });
      if (!listed.ok) throw new Error(listed.error.message);
      return listed.value.map((found) => found.fact.id);
    };
    // Now is the moment of the feedback; the known-at date before it is the day after recording.
    expect(await listAt(FEEDBACK_AT, FEEDBACK_AT)).toEqual([]);
    expect(await listAt(FEEDBACK_AT, '2026-01-11T00:00:00.000Z')).toEqual([factId]);
  });
});
