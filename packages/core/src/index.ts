/**
 * The name of this package. A placeholder export, so that the other packages can import
 * `@factloom/core` and the scaffold can prove the workspace resolves it. The first real
 * export replaces it.
 */
export const corePackageName = '@factloom/core';

export type { ErrorCode, FactloomError, Failure, Result, Success } from './result.ts';
export { ERROR_CODES, err, ok } from './result.ts';
