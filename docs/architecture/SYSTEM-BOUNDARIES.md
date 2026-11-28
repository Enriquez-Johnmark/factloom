# System boundaries

Which package may import which, how that is enforced, and what each package's public API contains.

## Import rules

| Package | May import | Must not import |
|---|---|---|
| `@kronomind/core` | `zod` | Any other `@kronomind` package. Any database, LLM, embedding or MCP library. A test framework, in its source files |
| `@kronomind/graph-rag` | `@kronomind/core`, `zod` | `@kronomind/storage`, `@kronomind/maintenance`, `@kronomind/adapters`. Any database, LLM, embedding or MCP library |
| `@kronomind/storage` | `@kronomind/core`, `better-sqlite3`, `sqlite-vec` | `@kronomind/graph-rag`, `@kronomind/maintenance`, `@kronomind/adapters`. Any LLM, embedding or MCP library |
| `@kronomind/maintenance` | `@kronomind/core`, `zod` | `@kronomind/storage`, `@kronomind/graph-rag`, `@kronomind/adapters`. Any database, LLM, embedding or MCP library |
| `@kronomind/adapters` | `@kronomind/core`, `@kronomind/graph-rag`, `zod` | `@kronomind/storage`, `@kronomind/maintenance`. Any database, LLM, embedding or MCP library. No other package imports it but `apps/mcp-server` ([ADR 0026](adr/0026-healthcare-proof-before-phase-4.md)) |
| `apps/mcp-server` | Every `@kronomind` package, the MCP SDK, the Anthropic SDK, the embedding library, `zod` | Nothing is forbidden, but it holds no rules about facts |

```
apps/mcp-server ──► graph-rag ─────► core ◄── storage
     │  │                             ▲          ▲
     │  └──────► maintenance ─────────┘          │
     └───────────────────────────────────────────┘
```

`adapters` holds the domain adapters, one module per domain, from the healthcare proof on ([ADR 0026](adr/0026-healthcare-proof-before-phase-4.md)). It sits beside `maintenance` in the drawing: the app imports it, and it imports `core`.

`maintenance` is product 2. It changes memory only through the fact operations in `core`, so it cannot import the storage adapter at all.

Two further rules:

- Packages import each other by package name, `@kronomind/core`, never by a relative path that leaves the package and never through a path alias.
- A package is imported only through its `src/index.ts`. Nothing reaches into another package's files.

## How the rules are enforced

Three mechanisms, so that a forbidden import fails without anyone remembering the rule.

1. **Declared dependencies.** Each `package.json` lists only what the table allows. pnpm does not make an undeclared workspace package resolvable, so `import '@kronomind/storage'` inside `core` fails the type check and fails at run time. This was run in the no-build setup ([toolchain research](../research/technical/toolchain.md)).
2. **Lint.** Planned: a lint rule per package forbids importing the packages and libraries in the "must not import" column, and forbids deep imports into another package. This catches the case where someone adds a dependency to `package.json` to make an import work.
3. **One public entry.** Each `package.json` exports only its `index.ts`. No package has a second entry.

The lint rules were run in the scaffold on 2026-11-14, in the no-build workspace: a forbidden import in each of the three packages, a forbidden import with its dependency declared, a deep import by package name and a deep import by relative path each failed the check, and each was then removed. The recorded output is in work item [FL-001](../roadmap/epics/EPIC-01.md). The rules for `maintenance` were run the same way on 2026-11-16: an import of `@kronomind/storage`, of `@kronomind/graph-rag`, of `better-sqlite3` and a deep import from inside it, and an import of it from `graph-rag` and from `storage`, each failed the check. The recorded output is in work item [FL-040](../roadmap/epics/EPIC-08.md). The rules for `adapters` were run the same way on 2026-11-28: an import of `@kronomind/storage` from it, and an import of it from `graph-rag`, each failed the check (FL-091, [EPIC-13](../roadmap/epics/EPIC-13.md)).

## Public API of each package

Each package exports only what another package needs. Everything else stays private to the package. There are no barrel files inside a package: `src/index.ts` is the only file that re-exports.

### `@kronomind/core`

| Group | Exports |
|---|---|
| Result | `Result`, its two halves `Success` and `Failure`, `ok`, `err`, `ERROR_CODES`, `ErrorCode`, `KronomindError` |
| Schemas and types | The Zod schemas and derived types for `Timestamp`, `Entity`, `Fact`, `FactObject`, `Source`, `Trigger`, `Operation`, `ReasonCode`, `AuditAction`, `AuditEntry`, `TimeFilter`, `Domain`, `PredicateDefinition`, `ChangeSet`, `Change`, `CommitReceipt`, `FactWithSources` |
| Time | `toTimestamp`, `parseDateInput`, and the two pure functions every store shares: `matchesTimeFilter`, the time predicate, and `periodsOverlap`, the test behind the single-value rule |
| Names | `normaliseEntityName`, so that every store matches entity names the same way |
| Interfaces | `MemoryStore`, `LlmClient`, `Embedder` |
| Fact operations, phase 1 | `recordFacts`, `invalidateFact`, `endFact`, `findConflictCandidates`, with `OperationDeps`, `ChangeContext`, `NewSource`, `NewEntity`, `NewFact`, `FactDraft` |
| Fact operations, phase 2 | `reviseValidTime`, with `ReviseValidTimeInput` and `ValidTimeRevision`; `adjustConfidence`, with `AdjustConfidenceInput`; `recordFeedback`, with `RecordFeedbackInput`; `purgeContent`, with `PurgeContentInput`, and `PURGED_MARKER` |
| Fact operations, phase 3 | `mergeEntities`, with `MergeEntitiesInput`, `undoEntityMerge`, with `UndoEntityMergeInput`, and `EntityMerge`; `FactUsage`, the usage that `MemoryStore.recordFactUsage` writes |
| Conflict judge, phase 2 | `ConflictJudge`, `ConflictJudgeInput`, `ConflictVerdict`, `JUDGE_CANDIDATE_LIMIT` |
| Feedback responder, phase 2 | `FeedbackResponder`, and `FeedbackFollowUp`, what it did (FL-060) |
| Test helpers | `createInMemoryStore`, `createFakeEmbedder`, `createScriptedLlm`, `createTestDeps` |

The test helpers are ordinary exports of the one `index.ts`. They import no test framework, so nothing in `core`'s source does. The operations of phases 2 and 3 in [`INTERFACES.md`](INTERFACES.md) are added to this list in their phase.

### `@kronomind/graph-rag`

| Group | Exports |
|---|---|
| Use cases | `remember`, `recordStructuredFacts`, `changeFact`, `recall`, `getFactHistory`, and from phase 2 `giveFeedback`, with their input and output types |
| Domain | `softwareDevelopmentDomain`, and from phase 3 the checks the verification job takes from it: `findSymbolNames` (FL-071), and `readDependencyVersion` and `describeDependencyVersion` (FL-062) |
| Secret check, phase 3 | `checkForSecrets`, with `CheckedField`: the check of FL-022, passed by the composition root to the LLM verification rung of `@kronomind/maintenance`, which may not import this package, so that no file it matches is sent to the LLM (FL-051) |
| Retrieval eval | `recallWithSettings`, with `RecallSettings` and `DEFAULT_RECALL_SETTINGS`: recall with explicit lane weights, lane list length and fusion constant, for the eval in `apps/mcp-server/evals/` (FL-033) |

Rank fusion and entity resolution are internal.

### `@kronomind/adapters`

| Group | Exports |
|---|---|
| Domains | `healthcareDomain`, for a proof on invented data only (FL-091) |

### `@kronomind/storage`

| Group | Exports |
|---|---|
| Adapter | `openSqliteMemoryStore(options)`, which returns a `Result<MemoryStore>` after applying pending migrations. The options are the file path and the embedding model's name and dimensions |
| Purge, phase 2 | `clearFreedPages(path)`, which runs `VACUUM` and `wal_checkpoint(TRUNCATE)` on a file after a purge, with no store open on it, and says whether the checkpoint finished |

The SQL, the migration runner and the row mappers are internal. So is the storage contract suite, `describeMemoryStoreContract`: this package runs it against the in-memory store from `core` and against the SQLite adapter. The suite moves to a shared place when a second adapter exists.

### `@kronomind/maintenance`

| Group | Exports |
|---|---|
| Conflict judge | `judgeConflicts`, with `JudgeConflictsDeps`: it implements `ConflictJudge` from `core` (FL-041) |
| Feedback responder | `actOnFeedback`, which implements `FeedbackResponder` from `core`, and its two steps `FEEDBACK_CONFIDENCE_RAISE` and `FEEDBACK_CONFIDENCE_DROP` (FL-060) |

Its prompt and the schema of the model's answer are internal. It builds no `ChangeSet`, calls no `MemoryStore.commit` and contains no SQL: every change it makes is a call to a fact operation in `core`.

### `apps/mcp-server`

An application, not a library. It exports nothing. Its entry point is `src/main.ts`, which reads configuration, builds the store, the LLM client and the embedder, and passes them to the use cases behind each tool.

## What crosses each boundary

| From | To | What crosses |
|---|---|---|
| Agent | `mcp-server` | Tool input as JSON, checked by a Zod schema |
| `mcp-server` | `graph-rag` | Plain immutable data and the dependencies the use case needs |
| `graph-rag` | `core` | Calls to fact operations and to the three interfaces |
| `maintenance` | `core` | Calls to fact operations and to the three interfaces |
| `core` | `storage` | `ChangeSet` values and queries, through `MemoryStore` |
| `storage` | SQLite | SQL. Nothing above `storage` sees a row or a statement |

Everything that crosses is plain data. No class instance, database handle or SDK object crosses a package boundary, except the three interface implementations that the composition root passes down.
