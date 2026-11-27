/** The one shared list of error codes. A code is added only when a caller would act differently on it. */
export const ERROR_CODES = [
  'invalid_input', // the input failed its schema, or names a type or predicate the domain does not have
  'not_found', // a fact, entity, source or merge does not exist in the namespace
  'already_invalidated', // the fact is no longer live
  'already_exists', // an entity with that name and type, or a row with that identifier, exists
  'conflict', // a live fact for the same subject and single-valued predicate overlaps in valid time
  'embedding_model_mismatch', // the embedder differs from the one the database was built with
  'storage_failed', // the database could not complete the operation
  'llm_failed', // the LLM call failed or returned output that did not match the schema
  'embedding_failed', // the embedder could not produce vectors
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type KronomindError = {
  readonly code: ErrorCode;
  /** Written for the caller: what went wrong and, where possible, what to do next. */
  readonly message: string;
  /** For `conflict` and `already_invalidated`: the facts in the way, or the superseding fact. */
  readonly relatedFactIds: readonly string[];
  readonly cause?: unknown;
};

/** A success that carries a value. */
export type Success<T> = { readonly ok: true; readonly value: T };

/** A failure that carries an error. It is assignable to a `Result` of any value type. */
export type Failure<E = KronomindError> = { readonly ok: false; readonly error: E };

/** What every fallible operation returns. Expected failures are values, not exceptions. */
export type Result<T, E = KronomindError> = Success<T> | Failure<E>;

/** Builds a successful result. */
export function ok<T>(value: T): Success<T> {
  return { ok: true, value };
}

/**
 * Builds a failed result. The message is written for the caller: what went wrong and what to
 * do next. `details` names the facts in the way and the underlying error, when there are any.
 */
export function err(
  code: ErrorCode,
  message: string,
  details: { readonly relatedFactIds?: readonly string[]; readonly cause?: unknown } = {},
): Failure {
  const error: KronomindError = { code, message, relatedFactIds: details.relatedFactIds ?? [] };
  // An absent cause is left out, not set to undefined, so the error has the same shape either way.
  return { ok: false, error: 'cause' in details ? { ...error, cause: details.cause } : error };
}
