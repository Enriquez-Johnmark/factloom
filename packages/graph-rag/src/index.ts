import { corePackageName } from '@factloom/core';

/**
 * The packages this one is built on. A placeholder export, so that the scaffold can prove
 * that a workspace package is imported by name. The first real export replaces it.
 */
export const graphRagBuiltOn: readonly string[] = [corePackageName];

export { softwareDevelopmentDomain } from './software-development-domain.ts';
export type { ExplainedAuditEntry, FactHistoryEntry, GetFactHistoryInput } from './get-fact-history.ts';
export { getFactHistory } from './get-fact-history.ts';
