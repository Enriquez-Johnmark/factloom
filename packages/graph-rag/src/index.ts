import { corePackageName } from '@factloom/core';

/**
 * The packages this one is built on. A placeholder export, so that the scaffold can prove
 * that a workspace package is imported by name. The first real export replaces it.
 */
export const graphRagBuiltOn: readonly string[] = [corePackageName];

export type { ChangeFactInput } from './change-fact.ts';
export { changeFact } from './change-fact.ts';
export type { ExplainedAuditEntry, FactHistoryEntry, GetFactHistoryInput } from './get-fact-history.ts';
export type { GiveFeedbackDeps, GiveFeedbackInput } from './give-feedback.ts';
export { giveFeedback } from './give-feedback.ts';
export { getFactHistory } from './get-fact-history.ts';
export type { RecalledFact, RecallInput, RecallSettings } from './recall.ts';
export { DEFAULT_RECALL_SETTINGS, recall, recallWithSettings } from './recall.ts';
export type { RememberedFact } from './read-remembered-facts.ts';
export type { RecordStructuredFactsInput } from './record-structured-facts.ts';
export { recordStructuredFacts } from './record-structured-facts.ts';
export type { RememberDeps, RememberInput, RememberResult, SkippedFact } from './remember.ts';
export { remember } from './remember.ts';
export type { CheckedField } from './check-for-secrets.ts';
export { checkForSecrets } from './check-for-secrets.ts';
export type { DependencyVersion } from './read-dependency-version.ts';
export { describeDependencyVersion, readDependencyVersion } from './read-dependency-version.ts';
export {
  findSymbolNames,
  EXACT_NAME_ENTITY_TYPES,
  PATH_VALUED_PREDICATES,
  softwareDevelopmentDomain,
} from './software-development-domain.ts';
export type { SourceInput } from './source-input.ts';
export type { StructuredFactInput } from './structured-fact-input.ts';
export type { Declaration } from './read-declarations.ts';
export { isMappedSourcePath, readDeclarations } from './read-declarations.ts';
export type { CodebaseMapCounts, CodebaseReader } from './record-codebase-map.ts';
export { MAP_FILE_SIZE_LIMIT, recordCodebaseMap } from './record-codebase-map.ts';
