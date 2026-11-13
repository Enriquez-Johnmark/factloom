# Zod schemas are the source of types, and failures are Result values

Status: accepted

Every data type is derived from a Zod schema with `z.infer`. There are no separately written DTO interfaces and no hand-written validators. Data is plain and immutable, and behaviour is in functions, not in entity classes.

An operation that can fail in an expected way returns `Result<T>`, a discriminated union, with an error code from one shared list. It does not throw.

## Considered options

- **Interfaces plus hand-written validators.** Rejected: two descriptions of the same shape drift apart, and the drift shows up at run time.
- **Exceptions for expected failures.** Rejected: a thrown error is invisible in a function's type, so a caller can forget that `invalidateFact` may find the fact already invalidated. With `Result` the compiler makes the caller handle it.
- **A Result library.** Rejected: the type is four lines, and a dependency for it is not justified.

## Consequences

Unexpected failures, bugs, still throw. Adapters catch the exceptions of the libraries they wrap and return `storage_failed`, `llm_failed` or `embedding_failed`.
