// Checks, in the type check, that each type derived from a schema has the shape that
// docs/architecture/INTERFACES.md commits to. The declarations under "Reference" are copied
// from that document. If a schema drifts from it, this file stops compiling.
import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { AuditAction, AuditEntry, Operation, ReasonCode, Trigger } from './audit.ts';
import type { Change, ChangeSet, CommitReceipt } from './change-set.ts';
import type { Domain, PredicateDefinition } from './domain.ts';
import type { Embedder } from './embedder.ts';
import type { EntityMerge } from './entity-merge.ts';
import type { FactUsage } from './fact-usage.ts';
import type { Feedback } from './feedback.ts';
import type {
  Entity,
  EntityId,
  Fact,
  FactId,
  FactObject,
  FactWithSources,
  Namespace,
  Source,
  SourceId,
  TimeFilter,
} from './fact.ts';
import type { LlmClient } from './llm-client.ts';
import type { MemoryStore } from './memory-store.ts';
import type { OperationDeps } from './operation-deps.ts';
import type { Result } from './result.ts';
import type { Timestamp } from './timestamp.ts';

/** True when each type is assignable to the other. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// --- Reference: copied from INTERFACES.md ---

type RefNamespace = string;
type RefEntityId = string;
type RefFactId = string;
type RefSourceId = string;

type RefEntity = {
  readonly id: RefEntityId;
  readonly namespace: RefNamespace;
  readonly type: string;
  readonly name: string;
  readonly createdAt: Timestamp;
};

type RefFactObject =
  | { readonly kind: 'entity'; readonly entityId: RefEntityId }
  | { readonly kind: 'value'; readonly value: string };

type RefFact = {
  readonly id: RefFactId;
  readonly namespace: RefNamespace;
  readonly subjectEntityId: RefEntityId;
  readonly predicate: string;
  readonly object: RefFactObject;
  readonly statement: string;
  readonly confidence: number;
  readonly validFrom: Timestamp | null;
  readonly validTo: Timestamp | null;
  readonly createdAt: Timestamp;
  readonly invalidatedAt: Timestamp | null;
  readonly supersededByFactId: RefFactId | null;
  /** Phase 2. When the text was purged and replaced by the marker '[purged]' (ADR 0012), or null. */
  readonly purgedAt: Timestamp | null;
};

type RefSource = {
  readonly id: RefSourceId;
  readonly namespace: RefNamespace;
  readonly kind: string;
  readonly locator: string | null;
  readonly version: string | null;
  readonly content: string | null;
  readonly contentHash: string | null;
  readonly observedAt: Timestamp;
  readonly createdAt: Timestamp;
  /** Phase 2. When the content and locator were purged (ADR 0012), or null. */
  readonly purgedAt: Timestamp | null;
};

type RefTrigger = 'agent' | 'person' | 'feedback' | 'maintenance';
type RefOperation =
  | 'remember'
  | 'revision'
  | 'succession'
  | 'correction'
  | 'retraction'
  | 'confidence_adjustment'
  | 'feedback'
  | 'purge'
  | 'merge';
type RefReasonCode =
  | 'stated'
  | 'restated'
  | 'reported_wrong'
  | 'reported_ended'
  | 'period_corrected'
  | 'feedback_given'
  | 'erasure_requested'
  | 'secret_stored'
  | 'same_entity';
type RefAuditAction =
  | 'entity.created'
  | 'source.recorded'
  | 'fact.recorded'
  | 'fact.source_attached'
  | 'fact.invalidated'
  | 'fact.confidence_adjusted'
  | 'feedback.recorded'
  | 'source.purged'
  | 'fact.purged'
  | 'entity.merged'
  | 'entity.merge_undone';

type RefAuditEntry = {
  readonly id: number;
  readonly namespace: RefNamespace;
  readonly operationId: string;
  readonly operation: RefOperation;
  readonly action: RefAuditAction;
  readonly targetKind: 'entity' | 'source' | 'fact' | 'feedback';
  readonly targetId: string;
  readonly trigger: RefTrigger;
  readonly reasonCode: RefReasonCode;
  readonly sourceId: RefSourceId | null;
  readonly detail: Readonly<Record<string, string | number | null>> | null;
  readonly occurredAt: Timestamp;
};

type RefTimeFilter = { readonly validAt: Timestamp; readonly knownAt: Timestamp };

type RefFactWithSources = {
  readonly fact: RefFact;
  readonly subject: RefEntity;
  readonly objectEntity: RefEntity | null;
  readonly sources: readonly RefSource[];
};

type RefChange =
  | { readonly kind: 'create_entity'; readonly entity: RefEntity }
  | { readonly kind: 'record_source'; readonly source: RefSource }
  | {
      readonly kind: 'record_fact';
      readonly fact: RefFact;
      readonly sourceIds: readonly [RefSourceId, ...RefSourceId[]];
      readonly embedding: Float32Array | { readonly copyFromFactId: RefFactId };
      readonly singleValued: boolean;
    }
  | { readonly kind: 'attach_source'; readonly factId: RefFactId; readonly sourceId: RefSourceId }
  | {
      readonly kind: 'invalidate_fact';
      readonly factId: RefFactId;
      readonly supersededByFactId: RefFactId | null;
    }
  | { readonly kind: 'adjust_confidence'; readonly factId: RefFactId; readonly confidence: number }
  | { readonly kind: 'record_feedback'; readonly feedback: RefFeedback }
  | { readonly kind: 'purge_content'; readonly targetKind: 'source' | 'fact'; readonly targetId: string }
  | {
      readonly kind: 'merge_entities';
      readonly merge: RefEntityMerge;
      readonly singleValuedPredicates: readonly string[];
    }
  | { readonly kind: 'undo_entity_merge'; readonly mergeId: string; readonly fromEntityId: RefEntityId };

type RefFactUsage = {
  readonly factId: RefFactId;
  readonly lastRecalledAt: Timestamp;
  readonly recallCount: number;
};

type RefEntityMerge = {
  readonly id: string;
  readonly namespace: RefNamespace;
  readonly fromEntityId: RefEntityId;
  readonly intoEntityId: RefEntityId;
  readonly mergedAt: Timestamp;
  readonly undoneAt: Timestamp | null;
};

type RefFeedback = {
  readonly id: string;
  readonly namespace: RefNamespace;
  readonly factId: RefFactId;
  readonly signal: 'right' | 'wrong' | 'outdated';
  readonly trigger: RefTrigger;
  readonly sourceId: RefSourceId | null;
  readonly recordedAt: Timestamp;
};

type RefChangeSet = {
  readonly namespace: RefNamespace;
  readonly operationId: string;
  readonly operation: RefOperation;
  readonly trigger: RefTrigger;
  readonly reasonCode: RefReasonCode;
  readonly explainedBySourceId: RefSourceId | null;
  readonly occurredAt: Timestamp;
  readonly changes: readonly RefChange[];
};

type RefCommitReceipt = { readonly operationId: string; readonly auditEntryCount: number };

type RefPredicateDefinition = {
  readonly name: string;
  readonly description: string;
  readonly cardinality: 'single' | 'multi';
};

type RefDomain = {
  readonly name: string;
  readonly entityTypes: readonly string[];
  readonly predicates: readonly RefPredicateDefinition[];
  readonly extractionInstructions: string;
  readonly correctionPolicy: 'automatic' | 'human_approval';
};

type RefLlmTask = 'extraction' | 'conflict_detection' | 'verification';

interface RefLlmClient {
  generateObject<T>(request: {
    readonly task: RefLlmTask;
    readonly instructions: string;
    readonly input: string;
    readonly schema: z.ZodType<T>;
  }): Promise<Result<T>>;
}

interface RefEmbedder {
  readonly model: string;
  readonly dimensions: number;
  embed(
    texts: readonly string[],
    purpose: 'statement' | 'question',
  ): Promise<Result<readonly Float32Array[]>>;
}

interface RefMemoryStore {
  commit(changeSet: RefChangeSet): Promise<Result<RefCommitReceipt>>;
  findEntities(query: {
    readonly namespace: RefNamespace;
    readonly name: string;
    readonly type: string | null;
  }): Promise<Result<readonly RefEntity[]>>;
  getFact(query: {
    readonly namespace: RefNamespace;
    readonly factId: RefFactId;
  }): Promise<Result<RefFactWithSources | null>>;
  listFacts(query: {
    readonly namespace: RefNamespace;
    readonly subjectEntityId: RefEntityId | null;
    readonly predicate: string | null;
    readonly touchingEntityIds: readonly RefEntityId[] | null;
    readonly supersededByFactId: RefFactId | null;
    readonly time: RefTimeFilter | 'live' | 'all';
    readonly limit: number;
  }): Promise<Result<readonly RefFactWithSources[]>>;
  searchFactsByVector(query: {
    readonly namespace: RefNamespace;
    readonly vector: Float32Array;
    readonly time: RefTimeFilter;
    readonly limit: number;
  }): Promise<Result<readonly RefFactWithSources[]>>;
  searchFactsByKeyword(query: {
    readonly namespace: RefNamespace;
    readonly text: string;
    readonly time: RefTimeFilter;
    readonly limit: number;
  }): Promise<Result<readonly RefFactWithSources[]>>;
  getSource(query: {
    readonly namespace: RefNamespace;
    readonly sourceId: RefSourceId;
  }): Promise<Result<RefSource | null>>;
  listAuditEntries(query: {
    readonly namespace: RefNamespace;
    readonly targetKind: RefAuditEntry['targetKind'];
    readonly targetId: string;
  }): Promise<Result<readonly RefAuditEntry[]>>;
  listFactsOfSources(query: {
    readonly namespace: RefNamespace;
    readonly sourceIds: readonly RefSourceId[];
  }): Promise<Result<readonly RefFactWithSources[]>>;
  findSourcesByContentHash(query: {
    readonly namespace: RefNamespace;
    readonly contentHash: string;
  }): Promise<Result<readonly RefSource[]>>;
  recordFactUsage(usage: {
    readonly namespace: RefNamespace;
    readonly factIds: readonly RefFactId[];
    readonly recalledAt: Timestamp;
  }): Promise<Result<null>>;
  getFactUsage(query: {
    readonly namespace: RefNamespace;
    readonly factId: RefFactId;
  }): Promise<Result<RefFactUsage | null>>;
  getUsageTrackingStart(query: { readonly namespace: RefNamespace }): Promise<Result<Timestamp | null>>;
  listEntityMerges(query: { readonly namespace: RefNamespace }): Promise<Result<readonly RefEntityMerge[]>>;
  listFeedback(query: {
    readonly namespace: RefNamespace;
    readonly factId: RefFactId;
  }): Promise<Result<readonly RefFeedback[]>>;
  close(): Promise<void>;
}

type RefOperationDeps = {
  readonly store: RefMemoryStore;
  readonly embedder: RefEmbedder;
  readonly domain: RefDomain;
  readonly now: () => Timestamp;
  readonly newId: () => string;
};

// --- The check: every line must be `true`, or this file does not compile ---

const parity: {
  readonly Namespace: Same<Namespace, RefNamespace>;
  readonly EntityId: Same<EntityId, RefEntityId>;
  readonly FactId: Same<FactId, RefFactId>;
  readonly SourceId: Same<SourceId, RefSourceId>;
  readonly Entity: Same<Entity, RefEntity>;
  readonly FactObject: Same<FactObject, RefFactObject>;
  readonly Fact: Same<Fact, RefFact>;
  readonly Source: Same<Source, RefSource>;
  readonly Trigger: Same<Trigger, RefTrigger>;
  readonly Operation: Same<Operation, RefOperation>;
  readonly ReasonCode: Same<ReasonCode, RefReasonCode>;
  readonly AuditAction: Same<AuditAction, RefAuditAction>;
  readonly AuditEntry: Same<AuditEntry, RefAuditEntry>;
  readonly TimeFilter: Same<TimeFilter, RefTimeFilter>;
  readonly PredicateDefinition: Same<PredicateDefinition, RefPredicateDefinition>;
  readonly Domain: Same<Domain, RefDomain>;
  readonly Feedback: Same<Feedback, RefFeedback>;
  readonly EntityMerge: Same<EntityMerge, RefEntityMerge>;
  readonly FactUsage: Same<FactUsage, RefFactUsage>;
  readonly Change: Same<Change, RefChange>;
  readonly ChangeSet: Same<ChangeSet, RefChangeSet>;
  readonly CommitReceipt: Same<CommitReceipt, RefCommitReceipt>;
  readonly FactWithSources: Same<FactWithSources, RefFactWithSources>;
  readonly LlmClient: Same<LlmClient, RefLlmClient>;
  readonly Embedder: Same<Embedder, RefEmbedder>;
  readonly MemoryStore: Same<MemoryStore, RefMemoryStore>;
  readonly OperationDeps: Same<OperationDeps, RefOperationDeps>;
} = {
  Namespace: true,
  EntityId: true,
  FactId: true,
  SourceId: true,
  Entity: true,
  FactObject: true,
  Fact: true,
  Source: true,
  Trigger: true,
  Operation: true,
  ReasonCode: true,
  AuditAction: true,
  AuditEntry: true,
  TimeFilter: true,
  PredicateDefinition: true,
  Domain: true,
  Feedback: true,
  EntityMerge: true,
  FactUsage: true,
  Change: true,
  ChangeSet: true,
  CommitReceipt: true,
  FactWithSources: true,
  LlmClient: true,
  Embedder: true,
  MemoryStore: true,
  OperationDeps: true,
};

describe('the types derived from the schemas', () => {
  it('have the shapes that INTERFACES.md commits to', () => {
    // The real check is the type of `parity` above, made by the compiler.
    expect(Object.values(parity).every((same) => same === true)).toBe(true);
    expect(Object.keys(parity)).toHaveLength(27);
  });
});
