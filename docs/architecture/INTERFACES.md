# Interfaces

The TypeScript interfaces that `@factloom/core` owns: the result type, the data types, the storage interface, the LLM and embeddings interfaces, and the fact operations that product 2 will call. The use cases in `@factloom/graph-rag` are at the end.

Nothing here is implemented. The code blocks are the shapes the design commits to. They were type-checked together on 2026-11-13 with TypeScript 7.0.2 and Zod 4.6.7 under the project's strict compiler flags, as hand-written declarations. In the code, each data type will be derived from a Zod schema and will have the shape shown here.

Terms in bold are defined in [`GLOSSARY.md`](../../GLOSSARY.md). The tables behind the storage interface are in [`SCHEMA.md`](SCHEMA.md). Each section says which phase first needs it. Phase 2 and 3 operations are designed now because product 2 depends on them, and are built in their phase.

## Result and errors

Every fallible operation returns a `Result`. Expected failures are values, not exceptions.

```ts
export type Result<T, E = FactloomError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** The one shared list of error codes. */
export const ERROR_CODES = [
  'invalid_input', // the input failed its schema, or names a type or predicate the domain does not have
  'not_found', // a fact, entity, source or merge does not exist in the namespace
  'already_invalidated', // the fact is no longer live
  'already_exists', // an entity with that name and type, or a row with that identifier, exists
  'conflict', // a live fact for the same subject and single-valued predicate overlaps in valid time
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
  /** For `conflict` and `already_invalidated`: the facts in the way, or the superseding fact. */
  readonly relatedFactIds: readonly FactId[];
  readonly cause?: unknown;
};
```

A code is added to the list only when a caller would act differently on it. Each code has one meaning.

## Data types

Absent values are `null`, not optional properties, so that a stored row and its type have the same shape.

```ts
/** UTC, fixed width: YYYY-MM-DDTHH:MM:SS.sssZ. Produced only by `toTimestamp` in core. */
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

/** What was being done. Phases 2 and 3 add 'merge', 'verification', 'feedback' and 'purge'. */
export type Operation = 'remember' | 'revision' | 'succession' | 'correction' | 'retraction';

/** Why, from a fixed list, so that the audit log holds no free text. Later phases add codes. */
export type ReasonCode = 'stated' | 'restated' | 'reported_wrong' | 'reported_ended';

export type AuditAction =
  | 'entity.created'
  | 'source.recorded'
  | 'fact.recorded'
  | 'fact.source_attached'
  | 'fact.invalidated';

export type AuditEntry = {
  readonly id: number;
  readonly namespace: Namespace;
  readonly operationId: string;
  readonly operation: Operation;
  readonly action: AuditAction;
  readonly targetKind: 'entity' | 'source' | 'fact';
  readonly targetId: string;
  readonly trigger: Trigger;
  readonly reasonCode: ReasonCode;
  /** The source that explains the change. Its content is the free-text explanation. */
  readonly sourceId: SourceId | null;
  /** Identifiers and numbers only. */
  readonly detail: Readonly<Record<string, string | number | null>> | null;
  readonly occurredAt: Timestamp;
};

/** Together these are the whole of time handling at read time. */
export type TimeFilter = {
  /** The as-of date: what was true in the world then. */
  readonly validAt: Timestamp;
  /** The known-at date: what Factloom believed then. */
  readonly knownAt: Timestamp;
};
```

Two points that are easy to miss:

- **The audit log explains a change by pointing at a source.** When an agent says "this is wrong because we moved to Vitest", that sentence is stored as the content of a source, and the audit entry carries `reasonCode: 'reported_wrong'` and that source's identifier. A later **purge** can then remove the sentence without changing the log.
- **`Operation` is what was being done; `AuditAction` is what happened to one row.** A **succession** is one operation with three actions: a fact recorded, a fact invalidated, a fact recorded.

## Storage

First needed in phase 1. One interface, because the first thing every write needs is to be atomic across facts, sources, embeddings and audit entries.

```ts
export interface MemoryStore {
  /** Applies every change or none, checks the single-value rule, and writes one audit entry per change. */
  commit(changeSet: ChangeSet): Promise<Result<CommitReceipt>>;

  /** Entities with this name, by exact match on the normalised name. One type, or every type. */
  findEntities(query: {
    readonly namespace: Namespace;
    readonly name: string;
    readonly type: string | null;
  }): Promise<Result<readonly Entity[]>>;

  getFact(query: { readonly namespace: Namespace; readonly factId: FactId }): Promise<Result<FactWithSources | null>>;

  /**
   * Lists facts by structure, newest first. Serves conflict candidates, the graph lane and
   * fact history. Every filter that is given must match.
   */
  listFacts(query: {
    readonly namespace: Namespace;
    readonly subjectEntityId: EntityId | null;
    readonly predicate: string | null;
    /** Facts whose subject or object is any of these entities. */
    readonly touchingEntityIds: readonly EntityId[] | null;
    /** Facts that this fact superseded. */
    readonly supersededByFactId: FactId | null;
    /** A time filter; 'live' for every live fact at any valid time; 'all' for every row, invalidated ones included. */
    readonly time: TimeFilter | 'live' | 'all';
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

  /** One source by identifier. Fact history uses it to show the explanation of a change. */
  getSource(query: { readonly namespace: Namespace; readonly sourceId: SourceId }): Promise<Result<Source | null>>;

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
  readonly reasonCode: ReasonCode;
  /** The source that explains the change. It may be recorded in this same change set. */
  readonly explainedBySourceId: SourceId | null;
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
      /** Whether the single-value rule applies. Set by core from the domain's predicate. */
      readonly singleValued: boolean;
    }
  | { readonly kind: 'attach_source'; readonly factId: FactId; readonly sourceId: SourceId }
  | { readonly kind: 'invalidate_fact'; readonly factId: FactId; readonly supersededByFactId: FactId | null };

export type CommitReceipt = {
  readonly operationId: string;
  readonly auditEntryCount: number;
};
```

### What a caller must know beyond the signatures

- **`commit` is the only way to write.** There is no method that writes a fact without an audit entry, so the rule "every change is recorded" cannot be skipped by accident.
- **All or nothing.** Changes apply in order inside one transaction. Any failure leaves memory as it was.
- **The single-value rule is checked inside the transaction.** After applying the changes, for every fact recorded with `singleValued: true`, the store looks for another live fact with the same subject and predicate whose valid period overlaps it. A missing bound counts as open. If one exists the commit fails with `conflict` and names the facts. The check is in the store, not before it, because two server processes can share one database file: a check made before the commit could pass in both.
- **Reads never write.** Recall does not update a counter or a timestamp. From phase 3, how often a fact is recalled is recorded by the caller after the read, in a usage table outside `commit` and with no audit entry: usage counts are bookkeeping, not memory.
- **The store decides nothing else.** It does not judge conflicts, choose what to invalidate, or call an LLM. It enforces the rules in [`SCHEMA.md`](SCHEMA.md).
- **Entity identifiers are resolved through merges by the store.** From phase 3, a query for an entity also matches facts recorded against entities merged into it, and `subject` and `objectEntity` in results are the entity that the others were merged into. In phases 1 and 2 there are no merges, and the read methods do not change shape when they arrive.
- **Methods return promises** although SQLite is synchronous, because Postgres is not. The consequence is one coarse `commit` instead of a transaction handle, since a SQLite transaction cannot stay open across an `await`.

Callers build the identifiers and timestamps in a change set. `core` takes a clock and an identifier generator as arguments, so tests are deterministic.

### Errors from `commit`

| Code | When |
|---|---|
| `invalid_input` | The change set fails its schema: a reversed valid period, a fact with no source, a namespace that differs from the change set's |
| `not_found` | A fact to invalidate or attach to, an entity a fact refers to, or a source, does not exist in the namespace |
| `already_invalidated` | A fact to invalidate or attach a source to is no longer live. `relatedFactIds` holds the fact that superseded it, if any |
| `already_exists` | An entity with the same type and normalised name exists, or an identifier is already used. The caller reads the existing entity with `findEntities` and tries again |
| `conflict` | The single-value rule. `relatedFactIds` holds the overlapping facts |
| `embedding_model_mismatch` | A vector's size or model differs from the database's |
| `storage_failed` | Anything else the database reports |

Read methods return only `invalid_input` and `storage_failed`. A read that finds nothing returns an empty list or `null`, not `not_found`.

## LLM client

First needed in phase 1, for extraction.

```ts
/** Phase 1 uses 'extraction'. Phase 2 adds conflict detection, phase 3 verification. */
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
  /** A single-valued predicate has one value per subject at any moment. */
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

There is one domain at first, software development, defined in `@factloom/graph-rag`. It moves to its own adapter package in phase 4.

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
  readonly reasonCode: ReasonCode;
};

/** A source not yet recorded. The operation gives it an identifier and a hash. */
export type NewSource = {
  readonly kind: string;
  readonly locator: string | null;
  readonly version: string | null;
  readonly content: string | null;
  readonly observedAt: Timestamp;
};

export type NewEntity = { readonly id: EntityId; readonly type: string; readonly name: string };

export type NewFact = {
  /** An existing entity, or one of the new entities given with it. */
  readonly subjectEntityId: EntityId;
  readonly predicate: string;
  readonly object: FactObject;
  readonly statement: string;
  readonly confidence: number;
  readonly validFrom: Timestamp | null;
  readonly validTo: Timestamp | null;
};

/** A fact with the entities it introduces. */
export type FactDraft = { readonly fact: NewFact; readonly newEntities: readonly NewEntity[] };
```

| Operation | Phase | What it does |
|---|---|---|
| `recordFacts` | 1 | Records a source, new entities and facts, and attaches the source to facts it restates |
| `invalidateFact` | 1 | **Retraction**, or **correction** when a replacement is given |
| `endFact` | 1 | **Revision** that ends a fact, or **succession** when a successor is given |
| `findConflictCandidates` | 1 | Lists the live facts a new fact could conflict with or restate |
| `reviseValidTime` | 2 | **Revision** of one or more facts' valid periods in one commit |
| `adjustConfidence` | 2 | Records a new confidence for a fact |
| `recordFeedback` | 2 | Records a **feedback** signal against a fact |
| `purgeContent` | 2 | Removes the content of a source and of the facts that depend only on it |
| `recordVerification` | 3 | Records the outcome of verifying a fact |
| `listStaleFacts` | 3 | Lists facts due for verification |
| `listOrphanedFacts` | 3 | Lists facts whose source is gone |
| `mergeEntities`, `undoEntityMerge` | 3 | Records, or withdraws, that two entities are the same |

### Phase 1

```ts
/** Records what was learned from one source, in one commit. */
export declare function recordFacts(
  deps: OperationDeps,
  input: ChangeContext & {
    readonly source: NewSource;
    readonly drafts: readonly FactDraft[];
    /** Live facts this source states again. The source is attached to each; no new row is written. */
    readonly restatedFactIds: readonly FactId[];
  },
): Promise<Result<{ readonly sourceId: SourceId; readonly factIds: readonly FactId[] }>>;

/** Withdraws a fact. With a replacement it is a correction, without one a retraction. */
export declare function invalidateFact(
  deps: OperationDeps,
  input: ChangeContext & {
    readonly factId: FactId;
    /** Why we believe it was wrong. */
    readonly source: NewSource;
    readonly replacement: FactDraft | null;
  },
): Promise<Result<{ readonly invalidatedFactId: FactId; readonly replacementFactId: FactId | null }>>;

/** Says a fact stopped being true at a moment. With a successor it is a succession. */
export declare function endFact(
  deps: OperationDeps,
  input: ChangeContext & {
    readonly factId: FactId;
    readonly validTo: Timestamp;
    /** Why we believe it ended. Attached to the ended copy and to the successor. */
    readonly source: NewSource;
    readonly successor: FactDraft | null;
  },
): Promise<Result<{ readonly endedFactId: FactId; readonly successorFactId: FactId | null }>>;

/** Live facts with the same subject and predicate whose valid period overlaps the given one. */
export declare function findConflictCandidates(
  deps: Pick<OperationDeps, 'store' | 'now'>,
  input: {
    readonly namespace: Namespace;
    readonly subjectEntityId: EntityId;
    readonly predicate: string;
    readonly validFrom: Timestamp | null;
    readonly validTo: Timestamp | null;
    readonly limit: number;
  },
): Promise<Result<readonly FactWithSources[]>>;
```

How they behave:

- **`recordFacts` is all or nothing.** If any draft breaks the single-value rule, nothing is recorded and the result is `conflict`. Deciding which facts to leave out is the caller's job; the `remember` use case does it before calling.
- **`invalidateFact` with a replacement.** A replacement whose valid period is not given takes the valid period of the fact it corrects. The wrong fact is invalidated and linked to the replacement.
- **`endFact`.** Writes a copy of the fact with `validTo` set, carrying the original's sources plus the new one, and invalidates the original with a link to the copy. `endedFactId` is the identifier of that copy, the fact that is live afterwards. A successor whose `validFrom` is not given starts at `validTo`.
- **A fact has at most one successor link, set when it is invalidated.** A fact retracted with no replacement cannot be linked to one later; the later fact is simply recorded.
- **`findConflictCandidates` does not judge.** It returns the facts worth comparing, by an indexed lookup with a fixed upper bound and no LLM. For a single-valued predicate, any candidate with a different object is a **conflict**. For any predicate, a candidate with the same object is a restatement. Product 2 does the judging in phase 2; in phase 1 the use cases apply only those two deterministic rules.

| Code | `recordFacts` | `invalidateFact` | `endFact` |
|---|---|---|---|
| `invalid_input` | A type or predicate not in the domain; an empty input | The same, for the replacement | The same; `validTo` not after the fact's `validFrom` |
| `not_found` | A restated fact or a referenced entity is missing | The fact is missing | The fact is missing |
| `already_invalidated` | A restated fact is no longer live | The fact is no longer live | The fact is no longer live |
| `already_exists` | A new entity already exists | The same | The same |
| `conflict` | A draft overlaps a live fact | The replacement overlaps a live fact other than the one it replaces | The successor overlaps a live fact other than the one it follows |
| `embedding_failed`, `storage_failed` | Yes | Yes | Yes |

### Phase 2

```ts
/** Changes the valid period of one or more facts in one commit. */
export declare function reviseValidTime(
  deps: OperationDeps,
  input: ChangeContext & {
    readonly source: NewSource;
    readonly revisions: readonly {
      readonly factId: FactId;
      readonly validFrom: Timestamp | null;
      readonly validTo: Timestamp | null;
    }[];
  },
): Promise<Result<{ readonly revisedFactIds: readonly FactId[] }>>;

/** Records a new confidence for a fact. The fact keeps its identifier. */
export declare function adjustConfidence(
  deps: Pick<OperationDeps, 'store' | 'now' | 'newId'>,
  input: ChangeContext & { readonly factId: FactId; readonly confidence: number },
): Promise<Result<{ readonly factId: FactId; readonly previousConfidence: number }>>;

/** Records that someone found a recalled fact right, wrong or out of date. Changes no fact. */
export declare function recordFeedback(
  deps: Pick<OperationDeps, 'store' | 'now' | 'newId'>,
  input: ChangeContext & {
    readonly factId: FactId;
    readonly signal: 'right' | 'wrong' | 'outdated';
    /** What was said, kept as a source so it can be purged. */
    readonly source: NewSource | null;
  },
): Promise<Result<{ readonly feedbackId: string }>>;

/** Removes the content of a source, and of every fact that has no other source. */
export declare function purgeContent(
  deps: Pick<OperationDeps, 'store' | 'now' | 'newId'>,
  input: ChangeContext & { readonly sourceId: SourceId },
): Promise<Result<{ readonly purgedSourceId: SourceId; readonly purgedFactIds: readonly FactId[] }>>;
```

- **`reviseValidTime`** exists for the case one fact at a time cannot express: moving the date of a succession means changing the end of one fact and the start of the next together. Each fact is invalidated and superseded by a copy with the new period, and the single-value rule is checked once, on the result. Errors: as `endFact`.
- **`adjustConfidence` does not copy the fact.** It appends a row to a `fact_confidence` table (fact, confidence, time), and reads return the latest confidence recorded at or before the known-at date. A copy per adjustment would change the fact's identifier and its recorded date every time. Confidence changes on feedback or on a failed verification, never on a timer. Errors: `invalid_input`, `not_found`, `already_invalidated`, `storage_failed`.
- **`recordFeedback` decides nothing.** Product 2 reads feedback and then calls `invalidateFact`, `endFact` or `adjustConfidence` under the domain's correction policy. Errors: `invalid_input`, `not_found`, `storage_failed`.
- **`purgeContent`** is specified in outline in [ADR 0012](adr/0012-purge-is-the-one-exception.md). Its full design is a phase 2 work item, with the requirements the review of this design found: it must cover every copy of a purged fact, the keyword and vector entries, the source's locator, and the content of any source that explained a change to those facts. Errors: `not_found`, `storage_failed`.

Each phase 2 operation adds what it needs: a `Change` kind, an `Operation` name, `AuditAction` values and reason codes. `reviseValidTime` needs none, because it is made of existing changes. Adding a kind does not change the existing ones.

### Phase 3

```ts
export type VerificationOutcome = 'confirmed' | 'contradicted' | 'source_missing' | 'inconclusive';

/** Records the outcome of checking a fact against its source. Changes no fact. */
export declare function recordVerification(
  deps: Pick<OperationDeps, 'store' | 'now' | 'newId'>,
  input: ChangeContext & {
    readonly factId: FactId;
    readonly outcome: VerificationOutcome;
    readonly method: 'deterministic' | 'llm';
  },
): Promise<Result<{ readonly verificationId: string }>>;

/** Current facts not verified since a date, least recently verified first. */
export declare function listStaleFacts(
  deps: Pick<OperationDeps, 'store' | 'now'>,
  input: {
    readonly namespace: Namespace;
    /** A fact counts as verified at its latest verification, or at its recording if it has none. */
    readonly notVerifiedSince: Timestamp;
    /** If given, also include current facts with confidence below this, whenever verified. */
    readonly confidenceBelow: number | null;
    readonly limit: number;
  },
): Promise<Result<readonly FactWithSources[]>>;

/** Live facts whose every source has been purged, or whose latest verification found the source missing. */
export declare function listOrphanedFacts(
  deps: Pick<OperationDeps, 'store'>,
  input: { readonly namespace: Namespace; readonly limit: number },
): Promise<Result<readonly FactWithSources[]>>;

/** Records that one entity is the same as another. Facts keep their identifiers. */
export declare function mergeEntities(
  deps: Pick<OperationDeps, 'store' | 'domain' | 'now' | 'newId'>,
  input: ChangeContext & { readonly fromEntityId: EntityId; readonly intoEntityId: EntityId },
): Promise<Result<{ readonly mergeId: string }>>;

/** Withdraws a merge. */
export declare function undoEntityMerge(
  deps: Pick<OperationDeps, 'store' | 'now' | 'newId'>,
  input: ChangeContext & { readonly mergeId: string },
): Promise<Result<{ readonly mergeId: string }>>;
```

- **Verification is recorded, not applied.** `recordVerification` writes a row and an audit entry. What follows from a `contradicted` outcome, an invalidation or a lower confidence, is a separate call, so the audit log shows both the finding and the action. Errors: `invalid_input`, `not_found`, `already_invalidated`, `storage_failed`.
- **`listStaleFacts` and `listOrphanedFacts` are reads.** They add two methods to `MemoryStore` in phase 3, backed by the `fact_verification` table. They return an empty list when nothing is due. Errors: `invalid_input`, `storage_failed`.
- **A merge is a row, not an edit.** `mergeEntities` adds a row to an `entity_merge` table: from, into, when. No entity and no fact is rewritten. Reads resolve identifiers through the merges that have not been undone, following a chain if the target was itself merged later.
- **A merge can be refused.** If the two entities hold live facts for the same single-valued predicate with different objects and overlapping valid periods, merging them would break the single-value rule. `mergeEntities` then returns `conflict` with those facts and merges nothing. Product 2 resolves them first. Two entities of different types can be merged, because the same thing is sometimes extracted under two types. Other errors: `not_found`; `invalid_input` for an entity merged with itself; `already_exists` when the first entity is already merged; `storage_failed`.
- **Undoing a merge** sets `undone_at` on its row, once. Facts recorded against either entity before or after the merge stay with the entity they were recorded against, so nothing needs to be moved back. Errors: `not_found`, `already_exists` if already undone, `storage_failed`.

## Use cases

The use cases in `@factloom/graph-rag`, one per file. Phase 1. An MCP tool handler calls exactly one.

```ts
export type RememberDeps = OperationDeps & { readonly llm: LlmClient };

/** Where new information came from, as a caller gives it. */
export type SourceInput = { readonly kind: string; readonly locator: string | null; readonly version: string | null };

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

export type RememberedFact = FactWithSources & {
  /** 'restated' when the fact was already live and only gained a source. */
  readonly outcome: 'recorded' | 'restated';
};

/** An extracted fact that was not recorded. */
export type SkippedFact = {
  readonly statement: string;
  readonly reason: 'conflicts_with_stored_fact' | 'conflicts_within_text';
  readonly conflictingFactIds: readonly FactId[];
};

/** Extracts entities and facts from text, resolves the entities, and records the facts. */
export declare function remember(
  deps: RememberDeps,
  input: {
    readonly namespace: Namespace;
    readonly text: string;
    readonly source: SourceInput;
    readonly trigger: Trigger;
  },
): Promise<Result<{ readonly facts: readonly RememberedFact[]; readonly skipped: readonly SkippedFact[] }>>;

/** Records facts that are already structured. Makes no LLM call. */
export declare function recordStructuredFacts(
  deps: OperationDeps,
  input: {
    readonly namespace: Namespace;
    readonly facts: readonly StructuredFactInput[];
    readonly source: SourceInput;
    readonly trigger: Trigger;
  },
): Promise<Result<{ readonly facts: readonly RememberedFact[] }>>;

/** Applies a report that a fact was wrong or is no longer true, with an optional fact to take its place. */
export declare function changeFact(
  deps: OperationDeps,
  input: {
    readonly namespace: Namespace;
    readonly factId: FactId;
    readonly because: 'was_wrong' | 'no_longer_true';
    /** With 'no_longer_true': when it stopped. Null means now. */
    readonly endedAt: Timestamp | null;
    /** The reporter's explanation. Stored as the content of a source. */
    readonly explanation: string;
    readonly replacement: StructuredFactInput | null;
    readonly trigger: Trigger;
  },
): Promise<Result<{ readonly invalidatedFactId: FactId; readonly replacement: FactWithSources | null }>>;

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

/** Returns the facts linked to this one by supersession, with the audit entries for each. */
export declare function getFactHistory(
  deps: Pick<OperationDeps, 'store' | 'domain'>,
  input: { readonly namespace: Namespace; readonly factId: FactId },
): Promise<Result<{ readonly entries: readonly FactHistoryEntry[] }>>;

export type RecalledFact = FactWithSources & {
  /** Rank-fusion result. How well the fact matches the question, not how true it is. */
  readonly score: number;
};

export type FactHistoryEntry = FactWithSources & { readonly auditEntries: readonly AuditEntry[] };
```

- **`remember`** asks the LLM for facts using the domain's entity types and predicates, which the extraction schema lists as closed sets. It resolves each entity by name, preferring an existing entity of any type when exactly one has that name. It then sorts the extracted facts with `findConflictCandidates`: a fact that restates a live one gains the source; a fact that conflicts with a stored fact, or with another fact from the same text, is returned in `skipped`; the rest are recorded. One call to `recordFacts` writes everything. A fact whose text gives no date has `validFrom: null`, meaning the start is unknown, so it is returned for any earlier as-of date.
- **`recordStructuredFacts`** applies the same restatement rule, and returns `conflict` instead of skipping.
- **Secrets are refused.** `remember`, `recordStructuredFacts` and `changeFact` check their text against a fixed list of secret patterns before anything is stored or sent to the LLM, and return `invalid_input` naming the kind of secret, never the secret.
- **`changeFact`** resolves the replacement's entities, then calls `invalidateFact` for `was_wrong` or `endFact` for `no_longer_true`. It is one commit either way.
- **`recall`** runs the vector and keyword lanes, then the graph lane: the live facts that touch the entities the first two found, ranked by how many of those entities each fact touches and then by how recently it was recorded. The three ranked lists are merged by weighted reciprocal rank fusion, a pure function tested without a database. If only `knownAt` is given, `validAt` takes the same date, so the question means "what did Factloom believe was true then".
- **`getFactHistory`** follows supersession links in both directions from the given fact. For a single-valued predicate it also includes every other fact for the same subject and predicate, which is the timeline of that value. Entries are ordered by valid time, then by recorded time.
