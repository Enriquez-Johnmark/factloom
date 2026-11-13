# Interfaces

The TypeScript interfaces that `@factloom/core` owns: the result type, the data types, the storage interface, the LLM and embeddings interfaces, and the fact operations that product 2 will call.

These are signatures for design review. Nothing here is implemented. The code blocks were type-checked together on 2026-11-13 with TypeScript 7.0.2 and Zod 4.6.7 under the project's strict compiler flags. Terms in bold are defined in [`GLOSSARY.md`](../../GLOSSARY.md); the tables behind the storage interface are in [`SCHEMA.md`](SCHEMA.md).

Each section says which phase first needs it. Phase 2 and 3 items are designed now because product 2 depends on them, and are built in their phase.

## Result and errors

Every fallible operation returns a `Result`. Expected failures are values, not exceptions.

```ts
export type Result<T, E = FactloomError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** The one shared list of error codes. */
export const ERROR_CODES = [
  'invalid_input', // the input failed its schema
  'not_found', // a fact, entity or source does not exist in the namespace
  'already_invalidated', // the fact to invalidate is no longer live
  'conflict', // the write would break a rule, such as two current values for a single-valued predicate
  'embedding_model_mismatch', // the embedder differs from the one the database was built with
  'storage_failed', // the database could not complete the operation
  'llm_failed', // the LLM call failed or returned output that did not match the schema
  'embedding_failed', // the embedder could not produce vectors
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type FactloomError = {
  readonly code: ErrorCode;
  /** Written for the caller: what went wrong and, where possible, what to do next. */
  readonly message: string;
  readonly cause?: unknown;
};
```

A code is added to the list only when a caller would act differently on it.

## Data types

The types below are derived from Zod schemas with `z.infer`; the schemas are the source and are not repeated here. Absent values are `null`, not optional properties, so that a stored row and its type have the same shape.

```ts
/** UTC, fixed width: YYYY-MM-DDTHH:MM:SS.sssZ. */
export type Timestamp = string & { readonly __brand: 'Timestamp' };

export type Namespace = string;
export type EntityId = string;
export type FactId = string;
export type SourceId = string;

export type Entity = {
  readonly id: EntityId;
  readonly namespace: Namespace;
  readonly type: string;
  readonly name: string;
  readonly createdAt: Timestamp;
};

export type FactObject =
  | { readonly kind: 'entity'; readonly entityId: EntityId }
  | { readonly kind: 'value'; readonly value: string };

export type Fact = {
  readonly id: FactId;
  readonly namespace: Namespace;
  readonly subjectEntityId: EntityId;
  readonly predicate: string;
  readonly object: FactObject;
  readonly statement: string;
  readonly confidence: number;
  readonly validFrom: Timestamp | null;
  readonly validTo: Timestamp | null;
  readonly createdAt: Timestamp;
  readonly invalidatedAt: Timestamp | null;
  readonly supersededByFactId: FactId | null;
};

export type Source = {
  readonly id: SourceId;
  readonly namespace: Namespace;
  readonly kind: string;
  readonly locator: string | null;
  readonly version: string | null;
  readonly content: string | null;
  readonly contentHash: string | null;
  readonly observedAt: Timestamp;
  readonly createdAt: Timestamp;
};

export type Trigger = 'agent' | 'person' | 'feedback' | 'maintenance';

export type Operation = 'remember' | 'revision' | 'succession' | 'correction' | 'retraction';

export type AuditEntry = {
  readonly id: number;
  readonly namespace: Namespace;
  readonly operationId: string;
  readonly operation: Operation;
  readonly action: 'entity.created' | 'source.recorded' | 'fact.recorded' | 'fact.invalidated';
  readonly targetKind: 'entity' | 'source' | 'fact';
  readonly targetId: string;
  readonly trigger: Trigger;
  readonly reason: string;
  readonly detail: Readonly<Record<string, string | number | null>> | null;
  readonly occurredAt: Timestamp;
};

/** Both dates default to now. Together they are the whole of time handling at read time. */
export type TimeFilter = {
  /** The as-of date: what was true in the world then. */
  readonly validAt: Timestamp;
  /** The known-at date: what Factloom believed then. */
  readonly knownAt: Timestamp;
};
```

`Timestamp` is branded because a bare string in the wrong format would sort wrongly in the database. It is produced in one place, a function in `core` that wraps `toISOString()`.

## Storage

First needed in phase 1. One interface, because the first thing every write needs is to be atomic across facts, sources, embeddings and audit entries.

```ts
export interface MemoryStore {
  /** Applies every change or none, and writes one audit entry per change. */
  commit(changeSet: ChangeSet): Promise<Result<CommitReceipt>>;

  /** Exact match on the normalised name. Phase 1 entity resolution. */
  findEntity(query: {
    readonly namespace: Namespace;
    readonly type: string;
    readonly name: string;
  }): Promise<Result<Entity | null>>;

  getFact(query: { readonly namespace: Namespace; readonly factId: FactId }): Promise<Result<FactWithSources | null>>;

  /**
   * Lists facts by structure. Serves conflict candidates (subject and predicate),
   * the graph lane (any of several entities) and fact history (time: 'all').
   */
  listFacts(query: {
    readonly namespace: Namespace;
    readonly subjectEntityId?: EntityId;
    readonly predicate?: string;
    readonly touchingEntityIds?: readonly EntityId[];
    readonly time: TimeFilter | 'all';
    readonly limit: number;
  }): Promise<Result<readonly FactWithSources[]>>;

  /** Vector lane. Nearest first. The time filter is applied before the limit. */
  searchFactsByVector(query: {
    readonly namespace: Namespace;
    readonly vector: Float32Array;
    readonly time: TimeFilter;
    readonly limit: number;
  }): Promise<Result<readonly FactWithSources[]>>;

  /** Keyword lane. Best match first. The time filter is applied before the limit. */
  searchFactsByKeyword(query: {
    readonly namespace: Namespace;
    readonly text: string;
    readonly time: TimeFilter;
    readonly limit: number;
  }): Promise<Result<readonly FactWithSources[]>>;

  listAuditEntries(query: {
    readonly namespace: Namespace;
    readonly targetKind: AuditEntry['targetKind'];
    readonly targetId: string;
  }): Promise<Result<readonly AuditEntry[]>>;

  close(): Promise<void>;
}

export type FactWithSources = {
  readonly fact: Fact;
  readonly subject: Entity;
  readonly objectEntity: Entity | null;
  readonly sources: readonly Source[];
};

export type ChangeSet = {
  readonly namespace: Namespace;
  /** Shared by every audit entry this commit writes. */
  readonly operationId: string;
  readonly operation: Operation;
  readonly trigger: Trigger;
  readonly reason: string;
  readonly occurredAt: Timestamp;
  readonly changes: readonly Change[];
};

export type Change =
  | { readonly kind: 'create_entity'; readonly entity: Entity }
  | { readonly kind: 'record_source'; readonly source: Source }
  | {
      readonly kind: 'record_fact';
      readonly fact: Fact;
      /** At least one. Sources recorded earlier in the same change set may be used. */
      readonly sourceIds: readonly [SourceId, ...SourceId[]];
      /** A new vector, or the vector of the fact this one revises. */
      readonly embedding: Float32Array | { readonly copyFromFactId: FactId };
    }
  | { readonly kind: 'attach_source'; readonly factId: FactId; readonly sourceId: SourceId }
  | { readonly kind: 'invalidate_fact'; readonly factId: FactId; readonly supersededByFactId: FactId | null };

export type CommitReceipt = {
  readonly operationId: string;
  readonly auditEntryCount: number;
};
```

What a caller must know beyond the signatures:

- **`commit` is the only way to write.** There is no method that writes a fact without an audit entry, so the rule "every change is recorded" cannot be skipped by accident.
- **Changes apply in order**, so a change set can record a source, then a fact that cites it, then invalidate the fact it replaces.
- **A commit fails as a whole** with `not_found` or `already_invalidated` when a fact to invalidate is missing or not live, with `conflict` when an entity with the same normalised name already exists, and with `embedding_model_mismatch` when a vector has the wrong size.
- **Reads never write.** Recall does not update a counter or a timestamp.
- **The store does not decide anything.** It does not detect conflicts, choose what to invalidate, or call an LLM. It enforces the rules in [`SCHEMA.md`](SCHEMA.md) and nothing else.
- **Methods return promises** although SQLite is synchronous, because Postgres is not. The consequence is the shape above: one coarse `commit` instead of a transaction handle, since a SQLite transaction cannot stay open across an `await`.

Callers build the identifiers and timestamps in a change set. `core` takes a clock and an identifier generator as arguments, so tests are deterministic.

## LLM client

First needed in phase 1, for extraction.

```ts
export type LlmTask = 'extraction' | 'conflict_detection' | 'verification';

export interface LlmClient {
  /** Asks for one object that matches the schema. */
  generateObject<T>(request: {
    /** Lets the composition root choose a model per task. */
    readonly task: LlmTask;
    /** The stable part of the prompt. Implementations may cache it. */
    readonly instructions: string;
    /** The part that changes with every call. */
    readonly input: string;
    readonly schema: z.ZodType<T>;
  }): Promise<Result<T>>;
}
```

One method, because structured output from a schema is the only thing extraction, conflict detection and verification need. An implementation validates the response against the schema and returns `llm_failed` if it does not match. The split between `instructions` and `input` exists so the Anthropic implementation can use prompt caching without the interface naming it.

## Embedder

First needed in phase 1.

```ts
export interface Embedder {
  /** Stored with every vector, so a change of model is detected. */
  readonly model: string;
  readonly dimensions: number;

  /** Some models embed stored text and questions differently, so the caller says which it is. */
  embed(texts: readonly string[], purpose: 'statement' | 'question'): Promise<Result<readonly Float32Array[]>>;
}
```

## Domain

First needed in phase 1, as data. A domain is a typed object, not a class.

```ts
export type PredicateDefinition = {
  readonly name: string;
  readonly description: string;
  /** A single-valued predicate has one current value per subject. */
  readonly cardinality: 'single' | 'multi';
};

export type Domain = {
  readonly name: string;
  readonly entityTypes: readonly string[];
  readonly predicates: readonly PredicateDefinition[];
  readonly extractionInstructions: string;
  readonly correctionPolicy: 'automatic' | 'human_approval';
};
```

In phases 1 to 3 there is one domain, software development, defined in `@factloom/graph-rag`. It moves to its own adapter package in phase 4, when a second domain exists.

## Fact operations

These functions live in `@factloom/core`, one per file. Each validates its input, builds one `ChangeSet` and commits it. They are the operations product 2 calls; it never writes to storage directly.

```ts
export type OperationDeps = {
  readonly store: MemoryStore;
  readonly embedder: Embedder;
  readonly domain: Domain;
  readonly now: () => Timestamp;
  readonly newId: () => string;
};

/** Who is making the change and why. Copied into every audit entry. */
export type ChangeContext = {
  readonly namespace: Namespace;
  readonly trigger: Trigger;
  readonly reason: string;
};

export type NewFact = {
  readonly subjectEntityId: EntityId;
  readonly predicate: string;
  readonly object: FactObject;
  readonly statement: string;
  readonly confidence: number;
  readonly validFrom: Timestamp | null;
  readonly validTo: Timestamp | null;
};
```

| Operation | Phase | What it does |
|---|---|---|
| `recordFacts` | 1 | Records new entities, a source and facts in one commit |
| `invalidateFact` | 1 | **Retraction**, or **correction** when a replacement is given |
| `endFact` | 1 | **Revision** that ends a fact, or **succession** when a successor is given |
| `findConflictCandidates` | 1 | Lists the current facts a new fact could conflict with |
| `adjustConfidence` | 2 | **Revision** that changes a fact's confidence |
| `recordFeedback` | 2 | Records a feedback signal against a fact |
| `mergeEntities` | 3 | Records that two entities are the same |
| `listStaleFacts`, `listOrphanedFacts` | 3 | Lists facts for verification or repair |
| `recordVerification` | 3 | Records the outcome of verifying a fact |
| `purgeContent` | 2 | Removes the content of a source or fact, leaving the record |

```ts
/** Phase 1. Records what was learned from one source. */
export declare function recordFacts(
  deps: OperationDeps,
  input: ChangeContext & {
    readonly source: Omit<Source, 'id' | 'namespace' | 'createdAt'>;
    readonly newEntities: readonly { readonly id: EntityId; readonly type: string; readonly name: string }[];
    readonly facts: readonly NewFact[];
  },
): Promise<Result<{ readonly factIds: readonly FactId[]; readonly sourceId: SourceId }>>;

/** Phase 1. Withdraws a fact. With a replacement it is a correction, without one a retraction. */
export declare function invalidateFact(
  deps: OperationDeps,
  input: ChangeContext & {
    readonly factId: FactId;
    readonly replacement: { readonly fact: NewFact; readonly sourceId: SourceId } | null;
  },
): Promise<Result<{ readonly invalidatedFactId: FactId; readonly replacementFactId: FactId | null }>>;

/** Phase 1. Says a fact stopped being true at a moment. With a successor it is a succession. */
export declare function endFact(
  deps: OperationDeps,
  input: ChangeContext & {
    readonly factId: FactId;
    readonly validTo: Timestamp;
    readonly successor: { readonly fact: NewFact; readonly sourceId: SourceId } | null;
  },
): Promise<Result<{ readonly endedFactId: FactId; readonly successorFactId: FactId | null }>>;

/** Phase 1. Current facts with the same subject and predicate. Empty for a multi-valued predicate. */
export declare function findConflictCandidates(
  deps: Pick<OperationDeps, 'store' | 'domain' | 'now'>,
  input: {
    readonly namespace: Namespace;
    readonly subjectEntityId: EntityId;
    readonly predicate: string;
    readonly limit: number;
  },
): Promise<Result<readonly FactWithSources[]>>;

/** Phase 2. Replaces a fact with a copy that carries a new confidence. */
export declare function adjustConfidence(
  deps: OperationDeps,
  input: ChangeContext & { readonly factId: FactId; readonly confidence: number },
): Promise<Result<{ readonly revisedFactId: FactId }>>;

/** Phase 3. Points one entity at another. Facts keep their identifiers; reads follow the link. */
export declare function mergeEntities(
  deps: OperationDeps,
  input: ChangeContext & { readonly fromEntityId: EntityId; readonly intoEntityId: EntityId },
): Promise<Result<{ readonly mergedEntityId: EntityId }>>;
```

Notes:

- **One current value per single-valued predicate.** `recordFacts`, and the replacement or successor in `invalidateFact` and `endFact`, return `conflict` when a new fact would be a second current value for a single-valued predicate of the domain. This check is deterministic and is in place from phase 1; deciding what to do about the conflict is phase 2.
- **Three verbs cover every change to a fact.** `recordFacts` adds, `invalidateFact` says "this was wrong", `endFact` says "this stopped being true". The difference between the last two is the difference between the two time axes, which is why they are separate operations and not one with a flag.
- **`findConflictCandidates` does not judge.** It returns the facts worth comparing, chosen by subject and predicate with a fixed upper bound, before any LLM is involved. Product 2 judges each candidate as a duplicate, a succession, a correction, or unrelated, and then calls `attach_source`, `endFact`, or `invalidateFact`. Whether to act or to ask a person is the domain's **correction policy**.
- **The audit log is written by `commit`**, so there is no separate "write to the audit log" operation to forget. Outcomes that change no fact, such as a verification that passed, are recorded by `recordVerification` in phase 3.
- **Phase 2 and 3 operations add `Change` kinds and `Operation` names** (`merge_entities`, `record_feedback`, `record_verification`, `purge_content`) along with the tables in the "Planned additions" section of [`SCHEMA.md`](SCHEMA.md). Adding a kind does not change the existing ones.

## Use cases

The use cases in `@factloom/graph-rag`, one per file. Phase 1.

```ts
export type RememberDeps = OperationDeps & { readonly llm: LlmClient };

/** Extracts entities and facts from text, resolves the entities, and records the facts. */
export declare function remember(
  deps: RememberDeps,
  input: {
    readonly namespace: Namespace;
    readonly text: string;
    readonly source: { readonly kind: string; readonly locator: string | null; readonly version: string | null };
    readonly trigger: Trigger;
  },
): Promise<Result<{ readonly facts: readonly FactWithSources[]; readonly skipped: readonly SkippedFact[] }>>;

/** An extracted fact that was not recorded because a current fact already holds that single value. */
export type SkippedFact = { readonly statement: string; readonly reason: string; readonly conflictingFactId: FactId };

/** Records facts that are already structured. Makes no LLM call. */
export declare function recordStructuredFacts(
  deps: OperationDeps,
  input: {
    readonly namespace: Namespace;
    readonly facts: readonly StructuredFactInput[];
    readonly source: { readonly kind: string; readonly locator: string | null; readonly version: string | null };
    readonly trigger: Trigger;
  },
): Promise<Result<{ readonly facts: readonly FactWithSources[] }>>;

/** Answers a question with the matching facts, filtered by time. */
export declare function recall(
  deps: Pick<OperationDeps, 'store' | 'embedder' | 'now'>,
  input: {
    readonly namespace: Namespace;
    readonly question: string;
    readonly validAt: Timestamp | null;
    readonly knownAt: Timestamp | null;
    readonly limit: number;
  },
): Promise<Result<{ readonly facts: readonly RecalledFact[] }>>;

/** Returns every fact ever recorded for a subject and predicate, with the audit entries for each. */
export declare function getFactHistory(
  deps: Pick<OperationDeps, 'store'>,
  input: { readonly namespace: Namespace; readonly factId: FactId },
): Promise<Result<{ readonly entries: readonly FactHistoryEntry[] }>>;

/** A fact given by name, before its entities are resolved. */
export type StructuredFactInput = {
  readonly subject: { readonly type: string; readonly name: string };
  readonly predicate: string;
  readonly object:
    | { readonly kind: 'entity'; readonly type: string; readonly name: string }
    | { readonly kind: 'value'; readonly value: string };
  readonly statement: string;
  readonly confidence: number;
  readonly validFrom: Timestamp | null;
  readonly validTo: Timestamp | null;
};

export type RecalledFact = FactWithSources & {
  /** Rank-fusion result. How well the fact matches the question, not how true it is. */
  readonly score: number;
};

export type FactHistoryEntry = FactWithSources & { readonly auditEntries: readonly AuditEntry[] };
```

`recall` runs the vector and keyword lanes, expands one step through the graph from the entities they found, and merges the three ranked lists by reciprocal rank fusion. Rank fusion is a pure function over ranked lists, so it is tested without a database and works unchanged with Postgres.
