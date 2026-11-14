# EPIC-02: Core model and fact operations

| | |
|---|---|
| Status | Pending |
| Phases | 0-1 |
| Packages | `packages/core` |
| Requirements | REQ-01, REQ-02, REQ-06, REQ-07, REQ-08, REQ-14, REQ-15, REQ-24, REQ-25, REQ-26, REQ-27 |

Nothing in this epic is implemented. Terms are used as defined in [`GLOSSARY.md`](../../../GLOSSARY.md). [`INTERFACES.md`](../../architecture/INTERFACES.md) is the specification of every shape and signature named here.

## Outcome

`@factloom/core` holds the model that everything else is written against: the `Result` type, timestamps, the schemas for entities, facts, sources, audit entries and change sets, the three interfaces, a complete in-memory `MemoryStore`, and the test helpers built on it. On top of it are the four phase 1 fact operations, which are the only way memory changes. Product 2 will call the same operations, so the rule that product 2 never writes to storage directly holds from the first commit.

## Scope

- `Result`, `ok`, `err` and the one list of error codes.
- `Timestamp`, `toTimestamp` and `parseDateInput`.
- Zod schemas and derived types for the data model, change sets and domains, and the interfaces `MemoryStore`, `LlmClient` and `Embedder`.
- The in-memory store: `commit` and the structural reads (FL-007), then the two retrieval lanes in simple form (FL-056).
- The entity-name normalisation function, `normaliseEntityName`, which every store uses.
- The test helpers `createTestDeps`, `createFakeEmbedder` and `createScriptedLlm` (FL-056).
- The fact operations `recordFacts`, `invalidateFact`, `endFact` and `findConflictCandidates`.

## Out of scope

- SQL and the SQLite adapter: [EPIC-03](EPIC-03.md).
- The storage contract suite: FL-012 in [EPIC-03](EPIC-03.md). It lives in `storage` and runs against the in-memory store built here.
- Extraction, entity resolution and the use cases `remember`, `recordStructuredFacts` and `changeFact`: EPIC-04.
- `recall`, rank fusion and `getFactHistory`: EPIC-05.
- The software development domain: FL-018 in EPIC-04.
- The Anthropic `LlmClient` (FL-019) and the local `Embedder` (FL-026). Core owns the interfaces only.
- The phase 2 and 3 operations in `INTERFACES.md`: EPIC-08 and EPIC-09.

## Boundaries and constraints

- **Core imports `zod` and nothing else** ([`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md)): no other `@factloom` package, no database, LLM, embedding or MCP library, no Node built-in module, and no test framework in its source files.
- **Zod schemas are the source of types, and expected failures are `Result` values** ([ADR 0004](../../architecture/adr/0004-zod-schemas-and-result-values.md)).
- **Dependencies are passed as arguments** ([ADR 0003](../../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md)). An operation takes its dependencies first and its input second. The clock and the identifier generator are dependencies.
- **A fact changes only by being invalidated once** ([ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md)). Ending a fact writes a copy.
- **One `commit` writes everything** ([ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md)). Each operation builds one change set and commits it once.
- **Conflicts are keyed by subject and predicate** ([ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md)), and every row belongs to a namespace ([ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md)).
- **One operation, one exported function, one file**, and `src/index.ts` is the only file that re-exports ([architecture rules](../../../.claude/rules/architecture.md)).

## Dependencies

- [EPIC-01](EPIC-01.md): the workspace and `pnpm check` (FL-001).

No other epic is needed. Epics 03 to 09 depend on this one.

## Deliverables

- The public API of `@factloom/core` as listed in [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md), with the phase 1 operations.
- An in-memory `MemoryStore` that passes the storage contract suite (FL-012).
- The three test helpers, exported from the package entry.
- Unit tests for every operation, run against the in-memory store with a fixed clock.

## Success criteria

- `pnpm check` passes, and the lint rule of FL-001 still shows no forbidden import in `core`.
- The types exported from `core` are mutually assignable with the shapes in `INTERFACES.md`, shown by a type-level test.
- The PostgreSQL succession and the Node correction of the [fact-schema spike](../../../spikes/fact-schema/README.md) can be produced by calling `recordFacts`, `endFact` and `invalidateFact` on the in-memory store, and the seven rows of the spike's time table are then answered correctly by `listFacts`. A unit test named for this passes.
- No test in `core` uses the real time or a random value.

## Work items

| ID | Title | Phase | Depends on | Status |
|---|---|---|---|---|
| FL-004 | Result type and the shared error codes | 0 | FL-001 | Pending |
| FL-005 | Timestamps and date input | 0 | FL-004 | Pending |
| FL-006 | Schemas and types for entities, facts, sources, audit entries, change sets and domains | 0 | FL-005 | Pending |
| FL-007 | MemoryStore interface and the in-memory store: commit and structural reads | 0 | FL-006 | Pending |
| FL-056 | In-memory search lanes and test helpers | 0 | FL-007 | Pending |
| FL-008 | recordFacts operation, including restatement | 1 | FL-007, FL-056 | Pending |
| FL-009 | invalidateFact operation: retraction and correction | 1 | FL-008, FL-056 | Pending |
| FL-010 | endFact operation: ending a fact and succession | 1 | FL-008, FL-056 | Pending |
| FL-011 | findConflictCandidates operation | 1 | FL-007, FL-056 | Pending |

### FL-004: Result type and the shared error codes

| | |
|---|---|
| Status | Pending |
| Phase | 0 |
| Depends on | FL-001 |
| Requirements | REQ-24 |
| Components | `packages/core` |

**Objective.** Give every fallible function in the codebase one return shape and one list of error codes.

**Background.** [ADR 0004](../../architecture/adr/0004-zod-schemas-and-result-values.md) decides that expected failures are values and that the type is written by hand, with no library. The shapes are in [`INTERFACES.md`](../../architecture/INTERFACES.md), "Result and errors".

**Outcome.** Any later work item can return `ok(value)` or `err(code, message)` and have the compiler make its caller handle the failure.

**Scope.**
- `Result<T, E>`, `FactloomError`, `ERROR_CODES` and `ErrorCode`, as in `INTERFACES.md`.
- The constructors `ok` and `err`.
- Their export from the package entry.

**Non-goals.**
- Helper functions for chaining or mapping results. Callers use `if (!result.ok) return result`, as the [architecture rules](../../../.claude/rules/architecture.md) show.
- A mapping from error codes to MCP tool errors: EPIC-06.
- Any new error code. A code is added only when a caller would act differently on it.

**Functional requirements.**
1. `ERROR_CODES` holds exactly the nine codes of `INTERFACES.md`, in that order: `invalid_input`, `not_found`, `already_invalidated`, `already_exists`, `conflict`, `embedding_model_mismatch`, `storage_failed`, `llm_failed`, `embedding_failed`.
2. `ok(value)` returns `{ ok: true, value }`.
3. `err(code, message)` returns `{ ok: false, error }` with `relatedFactIds` empty. An optional third argument carries `relatedFactIds` and `cause`.
4. A failed result is assignable to `Result<U>` for any `U`, so a function can return the failure of a call it made without rebuilding it.

**Technical requirements.**
1. No dependency is added. This item does not need `zod`.
2. `ErrorCode` is derived from `ERROR_CODES` with `as const`, as in `INTERFACES.md`. No `enum`.
3. `cause` is an optional property and is left out, not set to `undefined`, when not given, as `exactOptionalPropertyTypes` requires.
4. Each exported function has a doc comment.

**Constraints.**
- [ADR 0004](../../architecture/adr/0004-zod-schemas-and-result-values.md).
- [TypeScript rules](../../../.claude/rules/typescript.md).
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): the "Result" group of core's public API.

**Acceptance criteria.**
- [ ] Unit test "lists the nine error codes in the documented order" passes.
- [ ] Unit test "builds a failure with no related facts unless they are given" passes.
- [ ] Unit test "leaves out the cause when none is given" passes.
- [ ] A type-level test passes in the type check: a `switch` over `ErrorCode` with a `never` default compiles, and compiles no longer when one case is removed. The second half is shown once by hand and the compiler output recorded.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests in `core`; the type check.

**Completion evidence.** The commit and the passing `pnpm check` output.

### FL-005: Timestamps and date input

| | |
|---|---|
| Status | Pending |
| Phase | 0 |
| Depends on | FL-004 |
| Requirements | REQ-02 |
| Components | `packages/core` |

**Objective.** Provide the one function that produces a stored timestamp and the one function that reads a date from a caller.

**Background.** Every timestamp is fixed-width UTC text, `YYYY-MM-DDTHH:MM:SS.sssZ`, so that text order equals time order ([ADR 0007](../../architecture/adr/0007-timestamps-as-fixed-width-utc-text.md)). The database checks the form but not calendar validity: it accepts `9999-99-99T99:99:99.999Z` ([`SCHEMA.md`](../../architecture/SCHEMA.md), "Notes on the columns"). So the producer in `core` is the only guard against an impossible date. A caller may give a date as a full timestamp or as a calendar date, which means 00:00 UTC of that day ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Dates").

**Outcome.** No later code builds a timestamp string by hand or calls `toISOString` itself. A malformed date from an agent becomes `invalid_input` at one place.

**Scope.**
- The branded type `Timestamp` and its Zod schema `TimestampSchema`.
- `toTimestamp`, which turns a `Date` into a `Timestamp`.
- `parseDateInput`, which turns caller text into a `Result<Timestamp>`.
- `zod` as the first dependency of `core`, pinned in the catalog.

**Non-goals.**
- Imprecise dates such as "March 2026" or "in 2023". They are not represented (ADR 0007, and open question Q-29).
- Time zones and offsets. Input with an offset is refused, not converted.
- Relative dates such as "last week". Extraction resolves them: FL-021.
- Date arithmetic or comparison helpers. Timestamps compare as text.
- The `TimeFilter` type: FL-006.

**Functional requirements.**
1. `toTimestamp` returns the 24-character UTC form with milliseconds for any `Date` whose year is from 0000 to 9999.
2. `toTimestamp` throws for an invalid `Date` and for a year outside that range. Both are programming errors, not expected failures, and the wider year form would break the fixed width.
3. `parseDateInput` accepts exactly two forms: the full form above, and `YYYY-MM-DD`. A calendar date becomes 00:00:00.000 UTC of that day.
4. `parseDateInput` returns `invalid_input` for anything else. The cases include: a space in place of `T`; no milliseconds; an offset such as `+01:00`; lower-case `z`; surrounding white space; an empty string; and a well-formed text that names an impossible date or time, such as `2026-02-30` or `2026-01-10T24:00:00.000Z`.
5. `TimestampSchema` accepts and rejects exactly what the full form of `parseDateInput` does, and its output type is `Timestamp`.
6. For any accepted input, the text order of two results equals their order in time.

**Technical requirements.**
1. `Timestamp` is `string & { readonly __brand: 'Timestamp' }`, as in [`INTERFACES.md`](../../architecture/INTERFACES.md). The brand is applied in this module only.
2. Calendar validity is checked by a round trip: the parsed instant, written back, equals the input.
3. The `zod` version is the one verified in the [toolchain research](../../research/technical/toolchain.md), or a newer one read from the registry and cited.
4. The error message of `parseDateInput` names the two accepted forms, so an agent can correct its call.

**Constraints.**
- [ADR 0007](../../architecture/adr/0007-timestamps-as-fixed-width-utc-text.md).
- [TypeScript rules](../../../.claude/rules/typescript.md), "Time and identifiers".
- [Data rules](../../../.claude/rules/data.md), "Timestamps".

**Acceptance criteria.**
- [ ] Unit test "writes a date as fixed-width UTC text with milliseconds" passes.
- [ ] Unit test "refuses a date outside the years 0000 to 9999" passes.
- [ ] Unit test "reads a calendar date as the start of that day in UTC" passes, with `2026-03-15` giving `2026-03-15T00:00:00.000Z`.
- [ ] Unit test "returns invalid_input for every other form" passes, with one case per form listed in functional requirement 4, and with the three malformed forms the [fact-schema spike](../../../spikes/fact-schema/check.mjs) uses.
- [ ] Unit test "orders as text the way it orders in time" passes on a list that includes two instants one millisecond apart.
- [ ] `git grep -n "toISOString" -- packages apps` shows matches in the timestamp module and its test only.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests in `core`, with no fakes: these are pure functions.

**Completion evidence.** The commit and the passing `pnpm check` output.

### FL-006: Schemas and types for entities, facts, sources, audit entries, change sets and domains

| | |
|---|---|
| Status | Pending |
| Phase | 0 |
| Depends on | FL-005 |
| Requirements | REQ-01, REQ-02, REQ-07, REQ-08, REQ-25, REQ-26, REQ-27, REQ-31 |
| Components | `packages/core` |

**Objective.** Write the data model once, as Zod schemas with derived types, so that every package shares one description of a fact and of a change to memory.

**Background.** [`INTERFACES.md`](../../architecture/INTERFACES.md), "Data types", "Storage", "LLM client", "Embedder" and "Domain", gives every shape. They were type-checked together as hand-written declarations; this item writes them as schemas ([ADR 0004](../../architecture/adr/0004-zod-schemas-and-result-values.md)). The schema of a change set is where a store rejects a malformed change set with `invalid_input`, so its rules matter to both stores.

**Outcome.** A later work item imports `Fact`, `ChangeSet` or `Domain` from `@factloom/core` and parses outside data with the matching schema. The in-memory store and the SQLite adapter validate a change set with the same schema and so refuse the same inputs.

**Scope.**
- Schemas and derived types for: `Entity`, `FactObject`, `Fact`, `Source`, `Trigger`, `Operation`, `ReasonCode`, `AuditAction`, `AuditEntry`, `TimeFilter`, `PredicateDefinition`, `Domain`, `Change`, `ChangeSet`, `CommitReceipt`, `FactWithSources`.
- The identifier aliases `Namespace`, `EntityId`, `FactId`, `SourceId`.
- The interfaces `LlmClient`, with `LlmTask`, and `Embedder`, as type declarations. Work items FL-019, FL-026 and FL-028 depend on this item for them.
- Their export from the package entry.

**Non-goals.**
- The `MemoryStore` interface: FL-007.
- The operation input types: `OperationDeps` in FL-007; `ChangeContext`, `NewSource`, `NewEntity`, `NewFact` and `FactDraft` in FL-008.
- Any domain's content. The software development domain is FL-018.
- The values that phases 2 and 3 add to `Operation`, `ReasonCode`, `AuditAction` and `Change`.
- Schemas for MCP tool input, or for LLM extraction output.

**Functional requirements.**
1. Each derived type is mutually assignable with the shape of the same name in `INTERFACES.md`. Absent values are `null`, not optional properties.
2. `FactSchema` rejects: a confidence outside 0 to 1; `validFrom` not before `validTo` when both are given; `invalidatedAt` before `createdAt`; `supersededByFactId` given while `invalidatedAt` is null; `supersededByFactId` equal to the fact's own identifier; an empty statement or predicate. These mirror the `CHECK` constraints in [`SCHEMA.md`](../../architecture/SCHEMA.md).
3. `FactObjectSchema` is a discriminated union on `kind` and rejects an object with both or neither of an entity and a value.
4. `ChangeSetSchema` rejects: a `record_fact` change with no source identifier; an entity, source or fact whose namespace differs from the change set's; an empty `operationId`.
5. `AuditEntrySchema` restricts `detail` to a flat record of strings, numbers and nulls.
6. `Operation`, `ReasonCode`, `AuditAction`, `Trigger` and the audit `targetKind` are closed lists with exactly the phase 1 values of `INTERFACES.md`.
7. `DomainSchema` rejects a domain with two predicates of the same name, or with no entity type.
8. Every object schema is strict: an unknown key is refused.

**Technical requirements.**
1. Each schema is named `ThingSchema` and its type `Thing`, derived with `z.infer`. No shape is written twice as a schema and as a separate interface. `LlmClient` and `Embedder` are the exception: they hold functions and are declared as types.
2. An embedding in a change is a `Float32Array` or `{ copyFromFactId }`. The schema checks the instance and a length above zero. It does not check the size against a model, which is the store's job.
3. Derived types are read-only as in `INTERFACES.md`. How that is achieved with Zod is the implementer's choice, checked against the Zod documentation.
4. One schema per file is not required. Files are split by subject, and no file inside the package re-exports another.

**Constraints.**
- [ADR 0004](../../architecture/adr/0004-zod-schemas-and-result-values.md): schemas are the source of types.
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md): a namespace on every entity, fact, source and audit entry.
- [TypeScript rules](../../../.claude/rules/typescript.md): no `any`, no `enum`, `null` for absent values.
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): the "Schemas and types" group of core's public API.

**Acceptance criteria.**
- [ ] A type-level test passes in the type check: for each of the sixteen types in scope and for `LlmClient` and `Embedder`, the exported type and a copy of the declaration from `INTERFACES.md` are assignable to each other.
- [ ] Unit test "accepts the facts of the PostgreSQL and Node timeline" passes, with the seven fact rows that the [fact-schema spike](../../../spikes/fact-schema/check.mjs) writes in its example namespace, as `Fact` values.
- [ ] Unit test "rejects a fact that breaks a rule the database also enforces" passes, with one case per rule in functional requirement 2.
- [ ] Unit test "rejects a change set that records a fact with no source" passes.
- [ ] Unit test "rejects a change set that holds a row from another namespace" passes.
- [ ] Unit test "rejects free text nested in an audit entry's detail" passes.
- [ ] Unit test "rejects a domain with a repeated predicate name" passes.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests in `core`; the type-level test in the type check.

**Completion evidence.** The commit and the passing `pnpm check` output.

### FL-007: MemoryStore interface and the in-memory store: commit and structural reads

| | |
|---|---|
| Status | Pending |
| Phase | 0 |
| Depends on | FL-006 |
| Requirements | REQ-01, REQ-06, REQ-07, REQ-08, REQ-15, REQ-25 |
| Components | `packages/core` |

**Objective.** Declare the storage interface and build the in-memory implementation of its write path and its structural reads.

**Background.** `MemoryStore` is in [`INTERFACES.md`](../../architecture/INTERFACES.md), "Storage", with the rules a caller must know and the error table for `commit`. The in-memory store is a real implementation, not a mock ([`TESTING.md`](../../architecture/TESTING.md), "Unit tests"): it exists so that `graph-rag` can be tested without importing `@factloom/storage`, and the contract suite runs against it so that it cannot drift from the SQLite adapter. The single-value rule is checked inside `commit`, after the changes are applied ([ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md)).

The item was split to fit one session. It keeps the interface, `commit` and the reads that find facts by structure. The two retrieval lanes of the in-memory store and the test helpers are FL-056. The exhaustive cases belong to the contract suite (FL-012), not to this item's tests.

**Outcome.** `createInMemoryStore()` returns a `MemoryStore` that a test can commit to and read from by identifier, by structure and by time.

**Scope.**
- The `MemoryStore` interface, exactly as in `INTERFACES.md`: `commit`, `findEntities`, `getFact`, `listFacts`, `searchFactsByVector`, `searchFactsByKeyword`, `listAuditEntries`, `close`.
- The type `OperationDeps`.
- `normaliseEntityName`: lower case, trimmed, runs of white space collapsed ([`SCHEMA.md`](../../architecture/SCHEMA.md), `entity.name_key`). It is exported from the package entry, as [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md) lists under "Names", so that every store matches entity names the same way.
- `createInMemoryStore`, implementing `commit`, `findEntities`, `getFact`, `listFacts`, `listAuditEntries` and `close`.
- Unit tests for the behaviours listed under acceptance criteria.

**Non-goals.**
- The full contract suite: FL-012. This item's tests cover one case per behaviour.
- `searchFactsByVector` and `searchFactsByKeyword` on the in-memory store: FL-056. In this item the two methods exist on the returned object, as the interface requires, and return `storage_failed` with a message that says the lane is not built yet. `commit` already keeps each fact's vector, so FL-056 adds only the two reads.
- The test helpers `createFakeEmbedder`, `createScriptedLlm` and `createTestDeps`: FL-056. This item's tests build their change sets by hand, with fixed identifiers, timestamps and small vectors.
- Resolving entity identifiers through merges: FL-052.
- Persistence, or behaviour with two processes.
- The record-and-replay wrapper for the LLM client: FL-028.
- Any fact operation: FL-008 to FL-011.

**Functional requirements.**

`commit`:
1. Validates the change set with `ChangeSetSchema` and returns `invalid_input` when it fails.
2. Applies the changes in order: `create_entity`, `record_source`, `record_fact`, `attach_source`, `invalidate_fact`. A change may refer to an entity, source or fact created earlier in the same change set.
3. Applies every change or none. After a failed commit, every read returns what it returned before.
4. Returns the codes of the error table in `INTERFACES.md`: `not_found` for a missing fact, entity or source in the namespace, including the fact named by `copyFromFactId`; `already_invalidated` for a fact to invalidate or attach to that is no longer live, with the superseding fact in `relatedFactIds` if there is one; `already_exists` for a second entity with the same type and normalised name in the namespace, or an identifier already used; `embedding_model_mismatch` for a vector whose size differs from the size of the vectors already held.
5. Checks the single-value rule after applying the changes: for each fact recorded with `singleValued: true`, if another live fact in the namespace has the same subject and predicate and an overlapping valid period, the commit fails with `conflict` and names the overlapping facts. A missing bound counts as open. Periods that only touch do not overlap. The object is not compared.
6. Writes one audit entry per change, in change order, each with the change set's `operationId`, `operation`, `trigger`, `reasonCode`, `explainedBySourceId` and `occurredAt`. The action is `entity.created`, `source.recorded`, `fact.recorded`, `fact.source_attached` or `fact.invalidated`. The receipt's `auditEntryCount` equals the number of changes.
7. Invalidating a fact sets `invalidatedAt` to the change set's `occurredAt` and sets `supersededByFactId` as given. Nothing else about a stored fact ever changes, and no fact is ever removed.

Reads:
8. Every read filters on the namespace. Nothing from another namespace is returned or linked.
9. `listFacts` applies every filter that is given: subject, predicate, `touchingEntityIds` (subject or object), `supersededByFactId`. Its `time` takes one of three forms. With a `TimeFilter` it applies the four conditions of the time predicate in [`SCHEMA.md`](../../architecture/SCHEMA.md). With `'live'` it returns every live fact, at any valid time. With `'all'` it returns invalidated facts too. It returns the newest first by `createdAt`, up to `limit`.
10. `getFact` returns the fact whatever its time, with its subject, its object entity if it has one, and all its sources, or `null`.
11. `findEntities` matches the name with `normaliseEntityName`, for one type or for every type when `type` is null.
12. `listAuditEntries` returns the entries for one target in the order they were written.
13. A read with a limit below 1 returns `invalid_input`. A read that finds nothing returns an empty list or `null`.

**Technical requirements.**
1. The interface text is copied from `INTERFACES.md`. A difference found necessary while implementing is raised as a change to that document first, not made silently.
2. The store keeps its data in arrays or maps private to the closure. Values handed out are not the stored objects, so a caller cannot change memory by mutating a result.
3. The overlap test is one small pure function with its own unit tests. FL-011 uses the same function.
4. `createInMemoryStore` and `normaliseEntityName` are ordinary exports of `src/index.ts` and import no test framework and no Node built-in module. There is no second entry for tests ([`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md)).
5. Methods return promises, as the interface requires, although nothing here is asynchronous.

**Constraints.**
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md): one write method; the store enforces and decides nothing.
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): a fact changes only by one invalidation.
- [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md): the key and the overlap rule.
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md): namespaces.
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): core imports only `zod`.
- [Testing rules](../../../.claude/rules/testing.md): assert on what the store contains, not on which methods were called.

**Acceptance criteria.**
- [ ] A type-level test passes: the exported `MemoryStore` and a copy of the declaration from `INTERFACES.md` are assignable to each other.
- [ ] Unit test "applies none of a change set when its last change fails" passes: after a commit that creates an entity, records a source and a fact, and then invalidates a missing fact, `findEntities`, `listFacts` with `'all'` and `listAuditEntries` return nothing.
- [ ] Unit test "writes one audit entry per change with one operation identifier" passes.
- [ ] Unit test "refuses a second open-ended value for a single-valued predicate" passes with `conflict` and the stored fact's identifier in `relatedFactIds`.
- [ ] Unit test "accepts a period that starts where another ends" passes.
- [ ] Unit test "accepts a change set that invalidates a fact and records its replacement" passes.
- [ ] Unit test "does not apply the single-value rule to a multi-valued predicate" passes.
- [ ] Unit test "returns each documented error code from commit" passes, with one case per code in functional requirement 4 and one for `invalid_input`.
- [ ] Unit test "returns a fact for an as-of date inside its valid period and not at its end" passes, with the as-of date and the known-at date both stated.
- [ ] Unit test "returns what was believed at the known-at date" passes: a fact invalidated later is returned for a known-at date before the invalidation and not after.
- [ ] Unit test "returns every live fact whatever its valid time" passes: with `time: 'live'`, an ended fact and a current fact are returned and an invalidated fact is not.
- [ ] Unit test "returns nothing from another namespace" passes for `findEntities`, `getFact`, `listFacts` and `listAuditEntries`.
- [ ] Unit test "finds an entity by its normalised name" passes, with `"  Example  Repo "` matching `"example repo"`.
- [ ] Unit test "says that a lane is not built yet" passes: each of the two search methods returns `storage_failed`.
- [ ] `git grep -n "vitest" -- packages/core/src` shows matches in `*.test.ts` files only.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests in `core`. The contract suite of FL-012 is the fuller proof and is that item's acceptance, not this one's.

**Completion evidence.** The commit and the passing `pnpm check` output.

### FL-056: In-memory search lanes and test helpers

| | |
|---|---|
| Status | Pending |
| Phase | 0 |
| Depends on | FL-007 |
| Requirements | REQ-03, REQ-04 |
| Components | `packages/core` |

**Objective.** Complete the in-memory store with the two retrieval lanes in simple form, and add the three test helpers that later unit tests use.

**Background.** This item is the second part of FL-007, split off so that each part fits one session. [`TESTING.md`](../../architecture/TESTING.md), "Unit tests", describes the helpers: `createScriptedLlm`, `createFakeEmbedder` and `createTestDeps`, exported with `createInMemoryStore` from the one `index.ts` of `core`, with no separate entry for tests and no test framework imported. The same section says the in-memory store's keyword and vector ranking is naive, so tests that use it assert on which facts are returned, not on their exact order. The time filter is applied inside each lane, before the limit ([ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md)); the in-memory lanes follow that rule so that a use case tested on this store meets the same behaviour on SQLite.

**Outcome.** `createInMemoryStore()` is a complete `MemoryStore`. `createTestDeps()` gives a test everything an operation needs, with a fixed clock and predictable identifiers.

**Scope.**
- `searchFactsByVector` and `searchFactsByKeyword` on the in-memory store, replacing the `storage_failed` results of FL-007.
- `createFakeEmbedder`, `createScriptedLlm` and `createTestDeps`.
- Their export from the package entry.
- Unit tests for the behaviours listed under acceptance criteria.

**Non-goals.**
- Realistic ranking in the two lanes. Tests that use this store assert on which facts are returned, not on their order (`TESTING.md`).
- The full contract suite, including its lane groups: FL-012.
- The keyword lane on FTS5 and the vector lane in SQLite: FL-016 and FL-017.
- The record-and-replay wrapper for the LLM client: FL-028.
- A helper that fakes a store. Tests use the real in-memory store.

**Functional requirements.**
1. `searchFactsByVector` returns facts in the namespace ordered by cosine distance to the query vector, nearest first, up to `limit`. A query vector whose size differs from the vectors held returns `invalid_input`.
2. `searchFactsByKeyword` returns facts in the namespace whose statement contains one or more words of the text, ignoring case, ordered by how many words match, up to `limit`. A text with no word returns an empty list.
3. Both lanes apply the four conditions of the time predicate in [`SCHEMA.md`](../../architecture/SCHEMA.md) before the limit, so a lane never spends its limit on a fact outside the time filter.
4. Both lanes return each fact as `FactWithSources`. A limit below 1 returns `invalid_input`. Nothing from another namespace is returned.
5. `createFakeEmbedder()` returns an `Embedder` with a fixed model name and a small fixed number of dimensions. The same text always gives the same vector, and two different texts give different vectors. The purpose, `statement` or `question`, does not change the vector.
6. `createScriptedLlm(responses)` returns an `LlmClient` that gives the responses in order, each parsed with the request's schema, and returns `llm_failed` when a response does not match. It throws when called more often than there are responses. With an empty list it is the client that fails on any call.
7. `createTestDeps(options)` returns the dependencies of an operation, as `OperationDeps` with an `LlmClient` added: an in-memory store, the fake embedder, a scripted LLM, a small built-in test domain with one single-valued and one multi-valued predicate, a clock fixed at the given time, and an identifier generator that counts. Options allow the time, the domain, the scripted responses and an existing store to be given, so that a later step of one test can run at a later time on the same memory.

**Technical requirements.**
1. The helpers import no test framework and no Node built-in module. "Fails the test" means throwing an `Error`.
2. The helpers are ordinary exports of `src/index.ts`, in the "Test helpers" group of [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md). There is no second entry for tests.
3. The fixed clock returns a `Timestamp` built with `toTimestamp` or parsed with `parseDateInput` (FL-005). No helper reads the real time or a random value.
4. The lanes read the vectors and statements that `commit` (FL-007) already keeps. This item changes nothing about what a commit stores.

**Constraints.**
- [ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md): the time filter inside each lane.
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md): namespaces.
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): core imports only `zod`; one public entry.
- [Testing rules](../../../.claude/rules/testing.md): "Unit tests use fakes".

**Acceptance criteria.**
- [ ] Unit test "returns the nearest fact first in the vector lane" passes, with three facts at clearly different distances.
- [ ] Unit test "returns the facts whose statement holds a word of the text" passes, ignoring case.
- [ ] Unit test "applies the time filter before the limit in both lanes" passes: with a limit of 1, each lane returns the current fact although an invalidated fact matches better. The test states its as-of date and its known-at date.
- [ ] Unit test "returns a copied fact through the vector lane" passes: a fact recorded with `{ copyFromFactId }` is returned for the vector of the fact it copies.
- [ ] Unit test "returns nothing from another namespace" passes for both lanes.
- [ ] Unit test "the fake embedder gives the same vector for the same text" passes, and "gives different vectors for different texts" passes.
- [ ] Unit test "the scripted LLM gives its responses in order" passes, and "the scripted LLM throws when called more often than scripted" passes.
- [ ] Unit test "the scripted LLM returns llm_failed for a response that does not match the schema" passes.
- [ ] Unit test "test dependencies give the same identifiers and time on every run" passes.
- [ ] Unit test "a later step can run at a later time on the same memory" passes: two sets of test dependencies share one store and have different clocks.
- [ ] `git grep -n "vitest" -- packages/core/src` shows matches in `*.test.ts` files only.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests in `core`. The lane groups of the contract suite (FL-012) are the fuller proof and are that item's acceptance.

**Completion evidence.** The commit and the passing `pnpm check` output.

### FL-008: recordFacts operation, including restatement

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-007, FL-056 |
| Requirements | REQ-01, REQ-07, REQ-08, REQ-14, REQ-24 |
| Components | `packages/core` |

**Objective.** Record what was learned from one source, in one commit: the source, new entities, new facts, and the source attached to each live fact it states again.

**Background.** The signature and behaviour are in [`INTERFACES.md`](../../architecture/INTERFACES.md), "Fact operations", "Phase 1". This is the write behind `remember` and `recordStructuredFacts`. A restatement writes no fact row: the existing fact gains the source ([`SCHEMA.md`](../../architecture/SCHEMA.md), "How each change is written"). The operation is all or nothing; deciding which facts to leave out is the caller's job.

**Outcome.** A use case hands over drafts and the identifiers of restated facts and gets back the identifiers of what was recorded, or one error and unchanged memory.

**Scope.**
- The types `ChangeContext`, `NewSource`, `NewEntity`, `NewFact` and `FactDraft`.
- `recordFacts`, in a file of its own, exported from the package entry.
- Unit tests against the in-memory store.

**Non-goals.**
- Deciding whether a draft restates or conflicts with a stored fact. The caller does that with `findConflictCandidates` (FL-011) in the use cases FL-023 and FL-024.
- Entity resolution: FL-020. Drafts arrive with entity identifiers.
- Extraction: FL-021. The secret check: FL-022.
- Recording part of the input when one draft conflicts.

**Functional requirements.**
1. Returns `invalid_input` and commits nothing when: there is no draft and no restated fact; a draft's predicate is not in the domain; a new entity's type is not in the domain; or a draft fails `FactSchema`'s rules, such as a reversed valid period.
2. Gives the source an identifier from `newId` and a content hash, the SHA-256 of its content in hex, or `null` when the content is `null`.
3. Embeds the statements of all drafts in one call to the embedder, with the purpose `statement`. If the embedder fails, returns `embedding_failed` and commits nothing. With no draft, the embedder is not called.
4. Builds one change set with `operation: 'remember'`, in this order: the source; each new entity once, even when several drafts name it; each fact with the new source as its source and `singleValued` taken from the domain's predicate; an `attach_source` for each restated fact.
5. Every new row carries the namespace of the context and a `createdAt` from `now`, read once. The change set's `occurredAt` is the same instant, and its `explainedBySourceId` is the new source.
6. Commits once. Returns the source identifier and the fact identifiers in draft order.
7. Returns the store's error unchanged: `not_found` for a missing restated fact or a missing entity; `already_invalidated` for a restated fact that is no longer live; `already_exists` for a new entity that exists; `conflict` when a draft overlaps a live fact; `storage_failed`.
8. An input with restated facts and no draft is valid: it records the source and attaches it.

**Technical requirements.**
1. The signature is the one in `INTERFACES.md`.
2. Building the change set is a pure function, tested without a store, as [`TESTING.md`](../../architecture/TESTING.md) asks.
3. The hash is computed without importing a Node built-in module, because core may import only `zod`. The implementer checks which global is available across the supported Node range and cites the Node documentation in the commit.
4. No time or identifier comes from anywhere but `deps.now` and `deps.newId`.

**Constraints.**
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md): one change set, one commit.
- [Architecture rules](../../../.claude/rules/architecture.md): "Writes go through one door", one operation per file.
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md).

**Acceptance criteria.**
- [ ] Unit test "records a source, a new entity and a fact in one commit" passes: afterwards `getFact` returns the fact with that source, and the audit entries for the commit share one operation identifier and read `source.recorded`, `entity.created`, `fact.recorded`.
- [ ] Unit test "attaches the source to a restated fact and records no second fact" passes: `listFacts` with `'all'` returns one fact, and it has two sources.
- [ ] Unit test "records nothing when one draft conflicts with a live fact" passes: the result is `conflict`, and the other drafts, the source and the new entities are absent afterwards.
- [ ] Unit test "returns invalid_input for a predicate the domain does not have" passes.
- [ ] Unit test "returns invalid_input when there is nothing to record" passes.
- [ ] Unit test "records nothing when the embedder fails" passes with `embedding_failed`.
- [ ] Unit test "marks a fact single-valued from the domain's predicate" passes: two open-ended facts for a multi-valued predicate are both recorded; for a single-valued one the second call returns `conflict`.
- [ ] Unit test "creates an entity once when two drafts introduce it" passes.
- [ ] Unit test "does not call the embedder when the source only restates" passes.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests in `core` with `createTestDeps`.

**Completion evidence.** The commit and the passing `pnpm check` output.

### FL-009: invalidateFact operation: retraction and correction

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-008, FL-056 |
| Requirements | REQ-06, REQ-08, REQ-24 |
| Components | `packages/core` |

**Objective.** Withdraw a fact as a belief: a retraction when nothing replaces it, a correction when a replacement is given.

**Background.** The signature and behaviour are in [`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 1". A correction means the earlier fact was wrong: it is invalidated and linked to the right fact, and a known-at question for an earlier date still returns the wrong one ([ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md)). The explanation of the change is the content of a source, never text in the audit log ([`SCHEMA.md`](../../architecture/SCHEMA.md), rule 6).

**Outcome.** One call withdraws a fact, with or without a replacement, in one commit. The Node correction of the [fact-schema spike](../../../spikes/fact-schema/README.md) can be made through it.

**Scope.**
- `invalidateFact`, in a file of its own, exported from the package entry.
- Unit tests against the in-memory store.
- Reuse of the input types and the change-set building of FL-008.

**Non-goals.**
- Ending a fact that was true and stopped being true: `endFact`, FL-010.
- Choosing between a correction and a succession. The caller chooses: `changeFact` (FL-025) in phase 1, the conflict judge (FL-041) in phase 2.
- Linking a replacement to a fact that was retracted earlier. A fact has at most one supersession link, set when it is invalidated.
- Changing a confidence: FL-045.

**Functional requirements.**
1. Reads the fact with `getFact`. Returns `not_found` when it does not exist in the namespace. Returns `already_invalidated` when it is no longer live, with the superseding fact in `relatedFactIds` if there is one.
2. Records the given source in the same commit, with an identifier and a content hash as in FL-008.
3. Without a replacement: the change set has `operation: 'retraction'` and holds the source and one `invalidate_fact` with no supersession link.
4. With a replacement: the change set has `operation: 'correction'` and holds the source, any new entities, the replacement fact with the new source, and then the `invalidate_fact` linked to the replacement. The replacement is recorded before the invalidation, because the link must point at an existing fact.
5. A replacement whose `validFrom` and `validTo` are both null takes the valid period of the fact it corrects. A replacement that gives either bound keeps what it gives.
6. The replacement's statement is embedded with the purpose `statement`. A retraction makes no call to the embedder.
7. `singleValued` for the replacement comes from the domain. The replacement does not conflict with the fact it replaces, because that fact is invalidated in the same change set. It returns `conflict` when it overlaps another live fact.
8. Returns `invalid_input` for a replacement whose predicate or entity type is not in the domain. Returns the store's other errors unchanged. On any error nothing is committed.
9. Returns the identifier of the invalidated fact, and of the replacement or `null`.

**Technical requirements.**
1. The signature is the one in `INTERFACES.md`.
2. The change set's `reasonCode` and `trigger` come from the context, and `explainedBySourceId` is the new source.
3. Building the change set is a pure function with its own test.

**Constraints.**
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md).
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md).
- [Architecture rules](../../../.claude/rules/architecture.md): one operation per file; writes go through one door.

**Acceptance criteria.**
- [ ] Unit test "retracts a fact with no replacement" passes: the fact is absent from `listFacts` for now, present for a known-at date before the retraction, and has `supersededByFactId` null.
- [ ] Unit test "corrects a fact and links it to the replacement" passes on the Node 20 to Node 22 case of the spike: asked as of any date and known now, only Node 22 is returned; asked known at a date before the correction, only Node 20 is returned.
- [ ] Unit test "gives the replacement the valid period of the fact it corrects when none is given" passes.
- [ ] Unit test "keeps the replacement's own valid period when one is given" passes.
- [ ] Unit test "writes a correction as one operation with three audit entries after the source" passes: `source.recorded`, `fact.recorded`, `fact.invalidated`, sharing one operation identifier, with the operation `correction` and the source as the explanation.
- [ ] Unit test "returns already_invalidated with the superseding fact" passes.
- [ ] Unit test "returns not_found for a fact in another namespace" passes.
- [ ] Unit test "changes nothing when the replacement conflicts with another live fact" passes: the result is `conflict` and the original fact is still live.
- [ ] Unit test "never reduces the number of facts" passes: `listFacts` with `'all'` returns one more fact after a correction and the same number after a retraction.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests in `core` with `createTestDeps`, each stating its as-of date and its known-at date.

**Completion evidence.** The commit and the passing `pnpm check` output.

### FL-010: endFact operation: ending a fact and succession

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-008, FL-056 |
| Requirements | REQ-02, REQ-06, REQ-08, REQ-24 |
| Components | `packages/core` |

**Objective.** Say that a fact stopped being true at a moment, as a revision that ends it, and record its successor in the same commit when one is given.

**Background.** The signature and behaviour are in [`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 1". A fact row cannot have its `valid_to` set in place: a known-at question about an earlier date would then show an end that Factloom did not know of. So ending a fact writes a copy with `validTo` set and invalidates the original with a link to the copy ([ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md)). The worked example is the PostgreSQL 14 to 16 succession in [`SCHEMA.md`](../../architecture/SCHEMA.md), "How each change is written". The copy's vector is copied, not computed again.

**Outcome.** One call turns "we moved to PostgreSQL 16 on 15 March" into an ended fact, a successor and the link between the old row and its copy, in one commit.

**Scope.**
- `endFact`, in a file of its own, exported from the package entry.
- Unit tests against the in-memory store.

**Non-goals.**
- Changing the start of a fact, or moving the date of a succession already recorded: `reviseValidTime`, FL-044.
- Deciding that new information is a succession: `changeFact` (FL-025) and the conflict judge (FL-041).
- Withdrawing a wrong fact: FL-009.

**Functional requirements.**
1. Reads the fact with `getFact`. Returns `not_found` or `already_invalidated` as in FL-009.
2. Returns `invalid_input` when `validTo` is not after the fact's `validFrom`. A fact with an unknown start accepts any `validTo`.
3. Records the given source in the same commit.
4. Writes a copy of the fact with a new identifier, the same subject, predicate, object, statement, confidence and `validFrom`, the given `validTo`, and `createdAt` from `now`. The copy's sources are all the original's sources and the new source. Its embedding is `{ copyFromFactId }` of the original.
5. Invalidates the original with a supersession link to the copy.
6. Without a successor the change set has `operation: 'revision'`. With one it has `operation: 'succession'` and also records the successor, with the new source as its source and a newly embedded statement.
7. A successor whose `validFrom` is null starts at `validTo`. A successor that gives a `validFrom` keeps it.
8. The changes are in this order: source, new entities, the ended copy, the invalidation, the successor. The audit entries therefore read `source.recorded`, `fact.recorded`, `fact.invalidated`, `fact.recorded`.
9. Returns `conflict` when the successor overlaps a live fact other than the one it follows. An ended copy and a successor that only touch at `validTo` do not conflict.
10. Returns the identifier of the ended copy as `endedFactId`, which is the live ended fact, and of the successor or `null`. On any error nothing is committed.

**Technical requirements.**
1. The signature is the one in `INTERFACES.md`.
2. The embedder is called only for a successor.
3. Building the change set is a pure function with its own test.
4. The change set's `reasonCode` and `trigger` come from the context, and `explainedBySourceId` is the new source.

**Constraints.**
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): invalidate and insert a copy.
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md).
- [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md): periods that only touch do not overlap.

**Acceptance criteria.**
- [ ] Unit test "ends PostgreSQL 14 and records PostgreSQL 16 as its successor" passes, with the dates of the spike. Afterwards: asked for now, only PostgreSQL 16; as of 2026-02-01, the ended PostgreSQL 14; as of 2026-03-15, only PostgreSQL 16; known at 2026-04-01 and as of 2026-04-01, the original PostgreSQL 14.
- [ ] Unit test "gives the ended copy the original's sources and the source that reported the end" passes.
- [ ] Unit test "links the original to its ended copy" passes: `listFacts` with `supersededByFactId` set to the copy returns the original.
- [ ] Unit test "starts a successor at the end of the fact it follows when no start is given" passes.
- [ ] Unit test "ends a fact with no successor as a revision" passes, with the operation `revision` in the audit entries.
- [ ] Unit test "returns invalid_input when the end is not after the start" passes.
- [ ] Unit test "embeds only the successor" passes: with a fake embedder that counts calls, ending without a successor makes none.
- [ ] Unit test "copies the original's vector to the ended copy" passes, on the pure function that builds the change set: the copy's embedding is `{ copyFromFactId }` naming the original.
- [ ] Unit test "changes nothing when the successor conflicts with another live fact" passes.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests in `core` with `createTestDeps`, each stating its as-of date and its known-at date, and covering the boundary instant.

**Completion evidence.** The commit and the passing `pnpm check` output.

### FL-011: findConflictCandidates operation

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-007, FL-056 |
| Requirements | REQ-15, REQ-16, REQ-24 |
| Components | `packages/core` |

**Objective.** List the live facts that a new fact could conflict with or restate, by a bounded lookup with no LLM.

**Background.** The signature and behaviour are in [`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 1". Candidates are keyed by subject and predicate ([ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md)). The operation does not judge. In phase 1 the use cases apply two deterministic rules to what it returns: the same object is a restatement, and a different object under a single-valued predicate is a conflict. In phase 2 the conflict judge (FL-041) takes over.

`MemoryStore.listFacts` takes a time filter with one as-of instant, `'live'` or `'all'`. This operation needs the live facts at any valid time, so it reads with `'live'` and then keeps the facts whose valid period overlaps the given one.

**Outcome.** A use case asks one question before writing and learns which stored facts to compare a new fact with.

**Scope.**
- `findConflictCandidates`, in a file of its own, exported from the package entry.
- Unit tests against the in-memory store.

**Non-goals.**
- Judging a pair: the use cases in phase 1, FL-041 in phase 2.
- Candidates chosen by embedding similarity. ADR 0010 leaves that to phase 2, and only if the eval set shows conflicts being missed.
- Enforcing the single-value rule. The store does that inside `commit`, whatever this operation returned.
- A new method on `MemoryStore`. The `'live'` option of `listFacts` is part of the interface built in FL-007.

**Functional requirements.**
1. Returns the facts in the namespace with the given subject and predicate that are live and whose valid period overlaps the given one. A missing bound counts as open. Periods that only touch do not overlap.
2. Returns facts for multi-valued predicates too, since a restatement can happen for any predicate.
3. Returns the newest first, up to `limit`, each with its subject, object entity and sources.
4. Returns `invalid_input` for a limit below 1 or a reversed period. Returns an empty list when nothing matches.
5. Makes no LLM call and no embedder call, and writes nothing.

**Technical requirements.**
1. The signature is the one in `INTERFACES.md`.
2. The overlap test is the pure function written in FL-007, so that the operation and the store's rule cannot disagree.
3. The read is `listFacts` with the subject, the predicate, `time: 'live'` and a fixed fetch bound, a named constant larger than any `limit` a use case passes. Facts that do not overlap are dropped afterwards, and the result is cut to `limit`.
4. Known limit, recorded in a comment beside the constant: when one subject and predicate has more live facts than the fetch bound, older live facts are not seen. The store's check inside `commit` still refuses a write that would break the single-value rule, so the cost is a `conflict` error in place of a skipped fact, never a broken rule.

**Constraints.**
- [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md).
- [`INTERFACES.md`](../../architecture/INTERFACES.md): reads never write; the lookup is bounded and uses no LLM.

**Acceptance criteria.**
- [ ] Unit test "returns the current fact for a new open-ended value" passes.
- [ ] Unit test "returns the ended fact that an older fact arriving late overlaps" passes, with the periods of the [fact-schema spike](../../../spikes/fact-schema/README.md).
- [ ] Unit test "returns nothing for a period that ends where the stored fact begins" passes.
- [ ] Unit test "returns the open-ended fact for a period dated in the future" passes.
- [ ] Unit test "treats an unknown start as open" passes.
- [ ] Unit test "leaves out invalidated facts" passes: after a succession, the original row is not a candidate and its ended copy is.
- [ ] Unit test "returns nothing for another predicate, another subject or another namespace" passes.
- [ ] Unit test "returns at most the limit, newest first" passes.
- [ ] Unit test "writes nothing" passes: `listAuditEntries` and `listFacts` with `'all'` return the same before and after the call.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests in `core` with `createTestDeps`.

**Completion evidence.** The commit and the passing `pnpm check` output.
