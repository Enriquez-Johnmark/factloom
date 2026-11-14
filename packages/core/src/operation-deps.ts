import type { Domain } from './domain.ts';
import type { Embedder } from './embedder.ts';
import type { MemoryStore } from './memory-store.ts';
import type { Timestamp } from './timestamp.ts';

/** What a fact operation needs from outside. Passed as its first argument, so tests can pass fakes. */
export type OperationDeps = {
  readonly store: MemoryStore;
  readonly embedder: Embedder;
  readonly domain: Domain;
  readonly now: () => Timestamp;
  readonly newId: () => string;
};
