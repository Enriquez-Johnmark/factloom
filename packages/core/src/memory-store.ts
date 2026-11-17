import type { AuditEntry } from './audit.ts';
import type { ChangeSet, CommitReceipt } from './change-set.ts';
import type {
  Entity,
  EntityId,
  FactId,
  FactWithSources,
  Namespace,
  Source,
  SourceId,
  TimeFilter,
} from './fact.ts';
import type { Feedback } from './feedback.ts';
import type { Result } from './result.ts';

/**
 * Where memory is kept. One interface, because the first thing every write needs is to be
 * atomic across facts, sources, embeddings and audit entries. `commit` is the only way to write.
 */
export interface MemoryStore {
  /** Applies every change or none, checks the single-value rule, and writes one audit entry per change. */
  commit(changeSet: ChangeSet): Promise<Result<CommitReceipt>>;

  /** Entities with this name, by exact match on the normalised name. One type, or every type. */
  findEntities(query: {
    readonly namespace: Namespace;
    readonly name: string;
    readonly type: string | null;
  }): Promise<Result<readonly Entity[]>>;

  getFact(query: {
    readonly namespace: Namespace;
    readonly factId: FactId;
  }): Promise<Result<FactWithSources | null>>;

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
  getSource(query: {
    readonly namespace: Namespace;
    readonly sourceId: SourceId;
  }): Promise<Result<Source | null>>;

  listAuditEntries(query: {
    readonly namespace: Namespace;
    readonly targetKind: AuditEntry['targetKind'];
    readonly targetId: string;
  }): Promise<Result<readonly AuditEntry[]>>;

  /** Phase 2, for purge. Every fact, live or not, linked to any of the sources, oldest first. */
  listFactsOfSources(query: {
    readonly namespace: Namespace;
    readonly sourceIds: readonly SourceId[];
  }): Promise<Result<readonly FactWithSources[]>>;

  /** Phase 2, for purge. The sources whose content has this hash, oldest first. */
  findSourcesByContentHash(query: {
    readonly namespace: Namespace;
    readonly contentHash: string;
  }): Promise<Result<readonly Source[]>>;

  /** Phase 2. The feedback on one fact, in the order it was given. */
  listFeedback(query: {
    readonly namespace: Namespace;
    readonly factId: FactId;
  }): Promise<Result<readonly Feedback[]>>;

  close(): Promise<void>;
}
