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
  TimeFilterSchema,
} from './fact.ts';
export type { LlmClient, LlmTask } from './llm-client.ts';
