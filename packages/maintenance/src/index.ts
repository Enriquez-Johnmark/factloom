import { corePackageName } from '@factloom/core';

/**
 * The packages this one is built on. A placeholder export, so that the scaffold can prove
 * that a workspace package is imported by name. The conflict judge of FL-041 replaces it.
 */
export const maintenanceBuiltOn: readonly string[] = [corePackageName];
