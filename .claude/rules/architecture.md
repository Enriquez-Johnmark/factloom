---
paths:
  - "packages/**"
  - "apps/**"
---

# Architecture rules

## Dependencies point inward

- `core` imports no other `@factloom` package. `graph-rag` and `storage` import `core` and never each other. Apps may import any package.
- Import another package by its name, through its `index.ts`. Never use a relative path that leaves the package, a path alias, or a deep import.

```ts
import { recordFacts } from '@factloom/core'; // yes
import { recordFacts } from '../../core/src/operations/record-facts.ts'; // no
import { recordFacts } from '@factloom/core/src/operations/record-facts.ts'; // no
```

## Interfaces live in core

- `core` owns `MemoryStore`, `LlmClient` and `Embedder`. Outer packages implement them.
- Name an interface for what it is and an implementation for how: `MemoryStore`, `SqliteMemoryStore`. No `I` prefix.
- Add an interface only when there are two real implementations. A test fake counts as one.

## Pass dependencies as arguments

- A use case takes its dependencies as its first argument and its input as its second. No dependency injection container, no module-level singletons.
- Only the composition root, `apps/*/src/main.ts`, names concrete implementations.

```ts
export async function recall(deps: Pick<OperationDeps, 'store' | 'embedder' | 'now'>, input: RecallInput) {
  // ...
}
```

## Return a Result for expected failures

- A fallible operation returns `Result<T>` with a code from `ERROR_CODES` in `core`. Do not throw for an expected failure.
- Add an error code only when a caller would act differently on it.
- An adapter catches what its library throws and returns `storage_failed`, `llm_failed` or `embedding_failed`.

```ts
const found = await deps.store.getFact({ namespace, factId });
if (!found.ok) return found;
if (found.value === null) return err('not_found', `No fact ${factId} in this namespace.`);
```

## One use case per file

- One operation, one exported function, one file named for it: `recall` in `recall.ts`, `invalidateFact` in `invalidate-fact.ts`.
- An MCP tool handler, and later an HTTP route, does three things: translates the input, calls one use case, translates the `Result`. It holds no rule about facts.

## One public entry per package

- `src/index.ts` is the only file that re-exports. No barrel files inside a package.
- Export only what another package needs.

## Plain data and functions

- Data is plain, immutable objects with `readonly` fields. Behaviour is in functions. Do not write entity classes or class hierarchies.
- Use a pattern only where its problem appears, as a function or a typed object. A domain is an object, a correction policy is a value, a change is a tagged union.

## Writes go through one door

- Change memory only by calling a fact operation in `core`, which builds one `ChangeSet` and calls `store.commit`. Nothing else writes.
- Use the terms in `GLOSSARY.md` exactly, in names, comments and messages.
