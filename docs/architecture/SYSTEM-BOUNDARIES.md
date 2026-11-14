# System boundaries

Which package may import which, how that is enforced, and what each package's public API contains.

## Import rules

| Package | May import | Must not import |
|---|---|---|
| `@factloom/core` | `zod` | Any other `@factloom` package. Any database, LLM, embedding or MCP library. A test framework, in its source files |
| `@factloom/graph-rag` | `@factloom/core`, `zod` | `@factloom/storage`. Any database, LLM, embedding or MCP library |
| `@factloom/storage` | `@factloom/core`, `better-sqlite3`, `sqlite-vec` | `@factloom/graph-rag`. Any LLM, embedding or MCP library |
| `apps/mcp-server` | Every `@factloom` package, the MCP SDK, the Anthropic SDK, the embedding library, `zod` | Nothing is forbidden, but it holds no rules about facts |

```
apps/mcp-server ──► graph-rag ──► core ◄── storage
        └──────────────────────────────────────┘
```

Two further rules:

- Packages import each other by package name, `@factloom/core`, never by a relative path that leaves the package and never through a path alias.
- A package is imported only through its `src/index.ts`. Nothing reaches into another package's files.

## How the rules are enforced

Three mechanisms, so that a forbidden import fails without anyone remembering the rule.

1. **Declared dependencies.** Each `package.json` lists only what the table allows. pnpm does not make an undeclared workspace package resolvable, so `import '@factloom/storage'` inside `core` fails the type check and fails at run time. This was run in the no-build setup ([toolchain research](../research/technical/toolchain.md)).
2. **Lint.** Planned: a lint rule per package forbids importing the packages and libraries in the "must not import" column, and forbids deep imports into another package. This catches the case where someone adds a dependency to `package.json` to make an import work.
3. **One public entry.** Each `package.json` exports only its `index.ts`. No package has a second entry.

The lint rules were run in the scaffold on 2026-11-14, in the no-build workspace: a forbidden import in each of the three packages, a forbidden import with its dependency declared, a deep import by package name and a deep import by relative path each failed the check, and each was then removed. The recorded output is in work item [FL-001](../roadmap/epics/EPIC-01.md).

## Public API of each package

Each package exports only what another package needs. Everything else stays private to the package. There are no barrel files inside a package: `src/index.ts` is the only file that re-exports.

### `@factloom/core`

| Group | Exports |
|---|---|
| Result | `Result`, `ok`, `err`, `ERROR_CODES`, `ErrorCode`, `FactloomError` |
| Schemas and types | The Zod schemas and derived types for `Timestamp`, `Entity`, `Fact`, `FactObject`, `Source`, `Trigger`, `Operation`, `ReasonCode`, `AuditAction`, `AuditEntry`, `TimeFilter`, `Domain`, `PredicateDefinition`, `ChangeSet`, `Change`, `CommitReceipt`, `FactWithSources` |
| Time | `toTimestamp`, `parseDateInput` |
| Names | `normaliseEntityName`, so that every store matches entity names the same way |
| Interfaces | `MemoryStore`, `LlmClient`, `Embedder` |
| Fact operations, phase 1 | `recordFacts`, `invalidateFact`, `endFact`, `findConflictCandidates`, with `OperationDeps`, `ChangeContext`, `NewSource`, `NewEntity`, `NewFact`, `FactDraft` |
| Test helpers | `createInMemoryStore`, `createFakeEmbedder`, `createScriptedLlm`, `createTestDeps` |

The test helpers are ordinary exports of the one `index.ts`. They import no test framework, so nothing in `core`'s source does. The operations of phases 2 and 3 in [`INTERFACES.md`](INTERFACES.md) are added to this list in their phase.

### `@factloom/graph-rag`

| Group | Exports |
|---|---|
| Use cases | `remember`, `recordStructuredFacts`, `changeFact`, `recall`, `getFactHistory`, with their input and output types |
| Domain | `softwareDevelopmentDomain` |

Rank fusion and entity resolution are internal.

### `@factloom/storage`

| Group | Exports |
|---|---|
| Adapter | `openSqliteMemoryStore(options)`, which returns a `Result<MemoryStore>` after applying pending migrations. The options are the file path and the embedding model's name and dimensions |

The SQL, the migration runner and the row mappers are internal. So is the storage contract suite, `describeMemoryStoreContract`: this package runs it against the in-memory store from `core` and against the SQLite adapter. The suite moves to a shared place when a second adapter exists.

### `apps/mcp-server`

An application, not a library. It exports nothing. Its entry point is `src/main.ts`, which reads configuration, builds the store, the LLM client and the embedder, and passes them to the use cases behind each tool.

## What crosses each boundary

| From | To | What crosses |
|---|---|---|
| Agent | `mcp-server` | Tool input as JSON, checked by a Zod schema |
| `mcp-server` | `graph-rag` | Plain immutable data and the dependencies the use case needs |
| `graph-rag` | `core` | Calls to fact operations and to the three interfaces |
| `core` | `storage` | `ChangeSet` values and queries, through `MemoryStore` |
| `storage` | SQLite | SQL. Nothing above `storage` sees a row or a statement |

Everything that crosses is plain data. No class instance, database handle or SDK object crosses a package boundary, except the three interface implementations that the composition root passes down.
