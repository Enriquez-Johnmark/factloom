import { createTestDeps, recordFacts } from '@kronomind/core';
import { giveFeedback, softwareDevelopmentDomain } from '@kronomind/graph-rag';
import { describe, expect, it } from 'vitest';
import { buildServerDeps, findRepositoryName } from './build-server-deps.ts';
import { TEST_NAMESPACE, UNREACHABLE_LLM } from './testing/connect-in-process.ts';

/** The use case dependencies of the server on an in-memory store, with the clock at a date. */
function buildOn(date: string, base: ReturnType<typeof createTestDeps>) {
  const fixed = createTestDeps({ now: date, store: base.store, newId: base.newId });
  return buildServerDeps({
    store: fixed.store,
    embedder: fixed.embedder,
    domain: softwareDevelopmentDomain,
    llm: UNREACHABLE_LLM,
    namespace: TEST_NAMESPACE,
    now: fixed.now,
    newId: fixed.newId,
    log: () => {},
  });
}

describe('the dependencies the server builds for its use cases', () => {
  it('act on feedback: wrong on a recorded fact retracts it, with the trigger feedback', async () => {
    const base = createTestDeps({ now: '2026-03-10', domain: softwareDevelopmentDomain });
    const recorded = await recordFacts(base, {
      namespace: TEST_NAMESPACE,
      trigger: 'agent',
      reasonCode: 'stated',
      source: {
        kind: 'agent_note',
        locator: null,
        version: null,
        content: 'shop-api is deployed to Fly.io.',
        observedAt: base.now(),
      },
      drafts: [
        {
          fact: {
            subjectEntityId: 'e-shop-api',
            predicate: 'deploys_to',
            object: { kind: 'value', value: 'Fly.io' },
            statement: 'shop-api is deployed to Fly.io.',
            confidence: 0.9,
            validFrom: null,
            validTo: null,
          },
          newEntities: [{ id: 'e-shop-api', type: 'repository', name: 'shop-api' }],
        },
      ],
      restatedFactIds: [],
    });
    if (!recorded.ok) throw new Error(recorded.error.message);
    const factId = recorded.value.factIds[0] ?? 'none';

    const given = await giveFeedback(buildOn('2026-03-12', base), {
      namespace: TEST_NAMESPACE,
      factId,
      signal: 'wrong',
      comment: 'It was never on Fly.io.',
      trigger: 'agent',
    });

    expect(given.ok && given.value.followUp).toBe('retracted');
    const found = await base.store.getFact({ namespace: TEST_NAMESPACE, factId });
    expect(found.ok && found.value?.fact).toMatchObject({
      invalidatedAt: '2026-03-12T00:00:00.000Z',
      supersededByFactId: null,
    });
    const entries = await base.store.listAuditEntries({
      namespace: TEST_NAMESPACE,
      targetKind: 'fact',
      targetId: factId,
    });
    expect(entries.ok && entries.value.filter((entry) => entry.action === 'fact.invalidated')).toMatchObject([
      { operation: 'retraction', trigger: 'feedback', reasonCode: 'feedback_wrong' },
    ]);
  });

  it('reads the repository a repo: namespace is about, and none from a namespace of another form', () => {
    expect(findRepositoryName('repo:shop-api')).toBe('shop-api');
    expect(findRepositoryName('team:ops')).toBeNull();
    expect(findRepositoryName('repo:')).toBeNull();
  });
});
