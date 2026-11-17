/**
 * The name of this package. A placeholder export, so that the other packages can import
 * `@factloom/core` and the scaffold can prove the workspace resolves it. The first real
 * export replaces it.
 */
export const corePackageName = '@factloom/core';

export type { ErrorCode, FactloomError, Failure, Result, Success } from './result.ts';
export { ERROR_CODES, err, ok } from './result.ts';
export type { Timestamp } from './timestamp.ts';
export { parseDateInput, TimestampSchema, toTimestamp } from './timestamp.ts';
export type { AuditAction, AuditEntry, Operation, ReasonCode, Trigger } from './audit.ts';
export {
  AuditActionSchema,
  AuditEntrySchema,
  AuditTargetKindSchema,
  OperationSchema,
  ReasonCodeSchema,
  TriggerSchema,
} from './audit.ts';
export type { Change, ChangeSet, CommitReceipt } from './change-set.ts';
export { ChangeSchema, ChangeSetSchema, CommitReceiptSchema } from './change-set.ts';
export type { Domain, PredicateDefinition } from './domain.ts';
export { DomainSchema, PredicateDefinitionSchema } from './domain.ts';
export type { Embedder } from './embedder.ts';
export type { EntityMerge } from './entity-merge.ts';
export { EntityMergeSchema } from './entity-merge.ts';
export type { Feedback, FeedbackSignal } from './feedback.ts';
export { FeedbackSchema, FeedbackSignalSchema } from './feedback.ts';
export type {
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
export {
  EntityIdSchema,
  EntitySchema,
  FactIdSchema,
  FactObjectSchema,
  FactSchema,
  FactWithSourcesSchema,
  NamespaceSchema,
  SourceIdSchema,
  SourceSchema,
  PURGED_MARKER,
  TimeFilterSchema,
} from './fact.ts';
export type { LlmClient, LlmTask } from './llm-client.ts';
export type { ConflictJudge, ConflictJudgeInput, ConflictVerdict } from './conflict-judge.ts';
export { JUDGE_CANDIDATE_LIMIT } from './conflict-judge.ts';
export { normaliseEntityName } from './entity-name.ts';
export { createInMemoryStore } from './in-memory-store.ts';
export type { MemoryStore } from './memory-store.ts';
export type { OperationDeps } from './operation-deps.ts';
export type { ValidPeriod } from './valid-period.ts';
export { matchesTimeFilter, periodsOverlap } from './valid-period.ts';
export { createFakeEmbedder } from './create-fake-embedder.ts';
export { createScriptedLlm } from './create-scripted-llm.ts';
export type { TestDepsOptions } from './create-test-deps.ts';
export { createTestDeps, TEST_DOMAIN } from './create-test-deps.ts';
export type {
  ChangeContext,
  FactDraft,
  NewEntity,
  NewFact,
  NewSource,
} from './operations/operation-inputs.ts';
export type { RecordFactsInput } from './operations/record-facts.ts';
export { recordFacts } from './operations/record-facts.ts';
export type { InvalidateFactInput } from './operations/invalidate-fact.ts';
export { invalidateFact } from './operations/invalidate-fact.ts';
export type { EndFactInput } from './operations/end-fact.ts';
export { endFact } from './operations/end-fact.ts';
export type { ReviseValidTimeInput, ValidTimeRevision } from './operations/revise-valid-time.ts';
export { reviseValidTime } from './operations/revise-valid-time.ts';
export type { AdjustConfidenceInput } from './operations/adjust-confidence.ts';
export { adjustConfidence } from './operations/adjust-confidence.ts';
export type { RecordFeedbackInput } from './operations/record-feedback.ts';
export { recordFeedback } from './operations/record-feedback.ts';
export type { PurgeContentInput } from './operations/purge-content.ts';
export { purgeContent } from './operations/purge-content.ts';
export type { MergeEntitiesInput } from './operations/merge-entities.ts';
export { mergeEntities } from './operations/merge-entities.ts';
export type { FindConflictCandidatesInput } from './operations/find-conflict-candidates.ts';
export { findConflictCandidates } from './operations/find-conflict-candidates.ts';
