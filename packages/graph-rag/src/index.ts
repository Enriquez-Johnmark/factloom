import { corePackageName } from '@factloom/core';

/**
 * The packages this one is built on. A placeholder export, so that the scaffold can prove
 * that a workspace package is imported by name. The first real export replaces it.
 */
export const graphRagBuiltOn: readonly string[] = [corePackageName];

export type { ChangeFactInput } from './change-fact.ts';
export { changeFact } from './change-fact.ts';
export type { ExplainedAuditEntry, FactHistoryEntry, GetFactHistoryInput } from './get-fact-history.ts';
export { getFactHistory } from './get-fact-history.ts';
export type { RecalledFact, RecallInput, RecallSettings } from './recall.ts';
export { PROVISIONAL_RECALL_SETTINGS, recall, recallWithSettings } from './recall.ts';
export type {
  RememberDeps,
  RememberedFact,
  RememberInput,
  RememberResult,
  SkippedFact,
} from './remember.ts';
export { remember } from './remember.ts';
export { softwareDevelopmentDomain } from './software-development-domain.ts';
export type { SourceInput } from './source-input.ts';
export type { StructuredFactInput } from './structured-fact-input.ts';
