import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createFakeEmbedder } from './create-fake-embedder.ts';
import { createScriptedLlm } from './create-scripted-llm.ts';
import { createTestDeps, TEST_DOMAIN } from './create-test-deps.ts';
import { DomainSchema } from './domain.ts';

const AnswerSchema = z.strictObject({ answer: z.string() });
const request = {
  task: 'extraction',
  instructions: 'Answer.',
  input: 'A question.',
  schema: AnswerSchema,
} as const;

async function embed(text: string, purpose: 'statement' | 'question' = 'statement'): Promise<number[]> {
  const embedded = await createFakeEmbedder().embed([text], purpose);
  if (!embedded.ok) throw new Error(embedded.error.message);
  return [...(embedded.value[0] ?? [])];
}

describe('createFakeEmbedder', () => {
  it('the fake embedder gives the same vector for the same text', async () => {
    expect(await embed('The package manager is pnpm')).toEqual(await embed('The package manager is pnpm'));
    expect(await embed('The package manager is pnpm', 'question')).toEqual(
      await embed('The package manager is pnpm', 'statement'),
    );
  });

  it('gives different vectors for different texts', async () => {
    expect(await embed('The package manager is pnpm')).not.toEqual(await embed('The package manager is npm'));
    expect(await embed('pnpm is the package manager')).not.toEqual(
      await embed('the package manager is pnpm'),
    );
  });

  it('gives one vector per text, of the size it declares', async () => {
    const embedder = createFakeEmbedder();
    const embedded = await embedder.embed(['one', 'two', 'three'], 'statement');
    expect(embedded.ok && embedded.value.map((vector) => vector.length)).toEqual([16, 16, 16]);
    expect(embedder.dimensions).toBe(16);
    expect(embedder.model).toBe('fake-embedder');
  });
});

describe('createScriptedLlm', () => {
  it('the scripted LLM gives its responses in order', async () => {
    const llm = createScriptedLlm([{ answer: 'first' }, { answer: 'second' }]);
    expect(await llm.generateObject(request)).toEqual({ ok: true, value: { answer: 'first' } });
    expect(await llm.generateObject(request)).toEqual({ ok: true, value: { answer: 'second' } });
  });

  it('the scripted LLM throws when called more often than scripted', async () => {
    const llm = createScriptedLlm([{ answer: 'only' }]);
    await llm.generateObject(request);
    expect(() => llm.generateObject(request)).toThrow(/called 2 times/);
    expect(() => createScriptedLlm([]).generateObject(request)).toThrow(/called 1 times/);
  });

  it('the scripted LLM returns llm_failed for a response that does not match the schema', async () => {
    const result = await createScriptedLlm([{ reply: 'wrong key' }]).generateObject(request);
    expect(result.ok ? null : result.error.code).toBe('llm_failed');
  });
});

describe('createTestDeps', () => {
  it('test dependencies give the same identifiers and time on every run', () => {
    const first = createTestDeps({ now: '2026-04-02' });
    const second = createTestDeps({ now: '2026-04-02' });
    expect([first.newId(), first.newId(), first.newId()]).toEqual(['id-1', 'id-2', 'id-3']);
    expect([second.newId(), second.newId()]).toEqual(['id-1', 'id-2']);
    expect(first.now()).toBe('2026-04-02T00:00:00.000Z');
    expect(first.now()).toBe(second.now());
  });

  it('a later step can run at a later time on the same memory', async () => {
    const first = createTestDeps({ now: '2026-01-10' });
    const later = createTestDeps({ now: '2026-04-02', store: first.store, newId: first.newId });
    expect(later.store).toBe(first.store);
    expect(first.now()).toBe('2026-01-10T00:00:00.000Z');
    expect(later.now()).toBe('2026-04-02T00:00:00.000Z');
    // The identifier generator carries on, so the later step does not reuse an identifier.
    expect(first.newId()).toBe('id-1');
    expect(later.newId()).toBe('id-2');
    const committed = await first.store.commit({
      namespace: 'repo:example',
      operationId: 'op-1',
      operation: 'remember',
      trigger: 'agent',
      reasonCode: 'stated',
      explainedBySourceId: null,
      occurredAt: first.now(),
      changes: [
        {
          kind: 'create_entity',
          entity: {
            id: 'e-1',
            namespace: 'repo:example',
            type: 'repository',
            name: 'example',
            createdAt: first.now(),
          },
        },
      ],
    });
    expect(committed.ok).toBe(true);
    const found = await later.store.findEntities({ namespace: 'repo:example', name: 'example', type: null });
    expect(found.ok && found.value).toHaveLength(1);
  });

  it('gives a domain with one single-valued and one multi-valued predicate', () => {
    expect(DomainSchema.safeParse(TEST_DOMAIN).success).toBe(true);
    expect(
      createTestDeps()
        .domain.predicates.map((predicate) => predicate.cardinality)
        .sort(),
    ).toEqual(['multi', 'single']);
  });

  it('refuses a clock time that is not a date', () => {
    expect(() => createTestDeps({ now: 'yesterday' })).toThrow(/not a date/);
  });

  it('fails a test that calls the LLM when no response was scripted', () => {
    expect(() => createTestDeps().llm.generateObject(request)).toThrow(/only 0 responses/);
  });
});
