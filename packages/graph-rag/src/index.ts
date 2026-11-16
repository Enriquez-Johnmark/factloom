import { corePackageName } from '@factloom/core';

/**
 * The packages this one is built on. A placeholder export, so that the scaffold can prove
 * that a workspace package is imported by name. The first real export replaces it.
 */
export const graphRagBuiltOn: readonly string[] = [corePackageName];

export { softwareDevelopmentDomain } from './software-development-domain.ts';
export type { ExplainedAuditEntry, FactHistoryEntry, GetFactHistoryInput } from './get-fact-history.ts';
export { getFactHistory } from './get-fact-history.ts';
export type { RecalledFact, RecallInput } from './recall.ts';
export { recall } from './recall.ts';
export type { StructuredFactInput } from './structured-fact-input.ts';
export type { ChangeFactInput } from './change-fact.ts';
export { changeFact } from './change-fact.ts';
