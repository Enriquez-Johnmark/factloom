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
import type { EntityMerge } from './entity-merge.ts';
import type { FactUsage } from './fact-usage.ts';
import type { FactVerification } from './fact-verification.ts';
import type { Feedback } from './feedback.ts';
import type { ProposedChange } from './proposed-change.ts';
import type { Result } from './result.ts';
import type { Timestamp } from './timestamp.ts';

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
    /** Phase 3. Leave out archived facts, before the limit. For a question about now (FL-073). */
    readonly excludeArchived?: boolean;
  }): Promise<Result<readonly FactWithSources[]>>;

  /** Vector lane. Nearest first. The time filter is applied before the limit. */
  searchFactsByVector(query: {
    readonly namespace: Namespace;
    readonly vector: Float32Array;
    readonly time: TimeFilter;
    readonly limit: number;
    /** Phase 3. Leave out archived facts, before the limit. For a question about now (FL-073). */
    readonly excludeArchived?: boolean;
  }): Promise<Result<readonly FactWithSources[]>>;

  /** Keyword lane. Best match first. The time filter is applied before the limit. */
  searchFactsByKeyword(query: {
    readonly namespace: Namespace;
    readonly text: string;
    readonly time: TimeFilter;
    readonly limit: number;
    /** Phase 3. Leave out archived facts, before the limit. For a question about now (FL-073). */
    readonly excludeArchived?: boolean;
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

  /**
   * Phase 3. Records that recall returned these facts: for each, the time and a count raised
   * by one, in one write. Outside `commit`, with no audit entry: usage is bookkeeping, not
   * memory. A fact missing from the namespace is skipped. The first write of a namespace
   * records when its usage tracking began.
   */
  recordFactUsage(usage: {
    readonly namespace: Namespace;
    readonly factIds: readonly FactId[];
    readonly recalledAt: Timestamp;
  }): Promise<Result<null>>;

  /** Phase 3. When recall last returned a fact and how often, or null when it never did. */
  getFactUsage(query: {
    readonly namespace: Namespace;
    readonly factId: FactId;
  }): Promise<Result<FactUsage | null>>;

  /** Phase 3. When usage tracking began in a namespace: its first usage write, or null before it. */
  getUsageTrackingStart(query: { readonly namespace: Namespace }): Promise<Result<Timestamp | null>>;

  /** Phase 3. Every merge of the namespace, undone ones included, in the order they were made. */
  listEntityMerges(query: { readonly namespace: Namespace }): Promise<Result<readonly EntityMerge[]>>;

  /** Phase 2. The feedback on one fact, in the order it was given. */
  listFeedback(query: {
    readonly namespace: Namespace;
    readonly factId: FactId;
  }): Promise<Result<readonly Feedback[]>>;

  /**
   * Phase 3. The entities of a namespace as stored, merged ones included, in the order of their
   * identifiers: those after `afterEntityId`, or from the first when it is null, up to `limit`.
   */
  listEntities(query: {
    readonly namespace: Namespace;
    readonly afterEntityId: EntityId | null;
    readonly limit: number;
  }): Promise<Result<readonly Entity[]>>;

  /**
   * Phase 3. Current facts at `currentAt`, not archived, recorded before `unusedSince` and not
   * recalled since then, oldest first. Empty until usage tracking began on or before
   * `unusedSince`, so that a fact is never taken as unused before its usage was counted.
   */
  listUnusedFacts(query: {
    readonly namespace: Namespace;
    readonly currentAt: Timestamp;
    readonly unusedSince: Timestamp;
    readonly limit: number;
  }): Promise<Result<readonly FactWithSources[]>>;

  /** Phase 3. The verifications of one fact, in the order they were recorded. */
  listVerifications(query: {
    readonly namespace: Namespace;
    readonly factId: FactId;
  }): Promise<Result<readonly FactVerification[]>>;

  /**
   * Phase 3. Current facts at `currentAt` whose latest verification, or recording if none, is
   * before `notVerifiedSince`, least recently verified first; with `confidenceBelow`, also
   * current facts whose latest confidence is below it.
   */
  listStaleFacts(query: {
    readonly namespace: Namespace;
    readonly currentAt: Timestamp;
    readonly notVerifiedSince: Timestamp;
    readonly confidenceBelow: number | null;
    readonly limit: number;
  }): Promise<Result<readonly FactWithSources[]>>;

  /** Phase 3. Live facts whose every source is purged, or whose latest verification is `source_missing`, oldest first. */
  listOrphanedFacts(query: {
    readonly namespace: Namespace;
    readonly limit: number;
  }): Promise<Result<readonly FactWithSources[]>>;

  /** Phase 2 (FL-043). The pending proposals of a namespace, oldest first, each with the stored fact it would change. */
  listPendingProposals(query: {
    readonly namespace: Namespace;
  }): Promise<Result<readonly { readonly proposal: ProposedChange; readonly storedFact: FactWithSources }[]>>;

  close(): Promise<void>;
}
