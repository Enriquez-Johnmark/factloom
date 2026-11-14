// Checks, in the type check, that each type derived from a schema has the shape that
// docs/architecture/INTERFACES.md commits to. The declarations under "Reference" are copied
// from that document. If a schema drifts from it, this file stops compiling.
import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { AuditAction, AuditEntry, Operation, ReasonCode, Trigger } from './audit.ts';
import type { Change, ChangeSet, CommitReceipt } from './change-set.ts';
import type { Domain, PredicateDefinition } from './domain.ts';
import type { Embedder } from './embedder.ts';
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
};

type RefTrigger = 'agent' | 'person' | 'feedback' | 'maintenance';
type RefOperation = 'remember' | 'revision' | 'succession' | 'correction' | 'retraction';
type RefReasonCode = 'stated' | 'restated' | 'reported_wrong' | 'reported_ended';
type RefAuditAction =
  | 'entity.created'
  | 'source.recorded'
  | 'fact.recorded'
  | 'fact.source_attached'
  | 'fact.invalidated';

type RefAuditEntry = {
  readonly id: number;
  readonly namespace: RefNamespace;
  readonly operationId: string;
  readonly operation: RefOperation;
  readonly action: RefAuditAction;
  readonly targetKind: 'entity' | 'source' | 'fact';
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
  readonly Change: Same<Change, RefChange>;
  readonly ChangeSet: Same<ChangeSet, RefChangeSet>;
  readonly CommitReceipt: Same<CommitReceipt, RefCommitReceipt>;
  readonly FactWithSources: Same<FactWithSources, RefFactWithSources>;
  readonly LlmClient: Same<LlmClient, RefLlmClient>;
  readonly Embedder: Same<Embedder, RefEmbedder>;
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
  Change: true,
  ChangeSet: true,
  CommitReceipt: true,
  FactWithSources: true,
  LlmClient: true,
  Embedder: true,
};

describe('the types derived from the schemas', () => {
  it('have the shapes that INTERFACES.md commits to', () => {
    // The real check is the type of `parity` above, made by the compiler.
    expect(Object.values(parity).every((same) => same === true)).toBe(true);
    expect(Object.keys(parity)).toHaveLength(22);
  });
});
