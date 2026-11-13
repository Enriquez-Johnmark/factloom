# System boundaries

Which package may import which, how that is enforced, and what each package's public API contains.

## Import rules

| Package | May import | Must not import |
|---|---|---|
| `@factloom/core` | `zod` | Any other `@factloom` package. Any database, LLM, embedding or MCP library |
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

1. **Declared dependencies.** Each `package.json` lists only what the table allows. pnpm does not make an undeclared workspace package resolvable, so `import '@factloom/storage'` inside `core` fails the type check and fails at run time.
2. **Lint.** A lint rule per package forbids importing the packages and libraries in the "must not import" column, and forbids deep imports into another package. This catches the case where someone adds a dependency to `package.json` to make an import work.
3. **One public entry.** Each `package.json` exports only its `index.ts`.

The scaffold stage proves this by adding a forbidden import, showing the check fail, and removing it.

## Public API of each package

Each package exports only what another package needs. Everything else stays private to the package. There are no barrel files inside a package: `src/index.ts` is the only file that re-exports.

### `@factloom/core`

| Group | Exports |
|---|---|
| Result | `Result`, `ok`, `err`, `ERROR_CODES`, `ErrorCode`, `FactloomError` |
| Schemas and types | The Zod schemas and derived types for `Timestamp`, `Entity`, `Fact`, `FactObject`, `Source`, `AuditEntry`, `TimeFilter`, `Domain`, `PredicateDefinition`, `ChangeSet`, `Change` |
| Time | `toTimestamp`, `parseDateInput` |
| Interfaces | `MemoryStore`, `LlmClient`, `Embedder` |
| Fact operations | `recordFacts`, `invalidateFact`, `endFact`, `findConflictCandidates` |
| For tests | `createInMemoryStore`, `describeMemoryStoreContract`, `createFakeEmbedder`, `createScriptedLlm` |

The test helpers are exported from a second entry, `@factloom/core/testing`, so that production code does not import them by accident.

### `@factloom/graph-rag`

| Group | Exports |
|---|---|
| Use cases | `remember`, `recordStructuredFacts`, `recall`, `getFactHistory`, with their input and output types |
| Domain | `softwareDevelopmentDomain` |

Rank fusion and entity resolution are internal.

### `@factloom/storage`

| Group | Exports |
|---|---|
| Adapter | `openSqliteMemoryStore(options)`, which returns a `Result<MemoryStore>` after applying pending migrations |

The SQL, the migration runner and the row mappers are internal.

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
