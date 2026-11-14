---
paths:
  - "**/*.test.ts"
  - "**/testing/**"
  - "apps/mcp-server/evals/**"
---

# Testing rules

The plan is in `docs/architecture/TESTING.md`. These are the rules to follow when writing a test.

## Names are sentences

- A test name states the behaviour as a sentence that reads after "it". Someone who reads only the names should learn what the code does.
- Name the behaviour, not the function or the implementation.

```ts
describe('recall', () => {
  it('returns only current facts when no date is given', async () => {});
  it('returns the fact that was true on the as-of date', async () => {});
});
```

Not: `it('works')`, `it('recall test 2')`, `it('calls searchFactsByVector')`.

## Unit tests use fakes

- Test a use case with `createInMemoryStore`, `createScriptedLlm` and `createFakeEmbedder` from `@factloom/core`. `createTestDeps`, from the same package, builds all three with a fixed clock and a counting identifier generator. No database and no network.
- The helpers import no test framework. Do not add one to the source of `core`.
- Assert on the result and on what the store contains afterwards. Do not assert on which methods were called.
- A test that must make no LLM call passes a client that fails if it is called.
- Use a fixed clock and a counting identifier generator. No test depends on the real time or on random values.

```ts
import { createTestDeps, endFact } from '@factloom/core';

const deps = createTestDeps({ now: '2026-04-02T00:00:00.000Z' });
const result = await endFact(deps, {
  namespace,
  trigger: 'agent',
  reasonCode: 'reported_ended',
  factId,
  validTo,
  source,
  successor,
});
expect(result.ok).toBe(true);
```

## Storage adapters share one contract suite

- Every `MemoryStore` passes `describeMemoryStoreContract`. The suite lives in `packages/storage`, which runs it against the in-memory store from `core` and against the SQLite adapter.
- When a storage bug is found, add the case to the contract suite, not only to one adapter's tests.
- Adapter-specific tests cover only what the interface does not describe: migrations, triggers and connection settings.
- The suite takes a factory that returns a `MemoryStore`. `openSqliteMemoryStore` returns a `Result`, so unwrap it in the factory.

```ts
describeMemoryStoreContract(async () => createInMemoryStore());

describeMemoryStoreContract(async () => {
  const opened = await openSqliteMemoryStore({ path: ':memory:' });
  if (!opened.ok) throw new Error(opened.error.message);
  return opened.value;
});
```

## Time cases are explicit

- A test about time states its as-of date and its known-at date, even when one is now.
- Cover the boundary: a fact is not valid at its own `valid_to`.

## Results

- Check `result.ok` before reading `result.value`. For a failure, assert the error code, not the message text.

## Evals

- A scenario asserts on memory, by exact comparison of normalised values. It reads memory with `MemoryStore.listFacts` and `getFactHistory`, not with `recall`. No LLM judges an answer.
- Where scenario files live is decided in the roadmap stage. Add their path to this file's `paths` then.
- LLM responses in evals are replayed from recordings. A missing recording fails the run. Re-record deliberately, and review the diff.

## Keep tests honest

- One behaviour per test. Arrange, act, assert, in that order.
- Never skip, comment out or weaken a failing test to get a green run. Fix the code or fix the test's expectation, and say which.
- Test files sit beside the code they test: `recall.ts` and `recall.test.ts`.
