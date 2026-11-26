# EPIC-06: MCP server

| | |
|---|---|
| Status | Pending |
| Phases | 1 |
| Packages | `apps/mcp-server` |
| Requirements | REQ-04, REQ-09, REQ-10, REQ-11, REQ-12, REQ-13, REQ-25, REQ-29, REQ-35, REQ-36, REQ-37 |

Terms in bold are defined in [`GLOSSARY.md`](../../../GLOSSARY.md).

## Outcome

Claude Code and OpenAI Codex can remember and recall project memory through a local MCP server. The server runs from one SQLite file with no other service, keeps memory across restarts, and exposes five described and annotated tools. The owner has registered it in both hosts on an Apple Silicon Mac and recorded the result.

## Scope

- Configuration, the composition root, and logging to standard error.
- The five tools of [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md): `recall`, `remember`, `record_fact`, `invalidate_fact`, `get_fact_history`.
- The translation between tool input and output and the use cases, and from an error code to a tool error.
- The smoke test over stdio.
- The registration guide for the two hosts, confirmed on the owner's machine.

## Out of scope

- The use cases the tools call: [EPIC-04](EPIC-04.md) and [EPIC-05](EPIC-05.md).
- The Anthropic client (FL-019) and the local embedder (FL-026). They live in this app but belong to those epics.
- Installing the packed server on a clean machine in continuous integration: [EPIC-01](EPIC-01.md), FL-003.
- A feedback tool. Phase 2 adds `give_feedback` as the sixth tool: [EPIC-08](EPIC-08.md), FL-059.
- The performance benchmark: [EPIC-07](EPIC-07.md), FL-066. This epic must meet the budgets it enforces.
- Resources, prompts, hooks that call recall when a session starts, and a tool to list or merge entities ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Not in phase 1").
- An HTTP transport: EPIC-10.

## Boundaries and constraints

- A stdio server on the version 2 MCP TypeScript SDK, with five tools in phase 1 and no state between calls ([ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md)).
- A handler does three things: it translates the input, calls one use case, and translates the `Result`. It holds no rule about facts ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "What a handler does"; [`.claude/rules/architecture.md`](../../../.claude/rules/architecture.md)).
- Only the composition root names concrete implementations ([ADR 0003](../../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md)).
- The **namespace** comes from configuration and has no default. No tool takes one ([ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md)).
- Only protocol messages go to standard output ([MCP research](../../research/technical/mcp.md), "Practical constraints").
- The source runs under Node with no build step ([ADR 0015](../../architecture/adr/0015-toolchain.md)).

## Dependencies

- [EPIC-01](EPIC-01.md): the continuous integration workflow (FL-002), in which the smoke test must pass on both platforms.
- [EPIC-02](EPIC-02.md): `recordFacts` (FL-008), with which the test of the `recall` tool prepares its database, and the fake embedder of the test helpers.
- [EPIC-03](EPIC-03.md): the SQLite adapter with commit, structural reads and both lanes.
- [EPIC-04](EPIC-04.md): `remember`, `recordStructuredFacts`, `changeFact`, and the Anthropic client.
- [EPIC-05](EPIC-05.md): `recall`, `getFactHistory`, and the local embedder.

## Deliverables

- The server in `apps/mcp-server`, started with `node` on its `main.ts`.
- Unit tests of each tool, and the smoke test.
- The registration section of the app's README, with the date and versions it was confirmed with.
- The closed rows of [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md).

## Success criteria

- `pnpm check` passes, including the smoke test.
- `tools/list` returns the five tools in the order of `MCP-TOOLS.md`, each with a description on every input field, an output schema and the annotations of the table there (REQ-10).
- The smoke test records a fact, restarts the server on the same file and recalls the fact (REQ-11).
- The server refuses to start without `FACTLOOM_NAMESPACE` (REQ-25).
- The owner has recorded a successful session in Claude Code and in Codex on an Apple Silicon Mac (REQ-29).
- The budgets of REQ-35 for `recall`, `record_fact` and server start are met, as measured by the benchmark of FL-066.

## Work items

| ID | Title | Phase | Depends on | Status |
|---|---|---|---|---|
| FL-034 | Server configuration and composition root | 1 | FL-014, FL-015, FL-016, FL-017, FL-026 | Completed |
| FL-058 | recall tool end to end | 1 | FL-008, FL-034, FL-031 | Completed |
| FL-035 | remember and record_fact tools | 1 | FL-019, FL-058, FL-023, FL-024 | Completed |
| FL-036 | invalidate_fact and get_fact_history tools | 1 | FL-018, FL-035, FL-058, FL-025, FL-032 | Completed |
| FL-037 | Smoke test over stdio with a restart | 1 | FL-002, FL-035, FL-036 | Completed |
| FL-038 | Registration guide for Claude Code and Codex, confirmed on Apple Silicon | 1 | FL-037 | Completed |
| FL-079 | A registered coding agent uses Factloom rather than only its built-in memory | 1 | FL-074, FL-038 | Under Review |
| FL-080 | Fewer turns for a coding agent that uses Factloom | 1 | FL-079 | Pending |

### FL-034: Server configuration and composition root

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-014, FL-015, FL-016, FL-017, FL-026 |
| Requirements | REQ-10, REQ-11, REQ-12, REQ-25 |
| Components | `apps/mcp-server` |

**Objective.** Build the server's frame: configuration, the composition root, logging to standard error, and a stdio server that starts, states its instructions and shuts down cleanly. Tools are added by the items that follow.

**Background.** The shape of the server is specified in [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Shape of the server". This item was split to fit one session: it keeps the frame, and the `recall` tool with the shared translations is FL-058. [ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md) chose a stdio server on the version 2 SDK. The [MCP research](../../research/technical/mcp.md) verified on 2026-11-13, by running a server and two clients: the package `@modelcontextprotocol/server` and its version on that date; `serveStdio` with a function that creates the server, which answers both protocol eras; `registerTool` with an input schema, an output schema and annotations; the server `instructions` string; that the SDK checks arguments before the handler runs and checks `structuredContent` against the output schema; and that a result with `isError: true` reaches the model. It also found that some Zod date and identifier types add a long pattern to the listed schema, and that Claude Code cuts server instructions at 4,096 characters.

**Outcome.** `node apps/mcp-server/src/main.ts` starts a server that a host can connect to. It opens the configured database with the local embedder's model and dimensions, answers the initialise request with its instructions, and registers no Factloom tool yet. The next three work items add tools without touching the frame.

**Scope.**
- Configuration from the environment.
- The composition root: store, embedder, clock and identifier generator.
- A function that creates the server from its dependencies, apart from the entry point, so that tests build a server with fakes.
- One logger that writes to standard error.
- The server `instructions` string.
- Start-up failures and a clean shutdown.

**Non-goals.**
- Any tool. `recall` is FL-058; the other four are FL-035 and FL-036.
- The translation from a fact with sources to the tool output, and from an error to a tool error: FL-058.
- Wiring the Anthropic client: FL-035, the first tool that needs it.
- Deriving the namespace from the repository. How each host passes its working directory is not verified ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md); open question Q-16).
- A build for publishing, and the install on a clean machine: FL-003.
- An environment variable for the model cache directory or for the recall settings.

**Functional requirements.**
1. Configuration is read from the three variables in the table of `MCP-TOOLS.md`. `FACTLOOM_DB` defaults to `~/.factloom/factloom.db`, and the directory is created if it is missing. `ANTHROPIC_API_KEY` is optional.
2. Without `FACTLOOM_NAMESPACE` the process writes the reason to standard error and exits with a code other than 0. The message says that the default database is one file per user, so a shared default would mix the memory of every repository.
3. The store is opened with `openSqliteMemoryStore`, given the database path and the model name and dimensions of the local embedder (FL-026). If it cannot be opened, including on `embedding_model_mismatch`, the process writes the error code and message to standard error and exits with a code other than 0.
4. The server sets an `instructions` string that says what the memory holds and when to use it, with the important words first, in at most 1,000 characters.
5. The server is served over stdio with `serveStdio` and the function that creates the server. It answers the initialise request before the embedding model is loaded or downloaded.
6. When standard input closes, the store is closed and the process exits with code 0.

**Technical requirements.**
1. `@modelcontextprotocol/server` is a dependency with an exact version and no range. The version is the latest of the version 2 line on the registry on the day of implementation, checked with `npm view` and cited in the commit message. The research records the version it verified. The client package used by tests is a development dependency, pinned the same way. The pin test of FL-001 fails if either is a range; this item adds no pin test of its own.
2. Configuration is parsed by a Zod schema in a pure function that takes the environment as an argument and returns a `Result`.
3. Only `main.ts` reads the environment and names concrete implementations. The clock uses `toTimestamp` from `core`.
4. The embedder's cache directory is `models` beside the default database, in `~/.factloom/`.
5. Nothing in the app writes to standard output except the SDK's transport. All logging goes through the one logger.
6. The function that creates the server takes its dependencies as one argument and takes the tools to register as a list, which is empty in this item. FL-058, FL-035 and FL-036 each add to the list and change nothing else in the frame.
7. `main.ts` does two things: it reads the configuration and builds the real dependencies, then serves the server-creating function over stdio. The second step is a function of its own, so that a test entry can serve the same server with other dependencies (FL-058).

**Constraints.**
- [ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md), [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md), [ADR 0003](../../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md).
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "Connection settings": several server processes can share one file.
- [`.claude/rules/typescript.md`](../../../.claude/rules/typescript.md): data from outside is parsed by a schema at the edge.

**Acceptance criteria.**
- [x] Tests of configuration pass with these names: "uses the default database path when none is given", "fails without a namespace and says why", "accepts a missing API key".
- [x] A test named "the instructions fit the limit" asserts that the string is not empty and has at most 1,000 characters.
- [x] A test named "gives its instructions when a client connects", with a server built from fakes and a client connected in process, asserts that the initialise result carries the instructions string.
- [x] A test named "starts over stdio on a new SQLite file" starts `node` on `main.ts` as a child process with a temporary `FACTLOOM_DB` and a namespace, completes the initialise exchange over stdio, closes standard input, and asserts exit code 0 and that the database file exists.
- [x] The same test asserts that every line the child wrote to standard output parses as a JSON-RPC message.
- [x] A test named "exits when no namespace is configured" starts the child without `FACTLOOM_NAMESPACE` and asserts an exit code other than 0 and a message on standard error.
- [x] A test named "exits when the database was built with another embedding model" prepares a database whose embedding rows name another model, starts the child on it, and asserts an exit code other than 0 and `embedding_model_mismatch` on standard error.
- [x] `pnpm check` passes with no network access and no embedding model in the cache.

**Validation.** Unit tests of configuration and of the server-creating function with fakes and an in-process client. Tests over stdio with a child process and the SQLite adapter. All on every check. None of them loads the embedding model: the server answers the initialise request before the model is loaded (functional requirement 5).

**Completion evidence.** The commit, with the registry check in its message. The passing output of `pnpm check`.

**Recorded evidence.** Completed on 2026-11-16, in four commits: `build(mcp-server): add the MCP SDK 2.4.0, server and client`, `feat(mcp-server): add the configuration, the composition root and the stdio server frame`, `ci: run the server from source with a namespace and a temporary database`, and `fix(mcp-server): build the configuration test's key at run time, as the secret check requires`. The code is in `apps/mcp-server/src`: `read-configuration.ts`, `server-instructions.ts`, `create-factloom-server.ts`, `serve-factloom.ts` and `main.ts`, with tests beside them.

The SDK version. `npm view @modelcontextprotocol/server version` and `npm view @modelcontextprotocol/client version` on 2026-11-16 gave 2.4.0, the `latest` dist-tag of the version 2 line and the version the research verified. The first commit's message records the check. The server is a dependency of `apps/mcp-server`, the client a development dependency.

What differs from the work item as written:

- The instructions name the five tools of `MCP-TOOLS.md`, which the next items add, so that the frame's text does not change when they do. This item registers none.
- The logger is a function that takes one line, `Logger` in `create-factloom-server.ts`; `main.ts` builds the one that writes to standard error, with the prefix `factloom: `.
- A tool is a function that registers itself on the server with the dependencies, `RegisterTool`. A test besides the named ones, "registers each tool it is given", covers the list.
- A variable that is set but empty counts as not set. The namespace is checked with `NamespaceSchema` from `core`.
- The shutdown listens for the end of standard input, closes the connection and the store, and exits with code 0. Without the explicit exit the process also ends with code 0, because nothing else keeps it alive once the transport closes, as the SDK's documentation says; removing the exit by hand failed no test. The exit is kept so that a loaded model's runtime cannot keep the process alive; that is not tested. That the store is closed is tested: "starts over stdio on a new SQLite file" asserts that no `-wal` file is left, which closing the last connection removes. Removing the close by hand failed that test.
- Functional requirement 5, answering before the model is loaded, is not shown by a test. An assertion that no model directory appears under the child's home directory was tried and dropped: with the child's environment reduced to `PATH` and `HOME`, the sandbox's proxy is unset and a download fails silently, so the assertion passed even with the model loaded before serving. The embedder of FL-026 loads on the first call by construction, and no call happens in `main.ts`.
- The continuous integration step "Run the app from source" ran `main.ts` with no configuration. It now gives a namespace, a database in the runner's temporary directory and an empty standard input, and the server must exit with code 0.
- The placeholder `packages.ts` and its test are kept. Its comment says the composition root replaces it; `main.ts` no longer uses it, and removing a test was left to the owner.
- The first push failed in continuous integration, on all four jobs: the scan of tracked files of FL-022 found a credential name assigned a quoted literal in the configuration test, https://github.com/Enriquez-Johnmark/factloom/actions/runs/43817406807. The local check had passed because it ran before the new files were tracked. The test's key is now joined at run time. The check worked as it should.

Eight changes, each made by hand and each restored, made a test fail: a log line on standard output, a start-up line on standard output, stopping with code 0, another default path, a default namespace, exit code 1 when standard input closes, no instructions, and the store not closed. Removing the explicit exit did not, as above.

Not run: the server with a real host, which is FL-038, and `pnpm check` with the network cut off.

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed, including the step that runs the server from source: https://github.com/Enriquez-Johnmark/factloom/actions/runs/43817588780.

`pnpm check`, on Linux x64 with Node.js v22.23.4, with every new file tracked. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 132 files. No fixes applied.
$ biome lint .
Checked 132 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  44 passed (44)
      Tests  593 passed (593)
```

### FL-058: recall tool end to end

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-008, FL-034, FL-031 |
| Requirements | REQ-03, REQ-04, REQ-10 |
| Components | `apps/mcp-server` |

**Objective.** Add the first tool, `recall`, working from a tool call over stdio down to the SQLite file, with the translations that every later tool reuses.

**Background.** The `recall` tool is specified in [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "`recall`", "Dates", "Errors" and "Annotations". It calls the `recall` use case (FL-031) and holds no rule of its own ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "What a handler does"). The [MCP research](../../research/technical/mcp.md) verified `registerTool` with an input schema, an output schema and annotations, that the SDK checks `structuredContent` against the output schema, and that a result with `isError: true` reaches the model. It also found that some Zod date and identifier types add a long pattern to the listed schema. This item is the second part of the original FL-034: the frame is built there, and the first tool here.

`pnpm check` needs no embedding model ([`TESTING.md`](../../architecture/TESTING.md), "Four kinds of test"), but `recall` embeds its question, and `main.ts` builds the real embedder. So the test over stdio in `pnpm check` starts a test entry, a small script kept beside the tests, that serves the same server-creating function as `main.ts` with the SQLite store and the fake embedder of `core`. The real embedder is exercised end to end by the clean-install job (FL-003) and by the benchmark (FL-066).

**Outcome.** A host that connects to the server lists one tool, `recall`, which answers from the configured database and namespace. FL-035 and FL-036 add their tools by reusing the translation of a fact, of a date and of an error.

**Scope.**
- The `recall` tool: its input schema, output schema, annotations and handler.
- The shared translation from a fact with its sources to the tool output.
- The shared translation of a date input, and from a failed `Result` to a tool error.
- A test over stdio from the tool call to the SQLite file.
- The test entry that serves the server over stdio with the fake embedder. FL-037 reuses it.

**Non-goals.**
- The other four tools: FL-035 and FL-036.
- A configuration variable that selects the embedder. The test entry is not reachable from `main.ts`, and the configuration keeps the three variables of [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md).
- The time defaults and the lanes. They are in the use case (FL-031) and the store.
- A tool parameter for the recall settings, or for including an **archived fact**: FL-073 in EPIC-09 adds the second.
- Recording which facts were recalled: FL-055 in EPIC-09.

**Functional requirements.**
1. The `recall` tool has the inputs of `MCP-TOOLS.md`: `question` of 1 to 2,000 characters, optional `as_of` and `known_at`, and optional `limit` from 1 to 50 with default 10. Every field has a description.
2. A date is accepted as a full UTC timestamp or a calendar date and converted with `parseDateInput` from `core`. Anything else is a tool error with code `invalid_input`.
3. The handler calls the `recall` use case with the configured namespace and returns `{ facts }` in the `RecalledFact` shape of `MCP-TOOLS.md`, best first. The same JSON is returned as `structuredContent` and as text.
4. `recorded_at` is the fact's `createdAt`. A source is returned with its kind, locator, version and observed time, and without its content.
5. `invalidated_at` and `superseded_by_fact_id` are returned as the fact holds them, so that a fact recalled with a past `known_at` shows that it has been withdrawn since.
6. A failed `Result` becomes a result with `isError: true` and a text that starts with the error code, then the message, then the identifiers in `relatedFactIds` when there are any.
7. The tool's annotations are those of the table in `MCP-TOOLS.md`: read-only, not open-world.
8. `tools/list` returns one tool, `recall`.

**Technical requirements.**
1. The tool is one file with one handler that calls one use case. It is added to the list of tools that the server-creating function of FL-034 registers.
2. Date fields in the input schema are plain strings with a description, checked in the handler, so that `tools/list` stays small (MCP research, "Schema size").
3. The handler holds no rule about facts or time. The time defaults are in the use case (FL-031).
4. The three translations are functions of their own, each with unit tests, because FL-035 and FL-036 reuse them.
5. The test entry reads the database path and the namespace from the same configuration function as `main.ts`, builds the store with `openSqliteMemoryStore` and the fake embedder's model name and dimensions, and calls the serving function of FL-034. It differs from `main.ts` only in the embedder it builds.

**Constraints.**
- [ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md): a handler only translates.
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md): the namespace comes from configuration; the tool takes none.
- [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Errors" and "Annotations".
- [`.claude/rules/typescript.md`](../../../.claude/rules/typescript.md): data from outside is parsed by a schema at the edge.

**Acceptance criteria.**
- [x] Input fuzz test passes for the `recall` tool: for generated inputs of any JSON shape, the handler returns a tool result, either a success or an error with `invalid_input`, and never throws or ends the server. The generator and its seed are those of FL-075 if that item is done, and a fixed list of malformed inputs otherwise. FL-035 and FL-036 apply the same test to their tools.
- [x] Tests of the tool, with a server built from the in-memory store and the fake embedder and a client connected in process, pass with these names: "lists recall with a description on every input field", "declares an output schema and the read-only annotation", "returns the same facts as structured content and as text", "returns current facts when no date is given", "accepts a calendar date as the as-of date", "returns a fact withdrawn since the known-at date with its invalidation", "returns invalid_input for a malformed date", "returns each source without its content", "starts an error text with the error code".
- [x] Unit tests of the translations pass with these names: "translates a fact with an entity as its object", "translates a fact with a value as its object", "puts the related fact identifiers after the message of an error".
- [x] A test named "answers recall over stdio from a SQLite file" records one fact in a temporary database through `recordFacts` (FL-008) with the SQLite store and the fake embedder, starts `node` on the test entry as a child process with that database and a namespace, calls `recall` over stdio, and finds the fact in the result.
- [x] The same test asserts that every line the child wrote to standard output parses as a JSON-RPC message.
- [x] `pnpm check` passes with no network access and no embedding model in the cache.

**Validation.** Unit tests with fakes and an in-process client. One test over stdio with a child process, the SQLite adapter and the fake embedder. All on every check.

**Completion evidence.** The commit, and the passing output of `pnpm check`.

**Recorded evidence.** Completed on 2026-11-16, in two commits: `build(mcp-server): add fast-check for the input fuzz test of the tools` and `feat(mcp-server): add the recall tool with the shared translations and a test entry over stdio`. The tool is `apps/mcp-server/src/recall-tool.ts`. The translations are `to-fact-output.ts`, `read-optional-date.ts`, `to-tool-error.ts` and `to-tool-success.ts`. The test entry is `serve-with-fake-embedder.ts`. All have their tests beside them, and `main.ts` registers the tool.

What differs from the work item as written:

- **The fuzz test.** The generator of FL-075 builds sequences of changes to memory, not tool inputs, so the test uses its library, fast-check 4.10.2, and its seed, 20261115, with 200 generated inputs of three shapes: arguments that pass the tool's schema with any text in the date fields, the tool's own fields set to values of any JSON type, and objects with any other keys. Input that the schema refuses is answered by the SDK with its own message, "Input validation error ...", as `MCP-TOOLS.md` says under "Errors"; the test accepts that or an error that starts with `invalid_input`. After the run the server still lists its tool. A first version had only the last two shapes and almost never reached the handler: a handler that threw on an empty date passed it. With the first shape added, the same change failed and shrank to `{"question":" ","as_of":""}`.
- The translation of a fact is `toFactOutput`, for any fact with its sources, because the later tools return facts that were not recalled; `recall` adds the score. Returning a success as structured content and as the same text is a fourth small function, `toToolSuccess`, which the later tools reuse too.
- An entity object whose entity a store did not read is given as type `entity` with the identifier as its name. A store always reads it, and no test covers that branch.
- The helpers that run a server entry as a child process moved into `src/testing/server-process.ts`, shared by `main.test.ts` and the new test over stdio. `main.test.ts` now also asks `tools/list` and expects `recall`, so that what `main.ts` registers is tested, not only what the test entry registers.
- Six tests besides the named ones: three of `readOptionalDate`, "gives only the code and the message when no fact is related", the fuzz test's name "answers input of any shape with a tool result and keeps serving", and the tool list of `main.ts` within "starts over stdio on a new SQLite file".
- The default limit of 10 is not asserted by a test.

Eleven changes, each made by hand and each restored, made a test fail: a source returned with its content, `recorded_at` taken from valid time, an entity object given as its identifier, no code in the error text, the related facts before the message, no text content, a malformed date read as absent, `known_at` ignored, the tool not read-only, `main.ts` registering no tool, and, once the fuzz test was strengthened, a handler that throws on an empty date.

Not run: the tool with a real host (FL-038), and `pnpm check` with the network cut off; it ran with every new file staged, and no test loads the model.

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed: https://github.com/Enriquez-Johnmark/factloom/actions/runs/43820981310.

`pnpm check`, on Linux x64 with Node.js v22.23.4, with every new file staged. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 153 files. No fixes applied.
$ biome lint .
Checked 153 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  52 passed (52)
      Tests  620 passed (620)
```

### FL-035: remember and record_fact tools

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-019, FL-058, FL-023, FL-024 |
| Requirements | REQ-10, REQ-13, REQ-36 |
| Components | `apps/mcp-server` |

**Objective.** Add the two tools that record new information: `remember` for free text and `record_fact` for a fact that is already structured.

**Background.** Both tools are specified in [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), with their inputs, outputs, errors and annotations. `remember` calls the use case `remember` (FL-023), which calls an LLM. `record_fact` calls `recordStructuredFacts` (FL-024), makes no LLM call and needs no API key. The [MCP research](../../research/technical/mcp.md), "Practical constraints", records the hosts' default time limits for a tool call. The one extraction call measured in the [LLM research](../../research/technical/llm-anthropic.md), section 4, took a few seconds.

**Outcome.** An agent can tell Factloom something in its own words, or record one fact directly. The server now lists three tools.

**Scope.**
- The two tool definitions and handlers.
- Wiring the Anthropic client of FL-019 into the composition root, with the key from `ANTHROPIC_API_KEY`.
- The translation of a remembered fact and a skipped fact to the tool output.

**Non-goals.**
- Returning before extraction has finished. The call is synchronous in phase 1.
- Recording more than one fact per `record_fact` call. The use case takes a list, the tool takes one fact.
- Any rule about restatement or conflict. Those are in the use cases.

**Functional requirements.**
1. `remember` has the inputs of `MCP-TOOLS.md`: `text` of 1 to 20,000 characters and an optional `source` with `kind`, `locator` and `version`. A missing source is a note from the agent: kind `agent_note`, no locator, no version.
2. `remember` returns `{ facts, skipped }` in the `RecordedFact` and `SkippedFact` shapes of `MCP-TOOLS.md`. A text with nothing worth remembering returns two empty lists.
3. `record_fact` has the inputs of `MCP-TOOLS.md`: `subject`, `predicate`, `object`, `statement`, and optional `valid_from`, `valid_to`, `confidence` with default 1, and `source`. Dates are converted as in FL-058.
4. `record_fact` returns `{ fact }` with outcome `recorded` or `restated`.
5. Both handlers pass the configured namespace and the **trigger** `agent`.
6. Errors are translated as in FL-058. For `llm_failed`, the text also says that `record_fact` records a fact with no LLM call. With no API key configured, `remember` returns `llm_failed` and `record_fact` works.
7. For an unknown entity type or predicate, the text lists the allowed values, as the use case returns them.
8. The descriptions of `record_fact`'s `predicate` field and of its entity `type` fields list the domain's predicates and entity types. They are generated from `softwareDevelopmentDomain`, so they cannot drift from it.
9. Annotations follow the table in `MCP-TOOLS.md`. `remember` is open-world because the text goes to the LLM provider. Neither tool is destructive.
10. `tools/list` returns `recall`, `remember`, `record_fact`, in that order.

**Technical requirements.**
1. Each tool is one file with one handler that calls one use case.
2. The server-creating function, to which FL-058 added the first tool, gains the `LlmClient` as a dependency. Tests pass `createScriptedLlm`, or a client that fails on any call.
3. `predicate` and entity `type` stay plain strings in the input schema, so that an unknown value reaches the use case and gets its `invalid_input` with the allowed values.
4. The API key is passed to the Anthropic client and to nothing else. It is never logged.

**Constraints.**
- [ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md): a handler only translates.
- [ADR 0013](../../architecture/adr/0013-claude-behind-a-one-method-interface.md).
- [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Errors" and "Annotations".

**Acceptance criteria.**
- [x] Tests of `remember`, with the in-memory store and a scripted LLM, pass with these names: "records the extracted facts and returns them with their valid time", "returns a restated fact with the outcome restated", "returns a conflicting fact as skipped with the facts in the way", "returns two empty lists when nothing is extracted", "uses a note from the agent as the source when none is given", "says that record_fact needs no LLM when extraction fails", "returns llm_failed when no API key is configured".
- [x] Tests of `record_fact`, with a client that fails on any LLM call, pass with these names: "records a fact with no LLM call", "accepts calendar dates for the valid period", "uses confidence 1 when none is given", "returns the outcome restated for a fact that is already live", "returns conflict with the stored fact for a second value of a single-valued predicate", "lists the allowed predicates for an unknown predicate".
- [x] A test named "lists three tools in order with their annotations" asserts the order, the annotation values of `MCP-TOOLS.md`, an output schema on each tool and a description on every input field.
- [x] A test asserts that the description of `predicate` contains every predicate name of the domain.
- [x] `pnpm check` passes with no `ANTHROPIC_API_KEY` set and no network call to the LLM provider.

**Validation.** Unit tests with fakes and an in-process client, on every check. `record_fact` runs over stdio in the smoke test (FL-037). `remember` with a real key is run by the owner in FL-038.

**Completion evidence.** The commit, and the passing output of `pnpm check`.

**Recorded evidence.** Done on 2026-11-16, in the commit `feat(mcp-server): add the remember and record_fact tools`.

`pnpm check`, on Linux x64 with Node.js v22.23.4, run under `unshare -rn` with no network and with neither `ANTHROPIC_API_KEY` nor any other key in its environment, exited 0 and ended with:

```text
 Test Files  62 passed (62)
      Tests  738 passed (738)
```

Each rule was broken by hand once and a test failed: the `record_fact` hint on `llm_failed`, the default source kind, the default confidence, the mapping of `valid_to`, the open-world annotation of `remember`, and the list of predicates in the description of `predicate`.

Differences from the item:

- The list of tools is one constant, `FACTLOOM_TOOLS` in `factloom-tools.ts`, that `main.ts` and the stdio test entry both register, so the order of requirement 10 is set in one place and tested there.
- The test of FL-058 "starts over stdio on a new SQLite file" asserted that `tools/list` returns `recall` alone. Its expectation now lists the three tools in order, as requirement 10 says.
- The descriptions of `predicate` and the entity `type` fields are generated from the domain the server is given, `deps.domain`; the composition root gives `softwareDevelopmentDomain`.
- The fields of one fact (`fact-input-schema.ts`) and of a source (`source-input-schema.ts`) are their own modules, because `invalidate_fact` (FL-036) takes the same fact fields for its replacement.
- `main.ts` logs each LLM call's task, model, token counts and stop reason to standard error, through the `logUsage` of FL-019. The key is passed to the Anthropic client only.
- Extra tests: a given source is kept, an object that is an entity, an unreadable date names its field, and an unknown entity type lists the allowed ones.

### FL-036: invalidate_fact and get_fact_history tools

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-018, FL-035, FL-058, FL-025, FL-032 |
| Requirements | REQ-09, REQ-10 |
| Components | `apps/mcp-server` |

**Objective.** Add the tool that says a fact is wrong or no longer true, and the tool that shows how a fact changed and why. With them the server has the five tools of phase 1.

**Background.** Both tools are specified in [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md). `invalidate_fact` is one tool with a `because` field, because an agent thinks "this fact is no longer right" before it thinks about which time axis is involved ([ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md)). It calls `changeFact` (FL-025). `get_fact_history` calls `getFactHistory` (FL-032). Nothing is deleted by either tool. The replacement of `invalidate_fact` reuses the input schema and translation of `record_fact` (FL-035), and both handlers need the software development domain (FL-018) in the composition root, because `changeFact` and `getFactHistory` take it as a dependency.

**Outcome.** An agent can correct, retract, end or replace a fact it recalled, and can read the **fact history** of any fact. `tools/list` returns the complete surface of phase 1.

**Scope.**
- The two tool definitions and handlers.
- The translation of a history entry and its audit entries to the tool output.
- The test that fixes the five-tool surface.

**Non-goals.**
- Reading the explanation of a change. The `getFactHistory` use case supplies it with each audit entry (FL-032); the handler only passes it on.
- A feedback tool: FL-059 in EPIC-08, which makes the surface six tools in phase 2.
- Any rule about which operation applies. `changeFact` decides from `because` and `replacement`.

**Functional requirements.**
1. `invalidate_fact` has the inputs of `MCP-TOOLS.md`: `fact_id`, `because` (`was_wrong` or `no_longer_true`), `reason` of 1 to 1,000 characters, optional `ended_at`, and optional `replacement` with the inputs of `record_fact` without `source`.
2. The handler passes `reason` as the use case's `explanation`, converts `ended_at` and the replacement's dates as in FL-058, and passes the trigger `agent`.
3. `invalidate_fact` returns `{ invalidated_fact_id, replacement_fact_id }`, where `replacement_fact_id` is the new fact or `null`.
4. For `already_invalidated`, the error text gives the identifier of the superseding fact when there is one.
5. The annotations of `invalidate_fact` say it is not read-only and not destructive. Its description says the fact stays on record.
6. `get_fact_history` takes `fact_id` and returns `{ entries }` in the order the use case gives. Each entry is a `RecalledFact` without `score`, plus `changes`: a list of `{ operation, action, trigger, reason_code, explanation, occurred_at }` taken from the fact's audit entries. `explanation` is the content of the source that explains the change, or `null` if there is none or it was purged, as `MCP-TOOLS.md` specifies.
7. `get_fact_history` is read-only and not open-world.
8. Errors are translated as in FL-058.
9. `tools/list` returns `recall`, `remember`, `record_fact`, `invalidate_fact`, `get_fact_history`, in that order.

**Technical requirements.**
1. Each tool is one file with one handler that calls one use case.
2. The replacement reuses the input schema and the translation of `record_fact` from FL-035.
3. The entries reuse the translation of a fact with sources from FL-058.

**Constraints.**
- [ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md) and [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md).
- [ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md): the reason is the content of a source, not part of the audit log.
- [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Errors" and "Annotations".

**Acceptance criteria.**
- [x] Tests of `invalidate_fact`, with the in-memory store, pass with these names: "corrects a fact and returns the replacement's identifier", "retracts a fact and returns no replacement", "ends a fact at the given date and records the replacement from that date", "ends a fact now when no date is given", "returns already_invalidated with the superseding fact for a fact that was revised", "returns not_found for an unknown fact", "returns invalid_input for a malformed end date".
- [x] Tests of `get_fact_history` pass with these names: "returns both facts of a succession with the changes of each", "returns each change with its operation, reason code and explanation", "returns the reason given to invalidate_fact as the explanation of the change", "returns a null explanation for a change that names no source", "returns not_found for an unknown fact".
- [x] A test named "lists the five tools in order with their annotations" asserts the five names in order, the annotation values of the table in `MCP-TOOLS.md` for every tool, an output schema on each, and a description on every input field including the fields of `replacement`.
- [x] A test asserts that after a correction made through `invalidate_fact`, `recall` with no date returns the replacement and not the wrong fact, and `recall` with a `known_at` date before the correction returns the wrong fact with `invalidated_at` and `superseded_by_fact_id` set.
- [x] `pnpm check` passes.

**Validation.** Unit tests with fakes and an in-process client, on every check. Both tools run over stdio in the smoke test (FL-037).

**Completion evidence.** The commit, and the passing output of `pnpm check`.

**Recorded evidence.** Done on 2026-11-16, in the commit `feat(mcp-server): add the invalidate_fact and get_fact_history tools`.

`pnpm check`, on Linux x64 with Node.js v22.23.4, run under `unshare -rn` with no network and no API key, exited 0 and ended with:

```text
 Test Files  64 passed (64)
      Tests  753 passed (753)
```

Each rule was broken by hand once and a test failed: the reason passed as the explanation, the identifier of the replacement, `ended_at`, the explanation of a change in the history, and the destructive annotation.

Differences from the item:

- The tests reach memory only through the tools: a fact is recorded with `record_fact`, changed with `invalidate_fact`, and read with `recall` and `get_fact_history`, on a helper (`testing/tool-session.ts`) that connects a client to all five tools for each call, with an LLM that fails the test if it is called.
- The description on every field of `replacement` is asserted by its own test, "describes every field of the replacement of invalidate_fact", beside "lists the five tools in order with their annotations".
- The stdio test of FL-058 now expects the five tools in order.
- Extra test: a malformed date in the replacement names the field `replacement.valid_from`.

### FL-037: Smoke test over stdio with a restart

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-002, FL-035, FL-036 |
| Requirements | REQ-11, REQ-12, REQ-36 |
| Components | `apps/mcp-server` |

**Objective.** Prove on every check that the server starts as a host would start it, answers over stdio, runs from one SQLite file with no other service, and keeps memory across a restart.

**Background.** [`TESTING.md`](../../architecture/TESTING.md), "Smoke test", defines it: start the server as a child process on a temporary database, with no API key, list the tools, record a fact with `record_fact`, restart the process, recall the fact, and check that `remember` answers `llm_failed`. Two projects studied in the research did not start on a fresh install because a dependency had moved, so the test runs against exact pinned versions ([ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md), "Consequences"; [competitive analysis](../../research/evaluations/competitive-analysis.md), REQ-CA-07 and REQ-CA-08). The pin test of FL-001 enforces those versions. The [MCP research](../../research/technical/mcp.md) records the default start-up limit of one host, 10 seconds.

`pnpm check` needs no network, no API key and no embedding model (`TESTING.md`), and `record_fact` and `recall` embed text. The test therefore starts the test entry of FL-058, which serves the same server as `main.ts` with the fake embedder. The real embedder is exercised end to end by the clean-install job (FL-003).

**Outcome.** A broken start, a stray write to standard output or a lost fact after a restart fails `pnpm check`.

**Scope.**
- One test that drives two server processes, one after the other, on the same database file.

**Non-goals.**
- A pin check of its own. The pin test of FL-001 covers the three SDKs.
- The real embedding model in the child process: FL-003 and FL-066.
- A fake LLM inside the child process. The composition root has no switch for tests. The test starts the server with no API key, records with `record_fact`, and checks that `remember` answers `llm_failed`. `remember` with a scripted LLM is tested in process in FL-035.
- Two processes writing at the same time. That case is in the storage contract suite (FL-067) and the adapter tests of FL-068.
- The packed install on a clean machine: FL-003, which reuses this test's steps.
- A real host. The owner does that in FL-038.

**Functional requirements.**
1. The test creates a temporary directory and starts `node` on the test entry of FL-058 with `FACTLOOM_DB` in that directory, a `FACTLOOM_NAMESPACE`, and no `ANTHROPIC_API_KEY`.
2. First process: it calls `tools/list` and expects the five tool names in order. It calls `record_fact` with a fact of the software development domain and expects outcome `recorded`. It calls `remember` and expects a tool error that starts with `llm_failed`. It closes standard input and expects exit code 0.
3. Second process, same database: it calls `recall` with a question about the fact and expects the fact's identifier in the result. It calls `get_fact_history` for that identifier and expects one entry with one change whose action is `fact.recorded`. It calls `invalidate_fact` with `because: "was_wrong"` and no replacement, then `recall` again, and expects the fact to be absent.
4. The test asserts that every line either process wrote to standard output parses as a JSON-RPC message.
5. The test asserts that the first process answered `tools/list` within 10 seconds of being started.
6. The temporary directory holds the database file and SQLite's own companion files and nothing else. The test removes it afterwards.

**Technical requirements.**
1. The test uses the pinned MCP client package as a development dependency, or raw JSON-RPC lines as in the proof in the MCP research.
2. The embedder is the fake embedder of `core`, built by the test entry. No model is loaded or downloaded.
3. The test runs as part of `pnpm check`.

**Constraints.**
- [ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md).
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "Connection settings".
- [`.claude/rules/testing.md`](../../../.claude/rules/testing.md): never skip or weaken a failing test.

**Acceptance criteria.**
- [x] A test named "the server keeps a recorded fact across a restart" passes and covers requirements 1 to 6.
- [x] `pnpm check` passes with no network access and no embedding model in the cache.
- [x] `pnpm check` passes on Linux and on macOS arm64 in the workflow of FL-002. The address of that run is recorded.

**Validation.** The smoke test, on every check, on both platforms of continuous integration.

**Completion evidence.** The commit. The passing output of `pnpm check` locally and the two passing continuous integration runs.

**Recorded evidence.** Done on 2026-11-16, in the commit `test(mcp-server): add the stdio smoke test with a restart` (394f4ed). The test is "the server keeps a recorded fact across a restart", in `apps/mcp-server/src/serve-with-fake-embedder.test.ts`, beside the stdio test of FL-058. It speaks raw JSON-RPC lines through the helpers of `testing/server-process.ts`, and gives the child process the temporary directory as its home, so that a stray file there would fail the last assertion.

`pnpm check`, on Linux x64 with Node.js v22.23.4, run under `unshare -rn` with no network and no API key, and with the local model cache `.cache` moved out of the working tree for the run, exited 0 and ended with:

```text
 Test Files  64 passed (64)
      Tests  754 passed (754)
```

Continuous integration on that commit passed every check job, on Linux and on macOS arm64, each with Node 22 and Node 26: https://github.com/Enriquez-Johnmark/factloom/actions/runs/43916974103

The entry was broken by hand twice and the test failed each time: the store opened on `:memory:` in place of the file, which lost the fact at the restart, and a line of plain text written to standard output.

### FL-038: Registration guide for Claude Code and Codex, confirmed on Apple Silicon

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-037 |
| Requirements | REQ-10, REQ-29, REQ-36 |
| Components | `apps/mcp-server` (README), `docs/research` |

**Objective.** Write the exact steps to register the server in Claude Code and in Codex, have the owner run them on an Apple Silicon Mac, and record what happened.

**Background.** The [MCP research](../../research/technical/mcp.md) wrote the registration commands and configuration for both hosts from their documentation and did not run them (open question Q-15). All research ran on Linux x64. The following are unverified on the owner's machine in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md): whether the two native SQLite modules load on macOS arm64 (Q-01), whether macOS refuses to load an installed native file (Q-02), and how the embedding runtime behaves there (Q-23). Continuous integration on macOS arm64 (FL-002) runs the same code on a hosted machine, which is not the owner's Mac and does not involve a host. This work item needs the owner. An agent prepares the guide and the record, and the owner runs the steps.

**Outcome.** A reader can register Factloom in either host by copying from the README. The Apple Silicon question is closed with recorded evidence, or the item is `Blocked` with the exact failure.

**Scope.**
- A section of the guide on subscriptions and API keys, covering four set-ups: Claude Code on a subscription, Claude Code on an API key, Codex on a subscription, and Codex on an API key. For each: whether the server registers the same way, and which tools work with no API key of Factloom's own ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Subscriptions and API keys").
- A section "Register the server" in the README of `apps/mcp-server`.
- The run on the owner's Mac, and the record of it.
- The closing of the rows in `OPEN-QUESTIONS.md`, with the research documents those rows name brought up to date.

**Non-goals.**
- Hooks that call recall when a session starts, and a pointer line in `CLAUDE.md` or `AGENTS.md`. Both are later and optional ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Not in phase 1").
- Measuring how often an agent calls the tools unprompted (Q-19).
- Project-scoped configuration with relative paths. The working directory of a server started that way is unverified (Q-16), so the guide uses absolute paths.
- Publishing a package. The guide starts the server from a clone of the repository.

**Functional requirements.**
1. The guide states the prerequisites: the Node versions of [ADR 0015](../../architecture/adr/0015-toolchain.md), a clone of the repository, and `pnpm install`.
2. For Claude Code it gives the `claude mcp add` command with the stdio transport, a scope, `FACTLOOM_NAMESPACE` and optionally `ANTHROPIC_API_KEY` passed as environment values, and `node` with the absolute path of the server's `main.ts`. It also gives the equivalent `.mcp.json` entry. Both follow the forms in the "Claude Code" section of the MCP research.
3. For Codex it gives the `codex mcp add` command with the same environment values and server command, and the equivalent `[mcp_servers.factloom]` table for `~/.codex/config.toml`. Both follow the "OpenAI Codex" section of the MCP research.
4. The guide explains the three variables of `MCP-TOOLS.md`, that the namespace is required and should be one name per repository, that `remember` needs the API key and the other four tools do not, and that the first tool call that embeds a text downloads the embedding model and needs network access.
5. The guide says how to check the registration: `/mcp` in each host shows the server and its five tools.
6. The guide never contains a real key. It shows the variable name only.
7. After the run, the section carries one line: the date, the macOS version, the Node version, and the versions of Claude Code and Codex it was confirmed with.

**Technical requirements.**
1. Every command in the guide is one the owner ran as written. A command that had to be changed is corrected in the guide and in the MCP research, with the date.
2. A closed question is removed from section A of `OPEN-QUESTIONS.md` only after the research document it names is brought up to date with the result, as that file's introduction requires.

**Constraints.**
- [`.claude/rules/engineering-principles.md`](../../../.claude/rules/engineering-principles.md), "Accuracy": a step that was skipped or failed is not reported as done.
- [`.claude/rules/git.md`](../../../.claude/rules/git.md): no secret in any committed file.
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md).

**Acceptance criteria.**
- [x] With no `ANTHROPIC_API_KEY` set, the owner asks the agent in each host to save one fact and recall it. The agent records it with `record_fact` and recalls it, and the result is recorded in the guide for each set-up the owner has access to. A set-up the owner cannot test is marked untested, not assumed to work.

The owner runs each step on the Apple Silicon Mac, in order, and records the result in the completion record.

- [x] `uname -m`, `sw_vers` and `node --version`. Record the three outputs. The first is `arm64`.
- [x] At the repository root: `pnpm install`, then `pnpm check`. Record pass or fail. A pass means the native SQLite modules loaded and the smoke test ran on this machine.
- [x] `cd spikes/sqlite-vec-fts5 && npm ci && node spike.mjs`. Record the `platform` line and the last line. Expected: `platform: 'darwin-arm64'` and `SPIKE OK`. This is the check Q-01 names.
- [x] If any native module fails to load in the two steps above: record the exact message and the output of `xattr` on the file it names, set this work item to `Blocked`, and stop. This is the check Q-02 names.
- [x] `cd spikes/embedding-retrieval && npm ci && node compare.mjs`, then `du -sh node_modules`. Record the "Size and time" rows for `bge-small-en-v1.5`, the load time of the first run, and the size. This is the check Q-23 names.
- [x] Claude Code: run the guide's `claude mcp add` command with a namespace made for this test. Start a session, run `/mcp`, and record that the server is connected and lists five tools. Record `claude --version`.
- [x] In that session, ask the agent to call `record_fact` with subject `repository` named `factloom`, predicate `uses_package_manager`, object `dependency` named `pnpm`. Record the returned outcome and fact identifier. Record how long the call took, since it includes the model download.
- [x] End the session, start a new one, and ask the agent to call `recall` with the question "Which package manager does this repository use?". Record that the fact is returned.
- [x] With `ANTHROPIC_API_KEY` set in the registration, ask the agent to call `remember` with the text "We use Vitest for unit tests." Record the returned facts and how long the call took.
- [ ] Codex: run the guide's `codex mcp add` command with the same database and namespace. Start a session, run `/mcp`, and record that the server is connected. Record `codex --version`.
- [ ] In the Codex session, ask the agent to call `recall` with the same question. Record that the fact recorded from Claude Code is returned. Then ask it to call `get_fact_history` for that fact and record the number of entries.
- [x] The README section carries the confirmation line of requirement 7.
- [x] Rows Q-01, Q-02, Q-15 and Q-23 of `OPEN-QUESTIONS.md` are closed with the recorded results, and [`mcp.md`](../../research/technical/mcp.md), [`sqlite.md`](../../research/technical/sqlite.md) and [`embeddings.md`](../../research/technical/embeddings.md) say "confirmed" with the date where they said "likely" or "unverified" for these points. A row whose step failed stays open, with the failure recorded.

**Validation.** A run by the owner on the Apple Silicon Mac. No automated test can stand in for the two hosts.

**Completion evidence.** The commit with the README section and the revised research documents. In the commit message or in the closed rows: the outputs recorded in each step above, the two host versions, and the date of the run.

**Recorded evidence.** Prepared on 2026-11-17 by the agent, in three commits: `docs(mcp-server): add the guide to registering the server in Claude Code and Codex`, `docs: record that claude mcp add needs the server name before --env`, and `docs(mcp-server): put the server name before --env and record the Linux dry run`. The item is `Under Review`: every acceptance criterion is a step the owner runs on the Apple Silicon Mac, and none is ticked.

Prepared:

- **The guide.** The section "Register the server" of [`apps/mcp-server/README.md`](../../../apps/mcp-server/README.md):
  - the prerequisites and the three variables;
  - the `claude mcp add` command and the `.mcp.json` entry;
  - the `codex mcp add` command and the `~/.codex/config.toml` table;
  - how to check the registration;
  - the table of the four set-ups, each marked "Not yet (FL-038)".
- **No key in the guide.** The `.mcp.json` entry takes the key with `${ANTHROPIC_API_KEY:-}`, which the server reads as unset when empty. The Codex table forwards it with `env_vars`.

Run here, on Linux with Claude Code 2.1.326, with a throwaway home directory and project:

- **The research's argument order fails.** `claude mcp add --transport stdio --scope local --env FACTLOOM_NAMESPACE=repo:shop-api factloom -- node …/main.ts` exited with `Invalid environment variable format: factloom`. `--env` takes several values (`-e, --env <env...>` in `claude mcp add --help`), so it took the name as one of them.
- **The corrected order works.** With the name before `--env`, the server was added to the local config, and `claude mcp list` printed `factloom: node /home/user/factloom/apps/mcp-server/src/main.ts - √ Connected`.
- **The `.mcp.json` entry** was listed as `⏸ Pending approval (run `claude` to approve)`, as the research says for a project server in an interactive session.
- **The fix is recorded** in the guide and in [`mcp.md`](../../research/technical/mcp.md), with the date, as technical requirement 1 asks.

Not run here:

- No Claude Code session was started, so neither `/mcp` nor a tool call was made.
- Codex is not installed here.
- Nothing ran on macOS. FL-003's clean-install job shows the installed server, its native SQLite modules and the embedding runtime working on GitHub's macOS arm64 runner. That is not the owner's Mac, and no host is involved.
- Q-01, Q-02, Q-15, Q-16, Q-23 and Q-79 stay open until the owner's run.

Differences from the item:

- **Six tools.** `/mcp` will list six tools, not five: `give_feedback` was added in phase 2.
- **The guide adds `tool_timeout_sec = 300`** to the Codex table. Codex's default of 60 seconds may be too short for the first call, which downloads the embedding model.

**Owner's run on the Mac, 2026-11-25 and 2026-11-26.** On the owner's MacBook Air with an Apple M1 (8 cores):

- **Machine:** `uname -m` printed `arm64`; `sw_vers` printed macOS 26.5, build 25F71; `node --version` printed v26.13.1, inside the range of ADR 0015.
- **The workspace:** pnpm 12.18.0 was installed with `npm install -g pnpm@12.18.0`, as none was installed. `pnpm install` passed the lockfile's supply-chain policies, and `pnpm check` passed: 124 test files, 1,211 tests, in 15 s. The native SQLite modules loaded and the smoke test ran on this machine.
- **`spikes/sqlite-vec-fts5`:** `platform: 'darwin-arm64'`, SQLite 3.54.1, sqlite-vec v0.1.9, FTS5 compiled in, and the last line `SPIKE OK`. No native module failed to load, so the Q-02 step did not apply.
- **`spikes/embedding-retrieval`:** with `@huggingface/transformers` 4.3.2, `Xenova/bge-small-en-v1.5` q8, the model Factloom loads, was 32.4 MB, loaded in 17.11 s including the download, and embedded a text in 3.3 ms over 140 texts. The fp32 model was 126.9 MB and took 5.3 ms. `du -sh node_modules` printed 849M.
- **Claude Code 2.1.331, on a subscription:** the guide's `claude mcp add --transport stdio --scope local factloom --env FACTLOOM_NAMESPACE=repo:fl038-test -- node .../apps/mcp-server/src/main.ts` ran as written. `claude mcp list` showed the server connected, and `/mcp` showed it connected with six tools, protocol 2026-07-28. Claude Code stored the registration in `$CLAUDE_CONFIG_DIR/.claude.json`, which on this Mac is `~/.claude-personal/.claude.json`.
- **`record_fact`, with no key:** the agent recorded fact `7ea176a3-10f2-4823-a987-29693d79f531`, "The repository factloom uses pnpm as its package manager.", with outcome `recorded`, writing the statement itself. Its duration, which includes the model download, was not measured.
- **`recall` in a new session:** "Which package manager does this repository use?" returned that fact, with confidence 1 and score 0.75.
- **`remember`, with the key in the registration:** "We use Vitest for unit tests." first returned no fact and nothing skipped, because the text names no repository. That finding became FL-078. With FL-078 pulled, the same text recorded fact `ad3d3ef9-4a1f-45a3-a217-bb79a15f20ae`, "The repository fl038-test runs its unit tests with Vitest.", nothing skipped, in a turn of 14 s.
- **Codex:** not run. The owner does not use Codex, so its two criteria are not ticked, and the guide marks the Codex set-ups untested, as the first criterion allows. Q-15 stays open for Codex only.

The guide carries the confirmation line; Q-01 and Q-02 had been closed on 2026-11-14; Q-23 is closed with the measurements above, and `mcp.md` and `embeddings.md` say "confirmed" with the date. The item is `Completed` with the owner's decision on Codex.

### FL-079: A registered coding agent uses Factloom rather than only its built-in memory

| | |
|---|---|
| Status | Under Review |
| Phase | 1 |
| Depends on | FL-074, FL-038 |
| Requirements | REQ-37 |
| Components | `apps/mcp-server` (server, tool descriptions, registration guide), the agent comparison of FL-074 |

**Objective.** Make a coding agent that has Factloom registered save what it learns to Factloom and recall it there, and measure the comparison of FL-074 again.

**Background.** Found in the owner's run of FL-074 on 2026-11-26 ([report](../../../apps/mcp-server/evals/agent-comparison/results/2026-11-26/report.md), raw output beside it): with the server `connected` and its six tools listed, Claude Code 2.1.332 called no Factloom tool in any of 20 sessions. In the first session of every task it wrote to its own auto memory, and read it back in the second. The comparison therefore measured what registering Factloom costs an agent that does not use it. Two levers are documented or present, and neither is tried yet:
- Claude Code turns auto memory off with `autoMemoryEnabled: false` in a project's settings, or with `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` ([memory](https://code.claude.com/docs/en/memory.md), [environment variables](https://code.claude.com/docs/en/env-vars.md), accessed 2026-11-26; confirmed in the documentation, not yet run).
- The server's instructions in its MCP initialize result (`src/server-instructions.ts`, from FL-034). Claude Code loads them at session start ([MCP](https://code.claude.com/docs/en/mcp.md), "Scale with MCP tool search", accessed 2026-11-26). They said to call `recall` "before answering a question about the project" and to save "something lasting"; whether different words change the agent's choice is unverified until a run.

(This background first said the server sent no instructions. That was wrong: a search cut short missed the file. Corrected on 2026-11-26.)

**Outcome.** A set-up that a user can copy, under which the agent calls Factloom in the tasks of FL-074, and a second report of the comparison.

**Scope.**
- The cause: from the agent's documentation and the raw output, why the agent chose its built-in memory.
- The smallest change that a user would also get: server instructions saying what Factloom is for and when to call `recall` and `remember`, clearer tool descriptions, or a step in the registration guide that turns auto memory off for a repository that uses Factloom, or more than one of these.
- The comparison of FL-074 run again by the owner into a new dated results folder, with the task set and checks unchanged.

**Non-goals.**
- Changing the task set or checks of FL-074, or turning auto memory off in its baseline: its functional requirement 3 stays.
- Wording that names the tasks. A change must help any repository, not these ten.

**Functional requirements.**
1. Each change is stated with the documentation page it relies on, cited with its access date.
2. Server instructions, if added, are a few sentences, and the stdio smoke test reads them from the initialize result.
3. The second report and the `README.md` sentence are written whatever they show.

**Technical requirements.**
1. The runner of FL-074 is reused as it is; a set-up step it needs, such as a settings file for the run, is passed the same way in both configurations unless it is the change under test, and the report lists it.
2. Secrets: as in FL-074, nothing prints or stores a key or a session token.

**Constraints.**
- Findings are labelled as measured or unverified, and nothing is stated as fact without its source ([engineering principles](../../../.claude/rules/engineering-principles.md)).
- Glossary terms are used exactly ([`GLOSSARY.md`](../../../GLOSSARY.md)).

**Acceptance criteria.**
- [x] The cause is stated with its evidence: a documentation page, or a run's raw output.
- [ ] In the owner's second run with Factloom, the agent calls `remember` or `record_fact` in the first session and `recall` in the second, in at least 8 of the 10 tasks.
- [ ] The second report is committed, and the `README.md` sentence matches it.
- [x] `pnpm check` exits 0 and does not start the runner.

**Validation.** Unit or smoke tests for any server change; the owner's run for the rest, because it needs a signed-in agent and spends tokens.

**Completion evidence.** The commits, the cited pages, the second report and the `README.md` sentence.

**Recorded evidence.** Prepared on 2026-11-26 on Linux x64 with Node.js v22.23.4. The item is `Under Review`: the second run (criteria 2 and 3) is the owner's, because it needs a signed-in agent and spends tokens.

- **The cause, from the raw output of FL-074's run.** In all ten first sessions with Factloom, the agent wrote to auto memory, and in three it said why: "I didn't also write it to Factloom, to avoid keeping two copies" (refund-rounding, and invoice-number in nearly the same words), "I used the file-based memory, not the Factloom repo memory" (utc-dates). So it saw Factloom and chose the memory Claude Code ships, to keep one copy. In the second sessions, Claude Code loads the auto memory index by itself, while Factloom needs a `recall` call, and the instructions asked for one only before answering a question, which a coding task is not. What auto memory saves is in the [memory documentation](https://code.claude.com/docs/en/memory.md) (decisions "that Claude can't derive from the code", accessed 2026-11-26); the exact words of its prompt are not documented.
- **The changes.**
  - The server instructions now say to call `recall` "at the start of a task in this repository, and before answering a question about it", and to save "when you are asked to remember something, or learn something lasting". 976 characters, under the test's 1,000 and Claude Code's 4,096. A new stdio test reads them from the initialize result; it was seen to fail with the instructions removed.
  - The registration guide (`apps/mcp-server/README.md`) tells a Claude Code user to turn auto memory off in a repository whose memory is Factloom, with `"autoMemoryEnabled": false` in `.claude/settings.json`, citing the memory documentation, and names `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` for one session ([environment variables](https://code.claude.com/docs/en/env-vars.md)).
  - The runner passes `--settings '{"autoMemoryEnabled":false}'` in the run with Factloom only, so that run follows the guide and the baseline stays as shipped (FL-074, functional requirement 3). `--settings` is listed by `claude --help` of Claude Code 2.1.332 here, and the report's "How it was run" shows the setting. Unit tests: the two configurations differ only by the server configuration and this setting.
  - The runner now writes the home directory as `~` in the raw and check output, because the first run's results published the owner's user name in paths. A user name printed outside a path, as in `ls -l` output, is not caught.
- **Not verified.** That the setting turns auto memory off was not seen here: a `claude -p` run in this container reported `memory_paths: null` with and without it, unlike the owner's run, so the owner's second run is the test. That run made two real one-word model calls through the container's network proxy, which supplied a credential in place of the dummy key given; no other session was started.

### FL-080: Fewer turns for a coding agent that uses Factloom

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-079 |
| Requirements | REQ-37 |
| Components | `apps/mcp-server` (registration guide, server), the agent comparison of FL-074 |

**Objective.** Cut the turns an agent spends reaching Factloom, so that using it costs fewer tokens, and measure the comparison again.

**Background.** The second comparison of FL-079 ([report](../../../apps/mcp-server/evals/agent-comparison/results/2026-11-26-second/report.md)) measured a cost: +17.7% tokens for the median task, 101 turns against 76 in the second sessions, 16 `ToolSearch` calls, and one task failed because the agent did not call `recall`. Claude Code defers MCP tools by default, so a tool is loaded with a search before its first call ([MCP](https://code.claude.com/docs/en/mcp.md), "Configure tool search", accessed 2026-11-26), and auto memory is in the context from the start. Two levers, neither run:
- `alwaysLoad: true` in the server's configuration loads its tools without a search step (same page; Claude Code 2.1.287 or later). It would remove the `ToolSearch` turn and add the six tool definitions to every session's context.
- A hook that puts the result of a `recall` into the context at the start of a session, so that no turn is needed and the agent cannot skip it. Whether a Claude Code hook can add context this way is unverified, and the item starts by confirming it in the hooks documentation.

**Outcome.** A set-up in the registration guide with fewer turns than FL-079's, and a third report of the comparison.

**Scope.**
- Each lever confirmed in the agent's documentation, then tried in the comparison, the run with Factloom only, the baseline as in FL-079.
- The guide updated with what the run shows.

**Non-goals.**
- Changing the task set or checks of FL-074, or its baseline.
- Wording or recall results that name the tasks.

**Functional requirements.**
1. Each change is stated with the documentation page it relies on, cited with its access date.
2. The third report and the `README.md` sentence are written whatever they show.

**Technical requirements.**
1. The runner of FL-074 is reused; a set-up change under test is passed only in the run with Factloom, and the report lists it.
2. Secrets: as in FL-074, nothing prints or stores a key or a session token.

**Constraints.**
- Findings are labelled as measured or unverified, and nothing is stated as fact without its source ([engineering principles](../../../.claude/rules/engineering-principles.md)).
- Glossary terms are used exactly ([`GLOSSARY.md`](../../../GLOSSARY.md)).

**Acceptance criteria.**
- [ ] Each lever tried is confirmed in the agent's documentation, with the page cited.
- [ ] The owner's third run is committed, with fewer turns in the second sessions than FL-079's 101, and its report and the `README.md` sentence match.
- [ ] `pnpm check` exits 0 and does not start the runner.

**Validation.** Unit tests for any runner or server change; the owner's run for the rest.

**Completion evidence.** The commits, the cited pages, the third report and the `README.md` sentence.
