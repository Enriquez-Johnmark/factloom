import {
  createInMemoryStore,
  createScriptedLlm,
  createTestDeps,
  type LlmClient,
  type MemoryStore,
  ok,
  recordFacts,
  TEST_DOMAIN,
  toTimestamp,
} from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { CONFIDENCE_STEP, verifyAnchoredFacts } from './verify-anchored-facts.ts';
import { createLlmVerificationRung, MAX_VERIFIED_TEXT_LENGTH } from './create-llm-verification-rung.ts';
import { createNameCheckRung } from './create-name-check-rung.ts';
import type { RepositoryReader } from './repository-reader.ts';

const NAMESPACE = 'repo:shop-api';
/** Joined at run time, so that no tracked file holds a literal the secret scan refuses. */
const FAKE_AWS_KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
const PATH = 'docs/database.md';

/** A file that changed since the anchor, and holds `text` at HEAD, unless `exists` says it is gone. */
function changedFile(
  text: string,
  options: { readonly exists?: boolean; readonly changed?: boolean } = {},
): RepositoryReader {
  const exists = options.exists ?? true;
  const changed = options.changed ?? true;
  return {
    readHead: async () => ok('c-head'),
    isAncestorOfHead: async () => ok(true),
    pathExists: async () => ok(exists),
    readContentId: async (commit) => ok(changed ? commit : 'blob'),
    readText: async () => ok(text),
    findRenamedPath: async () => ok(null),
    listCommitsTouching: async () => ok([]),
  };
}

/** An LLM client that fails the test if the rung calls it. */
const NOT_CALLED: LlmClient = {
  generateObject: () => {
    throw new Error('The LLM was called.');
  },
};

let count = 0;
/** A counting identifier generator shared by every recording. */
const nextId = (): string => {
  count += 1;
  return `id-${count}`;
};

/** Records `count` facts, one per repository, from the file at the anchor commit. */
async function recordFactsFromFile(store: MemoryStore, factCount = 1): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < factCount; index += 1) {
    const recorded = await recordFacts(
      createTestDeps({
        now: '2026-01-10',
        domain: TEST_DOMAIN,
        store,
        newId: nextId,
      }),
      {
        namespace: NAMESPACE,
        trigger: 'agent',
        reasonCode: 'stated',
        source: {
          kind: 'file',
          locator: PATH,
          version: 'c-anchor',
          content: 'Notes.',
          observedAt: toTimestamp(new Date('2026-01-10')),
        },
        drafts: [
          {
            fact: {
              subjectEntityId: `entity-${index}`,
              predicate: 'uses_database_version',
              object: { kind: 'value', value: 'PostgreSQL 16' },
              statement: `repository ${index} runs PostgreSQL 16`,
              confidence: 0.9,
              validFrom: null,
              validTo: null,
            },
            newEntities: [{ id: `entity-${index}`, type: 'repository', name: `repository-${index}` }],
          },
        ],
        restatedFactIds: [],
      },
    );
    if (!recorded.ok) throw new Error(recorded.error.message);
    ids.push(recorded.value.factIds[0] ?? 'none');
  }
  return ids;
}

function run(store: MemoryStore, repository: RepositoryReader, llm: LlmClient | null, maxCalls?: number) {
  const deps = createTestDeps({ now: '2026-03-01', store, domain: TEST_DOMAIN });
  const rung = createLlmVerificationRung({
    llm,
    containsSecret: (text) => text.includes('AKIA'),
    ...(maxCalls === undefined ? {} : { maxCalls }),
  });
  return verifyAnchoredFacts({ ...deps, repository, rungs: [rung] }, { namespace: NAMESPACE });
}

async function verifications(store: MemoryStore, factId: string) {
  const listed = await store.listVerifications({ namespace: NAMESPACE, factId });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value.map((verification) => [verification.outcome, verification.method]);
}

async function confidenceOf(store: MemoryStore, factId: string) {
  const found = await store.getFact({ namespace: NAMESPACE, factId });
  return found.ok ? found.value?.fact.confidence : undefined;
}

describe('the LLM verification rung', () => {
  it('is not reached for a fact the deterministic rungs decide: confirmed or source_missing', async () => {
    const unchanged = createInMemoryStore();
    const missing = createInMemoryStore();
    const [unchangedId = ''] = await recordFactsFromFile(unchanged);
    const [missingId = ''] = await recordFactsFromFile(missing);

    await run(unchanged, changedFile('PostgreSQL 16', { changed: false }), NOT_CALLED);
    await run(missing, changedFile('', { exists: false }), NOT_CALLED);

    expect(await verifications(unchanged, unchangedId)).toEqual([['confirmed', 'deterministic']]);
    expect(await verifications(missing, missingId)).toEqual([['source_missing', 'deterministic']]);
  });

  it('is not reached for a fact a deterministic rung contradicts', async () => {
    const store = createInMemoryStore();
    const [factId = ''] = await recordFactsFromFile(store);
    const deps = createTestDeps({ now: '2026-03-01', store, domain: TEST_DOMAIN });
    const rungs = [
      createNameCheckRung(() => ['parseDate']),
      createLlmVerificationRung({ llm: NOT_CALLED, containsSecret: () => false }),
    ];

    await verifyAnchoredFacts(
      { ...deps, repository: changedFile('No functions here.'), rungs },
      { namespace: NAMESPACE },
    );

    expect(await verifications(store, factId)).toEqual([['contradicted', 'deterministic']]);
  });

  it('records each of the three answers with method llm and the matching outcome', async () => {
    const outcomes = [];
    for (const answer of ['supported', 'contradicted', 'unclear']) {
      const store = createInMemoryStore();
      const [factId = ''] = await recordFactsFromFile(store);
      await run(store, changedFile('We run PostgreSQL 17.'), createScriptedLlm([{ answer }]));
      outcomes.push(...(await verifications(store, factId)));
    }

    expect(outcomes).toEqual([
      ['confirmed', 'llm'],
      ['contradicted', 'llm'],
      ['inconclusive', 'llm'],
    ]);
  });

  it('lowers the confidence of a contradicted fact by the step, leaves it live, flags it, and audits with trigger maintenance', async () => {
    const store = createInMemoryStore();
    const [factId = ''] = await recordFactsFromFile(store);

    const result = await run(
      store,
      changedFile('We run PostgreSQL 17.'),
      createScriptedLlm([{ answer: 'contradicted' }]),
    );

    expect(await confidenceOf(store, factId)).toBeCloseTo(0.9 - CONFIDENCE_STEP);
    const found = await store.getFact({ namespace: NAMESPACE, factId });
    expect(found.ok && found.value?.fact.invalidatedAt).toBeNull();
    expect(result.ok && result.value.flaggedItems).toEqual([{ id: factId, reason: 'contradicted' }]);
    const audit = await store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'fact',
      targetId: factId,
    });
    const written = audit.ok ? audit.value.filter((entry) => entry.operation !== 'remember') : [];
    expect(written.map((entry) => [entry.action, entry.trigger])).toEqual([
      ['fact.verified', 'maintenance'],
      ['fact.confidence_adjusted', 'maintenance'],
    ]);
  });

  it('records inconclusive for a failed call, counts it as failed, and changes no confidence', async () => {
    const store = createInMemoryStore();
    const [factId = ''] = await recordFactsFromFile(store);

    const result = await run(
      store,
      changedFile('We run PostgreSQL 17.'),
      createScriptedLlm([{ verdict: 'yes' }]),
    );

    expect(await verifications(store, factId)).toEqual([['inconclusive', 'llm']]);
    expect(result.ok && result.value.failed).toBe(1);
    expect(await confidenceOf(store, factId)).toBe(0.9);
  });

  it('does not send a file over the size limit, or one with a secret pattern', async () => {
    const large = createInMemoryStore();
    const secret = createInMemoryStore();
    const [largeId = ''] = await recordFactsFromFile(large);
    const [secretId = ''] = await recordFactsFromFile(secret);

    await run(large, changedFile('x'.repeat(MAX_VERIFIED_TEXT_LENGTH + 1)), NOT_CALLED);
    await run(secret, changedFile(`The key is ${FAKE_AWS_KEY}.`), NOT_CALLED);

    expect(await verifications(large, largeId)).toEqual([['inconclusive', 'deterministic']]);
    expect(await verifications(secret, secretId)).toEqual([['inconclusive', 'deterministic']]);
  });

  it('completes with no LLM client, leaves the fact inconclusive, and reports it as undecided', async () => {
    const store = createInMemoryStore();
    const [factId = ''] = await recordFactsFromFile(store);

    const result = await run(store, changedFile('We run PostgreSQL 17.'), null);

    expect(result.ok && result.value).toMatchObject({ examined: 1, undecided: 1, failed: 0 });
    expect(await verifications(store, factId)).toEqual([['inconclusive', 'deterministic']]);
  });

  it('makes at most the call limit: with a limit of 2 and five undecided facts, two calls', async () => {
    const store = createInMemoryStore();
    const ids = await recordFactsFromFile(store, 5);
    const answers = [{ answer: 'supported' }, { answer: 'supported' }];

    const result = await run(store, changedFile('We run PostgreSQL 16.'), createScriptedLlm(answers), 2);

    const recorded = await Promise.all(ids.map((factId) => verifications(store, factId)));
    expect(recorded.filter((rows) => rows.length > 0)).toHaveLength(2);
    expect(result.ok && result.value.undecided).toBe(3);
  });
});
