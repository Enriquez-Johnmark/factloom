import {
  adjustConfidence,
  createTestDeps,
  err,
  type FeedbackResponder,
  type MemoryStore,
  type OperationDeps,
  ok,
  recordFacts,
} from '@kronomind/core';
import { describe, expect, it } from 'vitest';
import { giveFeedback } from './give-feedback.ts';
import { softwareDevelopmentDomain } from './software-development-domain.ts';

const NAMESPACE = 'repo:shop-api';
const COMMENT = 'We moved to Vitest in March; Jest is gone.';

/** A memory holding "shop-api uses Jest", with a clock that each step sets. */
async function rememberJest() {
  const first = createTestDeps({ now: '2026-01-10', domain: softwareDevelopmentDomain });
  const { store } = first;
  let count = 100;
  const on = (date: string): OperationDeps =>
    createTestDeps({
      now: date,
      domain: softwareDevelopmentDomain,
      store,
      newId: () => {
        count += 1;
        return `id-${count}`;
      },
    });
  const recorded = await recordFacts(first, {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: {
      kind: 'agent_note',
      locator: null,
      version: null,
      content: 'shop-api uses Jest.',
      observedAt: first.now(),
    },
    drafts: [
      {
        fact: {
          subjectEntityId: 'e-shop-api',
          predicate: 'uses_test_framework',
          object: { kind: 'entity', entityId: 'e-jest' },
          statement: 'shop-api uses Jest for its tests.',
          confidence: 0.9,
          validFrom: null,
          validTo: null,
        },
        newEntities: [
          { id: 'e-shop-api', type: 'repository', name: 'shop-api' },
          { id: 'e-jest', type: 'dependency', name: 'Jest' },
        ],
      },
    ],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const factId = recorded.value.factIds[0];
  if (factId === undefined) throw new Error('No fact was recorded.');
  return { store, on, factId };
}

async function entriesOf(store: MemoryStore, targetKind: 'feedback' | 'source', targetId: string) {
  const listed = await store.listAuditEntries({ namespace: NAMESPACE, targetKind, targetId });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value;
}

describe('giveFeedback', () => {
  it('records feedback with the comment as the content of a source', async () => {
    const { store, on, factId } = await rememberJest();

    const given = await giveFeedback(on('2026-04-02'), {
      namespace: NAMESPACE,
      factId,
      signal: 'outdated',
      comment: COMMENT,
      trigger: 'agent',
    });

    if (!given.ok) throw new Error(given.error.message);
    const [entry] = await entriesOf(store, 'feedback', given.value.feedbackId);
    expect(entry).toMatchObject({ reasonCode: 'feedback_given', trigger: 'agent' });
    const source = await store.getSource({ namespace: NAMESPACE, sourceId: entry?.sourceId ?? 'none' });
    expect(source.ok && source.value).toMatchObject({
      kind: 'agent_note',
      content: COMMENT,
      observedAt: '2026-04-02T00:00:00.000Z',
    });
  });

  it('records feedback with no source when there is no comment', async () => {
    const { store, on, factId } = await rememberJest();

    const given = await giveFeedback(on('2026-04-02'), {
      namespace: NAMESPACE,
      factId,
      signal: 'right',
      comment: null,
      trigger: 'agent',
    });

    if (!given.ok) throw new Error(given.error.message);
    expect(await entriesOf(store, 'feedback', given.value.feedbackId)).toMatchObject([{ sourceId: null }]);
  });

  it('refuses a comment that contains a secret and stores nothing', async () => {
    const { store, on, factId } = await rememberJest();
    const token = ['gh', 'p_', 'aB3dE5gH7jK9mN1pQ2rS4tU6vW8xY0zaB3dE5'].join('');

    const given = await giveFeedback(on('2026-04-02'), {
      namespace: NAMESPACE,
      factId,
      signal: 'wrong',
      comment: `Use the token ${token} to check.`,
      trigger: 'agent',
    });

    expect(given.ok ? null : given.error.code).toBe('invalid_input');
    if (!given.ok) expect(given.error.message).not.toContain(token);
    // The identifiers the call would have used were never taken.
    expect(await entriesOf(store, 'feedback', 'id-102')).toEqual([]);
    expect(await entriesOf(store, 'source', 'id-101')).toEqual([]);
  });

  it('returns not_found for a fact in another namespace', async () => {
    const { on, factId } = await rememberJest();

    const given = await giveFeedback(on('2026-04-02'), {
      namespace: 'repo:other',
      factId,
      signal: 'wrong',
      comment: null,
      trigger: 'agent',
    });

    expect(given.ok ? null : given.error.code).toBe('not_found');
  });

  it('says that nothing followed when it has no feedback responder', async () => {
    const { on, factId } = await rememberJest();

    const given = await giveFeedback(on('2026-04-02'), {
      namespace: NAMESPACE,
      factId,
      signal: 'wrong',
      comment: COMMENT,
      trigger: 'agent',
    });

    expect(given.ok && given.value.followUp).toBe('none');
  });

  it('writes no audit entry that contains the comment', async () => {
    const { store, on, factId } = await rememberJest();

    const given = await giveFeedback(on('2026-04-02'), {
      namespace: NAMESPACE,
      factId,
      signal: 'outdated',
      comment: COMMENT,
      trigger: 'agent',
    });

    if (!given.ok) throw new Error(given.error.message);
    const [entry] = await entriesOf(store, 'feedback', given.value.feedbackId);
    const written = [
      ...(await entriesOf(store, 'feedback', given.value.feedbackId)),
      ...(await entriesOf(store, 'source', entry?.sourceId ?? 'none')),
    ];
    expect(written).toHaveLength(2);
    expect(JSON.stringify(written)).not.toContain('Vitest');
  });
  it('returns what the feedback responder did', async () => {
    const { on, factId } = await rememberJest();
    const responder: FeedbackResponder = async () => ok('retracted');

    const given = await giveFeedback(
      { ...on('2026-04-02'), feedbackResponder: responder },
      { namespace: NAMESPACE, factId, signal: 'wrong', comment: null, trigger: 'agent' },
    );

    expect(given.ok && given.value.followUp).toBe('retracted');
  });

  it('gives the feedback responder feedback that is already on record', async () => {
    const { on, factId } = await rememberJest();
    const responder: FeedbackResponder = async (deps, input) => {
      const listed = await deps.store.listFeedback({ namespace: input.namespace, factId: input.factId });
      if (!listed.ok) return listed;
      const isRecorded = listed.value.some((feedback) => feedback.id === input.feedbackId);
      return isRecorded ? ok('none') : err('not_found', 'The feedback was not recorded first.');
    };

    const given = await giveFeedback(
      { ...on('2026-04-02'), feedbackResponder: responder },
      { namespace: NAMESPACE, factId, signal: 'right', comment: null, trigger: 'agent' },
    );

    expect(given.ok && given.value.followUp).toBe('none');
  });

  it('returns the error when the follow-up commit fails, and keeps the feedback on record', async () => {
    const { store, on, factId } = await rememberJest();
    let commits = 0;
    // The first commit, the feedback's, succeeds; the second, the follow-up's, fails.
    const failingSecond: MemoryStore = {
      ...store,
      commit: async (changeSet) => {
        commits += 1;
        return commits === 1 ? store.commit(changeSet) : err('storage_failed', 'The disk is full.');
      },
    };
    const raise: FeedbackResponder = async (deps, input) => {
      const adjusted = await adjustConfidence(deps, {
        ...input,
        trigger: 'feedback',
        reasonCode: 'feedback_right',
        confidence: 1,
      });
      return adjusted.ok ? ok('confidence_raised') : adjusted;
    };

    const given = await giveFeedback(
      { ...on('2026-04-02'), store: failingSecond, feedbackResponder: raise },
      { namespace: NAMESPACE, factId, signal: 'right', comment: COMMENT, trigger: 'agent' },
    );

    expect(given.ok ? null : given.error.code).toBe('storage_failed');
    const feedback = await store.listFeedback({ namespace: NAMESPACE, factId });
    expect(feedback.ok && feedback.value).toMatchObject([{ factId, signal: 'right', trigger: 'agent' }]);
    const fact = await store.getFact({ namespace: NAMESPACE, factId });
    expect(fact.ok && fact.value?.fact.confidence).toBe(0.9);
  });
});
