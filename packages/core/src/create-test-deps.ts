import { createFakeEmbedder } from './create-fake-embedder.ts';
import { createScriptedLlm } from './create-scripted-llm.ts';
import type { Domain } from './domain.ts';
import { createInMemoryStore } from './in-memory-store.ts';
import type { LlmClient } from './llm-client.ts';
import type { MemoryStore } from './memory-store.ts';
import type { OperationDeps } from './operation-deps.ts';
import { parseDateInput } from './timestamp.ts';

/** A small domain for tests: one single-valued and one multi-valued predicate. */
export const TEST_DOMAIN: Domain = {
  name: 'test',
  entityTypes: ['repository', 'dependency'],
  predicates: [
    {
      name: 'uses_database_version',
      description: 'The database version a repository runs on.',
      cardinality: 'single',
    },
    { name: 'depends_on', description: 'A dependency a repository has.', cardinality: 'multi' },
  ],
  extractionInstructions: 'Extract facts about the repository.',
  correctionPolicy: 'automatic',
};

export type TestDepsOptions = {
  /** The moment the fixed clock shows: a full timestamp or a calendar date. */
  readonly now?: string;
  readonly domain?: Domain;
  /** What the scripted LLM answers, in order. With none, any LLM call throws. */
  readonly llmResponses?: readonly unknown[];
  /** An existing store, so that a later step of one test runs on the same memory. */
  readonly store?: MemoryStore;
  /** An existing identifier generator, so that a later step does not reuse identifiers. */
  readonly newId?: () => string;
};

/**
 * Builds everything an operation or a use case needs, for a test: an in-memory store, the
 * fake embedder, a scripted LLM, a small domain, a clock fixed at one moment, and an
 * identifier generator that counts. Nothing reads the real time or a random value.
 */
export function createTestDeps(options: TestDepsOptions = {}): OperationDeps & { readonly llm: LlmClient } {
  const now = parseDateInput(options.now ?? '2026-01-01');
  if (!now.ok) throw new Error(now.error.message);
  let count = 0;
  const countingId = (): string => {
    count += 1;
    return `id-${count}`;
  };
  return {
    store: options.store ?? createInMemoryStore(),
    embedder: createFakeEmbedder(),
    domain: options.domain ?? TEST_DOMAIN,
    llm: createScriptedLlm(options.llmResponses ?? []),
    now: () => now.value,
    newId: options.newId ?? countingId,
  };
}
