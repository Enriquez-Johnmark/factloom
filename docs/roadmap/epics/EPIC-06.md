# EPIC-06: MCP server

| | |
|---|---|
| Status | Pending |
| Phases | 1 |
| Packages | `apps/mcp-server` |
| Requirements | REQ-04, REQ-09, REQ-10, REQ-11, REQ-12, REQ-13, REQ-25, REQ-29, REQ-35 |

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
| FL-034 | Server configuration and composition root | 1 | FL-014, FL-015, FL-016, FL-017, FL-026 | Pending |
| FL-058 | recall tool end to end | 1 | FL-034, FL-031 | Pending |
| FL-035 | remember and record_fact tools | 1 | FL-058, FL-023, FL-024 | Pending |
| FL-036 | invalidate_fact and get_fact_history tools | 1 | FL-058, FL-025, FL-032 | Pending |
| FL-037 | Smoke test over stdio with a restart | 1 | FL-035, FL-036 | Pending |
| FL-038 | Registration guide for Claude Code and Codex, confirmed on Apple Silicon | 1 | FL-037 | Pending |

### FL-034: Server configuration and composition root

| | |
|---|---|
| Status | Pending |
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
1. `@modelcontextprotocol/server` is a dependency with an exact version and no range. The version is the latest of the version 2 line on the registry on the day of implementation, checked with `npm view` and cited in the commit message. The research records the version it verified. The client package used by tests is a development dependency, pinned the same way.
2. Configuration is parsed by a Zod schema in a pure function that takes the environment as an argument and returns a `Result`.
3. Only `main.ts` reads the environment and names concrete implementations. The clock uses `toTimestamp` from `core`.
4. The embedder's cache directory is `models` beside the default database, in `~/.factloom/`.
5. Nothing in the app writes to standard output except the SDK's transport. All logging goes through the one logger.
6. The function that creates the server takes its dependencies as one argument and takes the tools to register as a list, which is empty in this item. FL-058, FL-035 and FL-036 each add to the list and change nothing else in the frame.

**Constraints.**
- [ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md), [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md), [ADR 0003](../../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md).
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "Connection settings": several server processes can share one file.
- [`.claude/rules/typescript.md`](../../../.claude/rules/typescript.md): data from outside is parsed by a schema at the edge.

**Acceptance criteria.**
- [ ] Tests of configuration pass with these names: "uses the default database path when none is given", "fails without a namespace and says why", "accepts a missing API key".
- [ ] A test named "the instructions fit the limit" asserts that the string is not empty and has at most 1,000 characters.
- [ ] A test named "gives its instructions when a client connects", with a server built from fakes and a client connected in process, asserts that the initialise result carries the instructions string.
- [ ] A test named "starts over stdio on a new SQLite file" starts `node` on `main.ts` as a child process with a temporary `FACTLOOM_DB` and a namespace, completes the initialise exchange over stdio, closes standard input, and asserts exit code 0 and that the database file exists.
- [ ] The same test asserts that every line the child wrote to standard output parses as a JSON-RPC message.
- [ ] A test named "exits when no namespace is configured" starts the child without `FACTLOOM_NAMESPACE` and asserts an exit code other than 0 and a message on standard error.
- [ ] A test named "exits when the database was built with another embedding model" prepares a database whose embedding rows name another model, starts the child on it, and asserts an exit code other than 0 and `embedding_model_mismatch` on standard error.
- [ ] A test reads `apps/mcp-server/package.json` and fails if the version of `@modelcontextprotocol/server` is a range.
- [ ] `pnpm check` passes.

**Validation.** Unit tests of configuration and of the server-creating function with fakes and an in-process client. Tests over stdio with a child process and the SQLite adapter. All on every check.

**Completion evidence.** The commit, with the registry check in its message. The passing output of `pnpm check`.

### FL-058: recall tool end to end

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-034, FL-031 |
| Requirements | REQ-03, REQ-04, REQ-10 |
| Components | `apps/mcp-server` |

**Objective.** Add the first tool, `recall`, working from a tool call over stdio down to the SQLite file, with the translations that every later tool reuses.

**Background.** The `recall` tool is specified in [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "`recall`", "Dates", "Errors" and "Annotations". It calls the `recall` use case (FL-031) and holds no rule of its own ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "What a handler does"). The [MCP research](../../research/technical/mcp.md) verified `registerTool` with an input schema, an output schema and annotations, that the SDK checks `structuredContent` against the output schema, and that a result with `isError: true` reaches the model. It also found that some Zod date and identifier types add a long pattern to the listed schema. This item is the second part of the original FL-034: the frame is built there, and the first tool here.

**Outcome.** A host that connects to the server lists one tool, `recall`, which answers from the configured database and namespace. FL-035 and FL-036 add their tools by reusing the translation of a fact, of a date and of an error.

**Scope.**
- The `recall` tool: its input schema, output schema, annotations and handler.
- The shared translation from a fact with its sources to the tool output.
- The shared translation of a date input, and from a failed `Result` to a tool error.
- A test over stdio from the tool call to the SQLite file.

**Non-goals.**
- The other four tools: FL-035 and FL-036.
- The time defaults and the lanes. They are in the use case (FL-031) and the store.
- A tool parameter for the recall settings, or for including an **archived fact**: FL-065 in EPIC-09 adds the second.
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

**Constraints.**
- [ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md): a handler only translates.
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md): the namespace comes from configuration; the tool takes none.
- [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Errors" and "Annotations".
- [`.claude/rules/typescript.md`](../../../.claude/rules/typescript.md): data from outside is parsed by a schema at the edge.

**Acceptance criteria.**
- [ ] Tests of the tool, with a server built from the in-memory store and the fake embedder and a client connected in process, pass with these names: "lists recall with a description on every input field", "declares an output schema and the read-only annotation", "returns the same facts as structured content and as text", "returns current facts when no date is given", "accepts a calendar date as the as-of date", "returns a fact withdrawn since the known-at date with its invalidation", "returns invalid_input for a malformed date", "returns each source without its content", "starts an error text with the error code".
- [ ] Unit tests of the translations pass with these names: "translates a fact with an entity as its object", "translates a fact with a value as its object", "puts the related fact identifiers after the message of an error".
- [ ] A test named "answers recall over stdio from a SQLite file" records one fact in a temporary database through `recordFacts` with the SQLite store and the local embedder, starts `node` on `main.ts` as a child process with that database and a namespace, calls `recall` over stdio, and finds the fact in the result.
- [ ] The same test asserts that every line the child wrote to standard output parses as a JSON-RPC message.
- [ ] `pnpm check` passes.

**Validation.** Unit tests with fakes and an in-process client. One test over stdio with a child process, the SQLite adapter and the real embedder. All on every check.

**Completion evidence.** The commit, and the passing output of `pnpm check`.

### FL-035: remember and record_fact tools

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-058, FL-023, FL-024 |
| Requirements | REQ-10, REQ-13 |
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
- [ ] Tests of `remember`, with the in-memory store and a scripted LLM, pass with these names: "records the extracted facts and returns them with their valid time", "returns a restated fact with the outcome restated", "returns a conflicting fact as skipped with the facts in the way", "returns two empty lists when nothing is extracted", "uses a note from the agent as the source when none is given", "says that record_fact needs no LLM when extraction fails", "returns llm_failed when no API key is configured".
- [ ] Tests of `record_fact`, with a client that fails on any LLM call, pass with these names: "records a fact with no LLM call", "accepts calendar dates for the valid period", "uses confidence 1 when none is given", "returns the outcome restated for a fact that is already live", "returns conflict with the stored fact for a second value of a single-valued predicate", "lists the allowed predicates for an unknown predicate".
- [ ] A test named "lists three tools in order with their annotations" asserts the order, the annotation values of `MCP-TOOLS.md`, an output schema on each tool and a description on every input field.
- [ ] A test asserts that the description of `predicate` contains every predicate name of the domain.
- [ ] `pnpm check` passes with no `ANTHROPIC_API_KEY` set and no network call to the LLM provider.

**Validation.** Unit tests with fakes and an in-process client, on every check. `record_fact` runs over stdio in the smoke test (FL-037). `remember` with a real key is run by the owner in FL-038.

**Completion evidence.** The commit, and the passing output of `pnpm check`.

### FL-036: invalidate_fact and get_fact_history tools

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-058, FL-025, FL-032 |
| Requirements | REQ-09, REQ-10 |
| Components | `apps/mcp-server` |

**Objective.** Add the tool that says a fact is wrong or no longer true, and the tool that shows how a fact changed and why. With them the server has the five tools of phase 1.

**Background.** Both tools are specified in [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md). `invalidate_fact` is one tool with a `because` field, because an agent thinks "this fact is no longer right" before it thinks about which time axis is involved ([ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md)). It calls `changeFact` (FL-025). `get_fact_history` calls `getFactHistory` (FL-032). Nothing is deleted by either tool.

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
- [ ] Tests of `invalidate_fact`, with the in-memory store, pass with these names: "corrects a fact and returns the replacement's identifier", "retracts a fact and returns no replacement", "ends a fact at the given date and records the replacement from that date", "ends a fact now when no date is given", "returns already_invalidated with the superseding fact for a fact that was revised", "returns not_found for an unknown fact", "returns invalid_input for a malformed end date".
- [ ] Tests of `get_fact_history` pass with these names: "returns both facts of a succession with the changes of each", "returns each change with its operation, reason code and explanation", "returns the reason given to invalidate_fact as the explanation of the change", "returns a null explanation for a change that names no source", "returns not_found for an unknown fact".
- [ ] A test named "lists the five tools in order with their annotations" asserts the five names in order, the annotation values of the table in `MCP-TOOLS.md` for every tool, an output schema on each, and a description on every input field including the fields of `replacement`.
- [ ] A test asserts that after a correction made through `invalidate_fact`, `recall` with no date returns the replacement and not the wrong fact, and `recall` with a `known_at` date before the correction returns the wrong fact with `invalidated_at` and `superseded_by_fact_id` set.
- [ ] `pnpm check` passes.

**Validation.** Unit tests with fakes and an in-process client, on every check. Both tools run over stdio in the smoke test (FL-037).

**Completion evidence.** The commit, and the passing output of `pnpm check`.

### FL-037: Smoke test over stdio with a restart

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-035, FL-036 |
| Requirements | REQ-11, REQ-12 |
| Components | `apps/mcp-server` |

**Objective.** Prove on every check that the server starts as a host would start it, answers over stdio, runs from one SQLite file with no other service, and keeps memory across a restart.

**Background.** [`TESTING.md`](../../architecture/TESTING.md), "Smoke test", defines it: start the server as a child process on a temporary database, with no API key, list the tools, record a fact with `record_fact`, restart the process, recall the fact, and check that `remember` answers `llm_failed`. Two projects studied in the research did not start on a fresh install because a dependency had moved, so the test runs against exact pinned versions ([ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md), "Consequences"; [competitive analysis](../../research/evaluations/competitive-analysis.md), REQ-CA-07 and REQ-CA-08). The [MCP research](../../research/technical/mcp.md) records the default start-up limit of one host, 10 seconds.

**Outcome.** A broken start, a stray write to standard output, a lost fact after a restart or an unpinned SDK fails `pnpm check`.

**Scope.**
- One test that drives two server processes, one after the other, on the same database file.
- A check that the three SDK dependencies are pinned exactly.

**Non-goals.**
- A fake LLM inside the child process. The composition root has no switch for tests. The test starts the server with no API key, records with `record_fact`, and checks that `remember` answers `llm_failed`. `remember` with a scripted LLM is tested in process in FL-035.
- Two processes writing at the same time. That case is in the storage contract suite (FL-012, FL-014).
- The packed install on a clean machine: FL-003, which reuses this test's steps.
- A real host. The owner does that in FL-038.

**Functional requirements.**
1. The test creates a temporary directory and starts `node` on the server's `main.ts` with `FACTLOOM_DB` in that directory, a `FACTLOOM_NAMESPACE`, and no `ANTHROPIC_API_KEY`.
2. First process: it calls `tools/list` and expects the five tool names in order. It calls `record_fact` with a fact of the software development domain and expects outcome `recorded`. It calls `remember` and expects a tool error that starts with `llm_failed`. It closes standard input and expects exit code 0.
3. Second process, same database: it calls `recall` with a question about the fact and expects the fact's identifier in the result. It calls `get_fact_history` for that identifier and expects one entry with one change whose action is `fact.recorded`. It calls `invalidate_fact` with `because: "was_wrong"` and no replacement, then `recall` again, and expects the fact to be absent.
4. The test asserts that every line either process wrote to standard output parses as a JSON-RPC message.
5. The test asserts that the first process answered `tools/list` within 10 seconds of being started.
6. The temporary directory holds the database file and SQLite's own companion files and nothing else. The test removes it afterwards.

**Technical requirements.**
1. The test uses the pinned MCP client package as a development dependency, or raw JSON-RPC lines as in the proof in the MCP research.
2. The embedder is the real one. Its model cache is shared between runs, so only the first run on a machine downloads the model ([`TESTING.md`](../../architecture/TESTING.md), "Continuous integration").
3. A test reads `apps/mcp-server/package.json` and fails if `@modelcontextprotocol/server`, `@anthropic-ai/sdk` or `@huggingface/transformers` has a version range.
4. The test runs as part of `pnpm check`.

**Constraints.**
- [ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md).
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "Connection settings".
- [`.claude/rules/testing.md`](../../../.claude/rules/testing.md): never skip or weaken a failing test.

**Acceptance criteria.**
- [ ] A test named "the server keeps a recorded fact across a restart" passes and covers requirements 1 to 6.
- [ ] A test named "the SDK dependencies are pinned to exact versions" passes.
- [ ] `pnpm check` passes on Linux and on macOS arm64 in continuous integration (FL-002).
- [ ] Changing one dependency to a range, as a trial, makes the pin test fail. The trial is reverted.

**Validation.** The smoke test and the pin test, on every check, on both platforms of continuous integration.

**Completion evidence.** The commit. The passing output of `pnpm check` locally and the two passing continuous integration runs.

### FL-038: Registration guide for Claude Code and Codex, confirmed on Apple Silicon

| | |
|---|---|
| Status | Pending |
| Phase | 1 |
| Depends on | FL-037 |
| Requirements | REQ-10, REQ-29 |
| Components | `apps/mcp-server` (README), `docs/research` |

**Objective.** Write the exact steps to register the server in Claude Code and in Codex, have the owner run them on an Apple Silicon Mac, and record what happened.

**Background.** The [MCP research](../../research/technical/mcp.md) wrote the registration commands and configuration for both hosts from their documentation and did not run them (open question Q-15). All research ran on Linux x64. The following are unverified on the owner's machine in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md): whether the two native SQLite modules load on macOS arm64 (Q-01), whether macOS refuses to load an installed native file (Q-02), and how the embedding runtime behaves there (Q-23). Continuous integration on macOS arm64 (FL-002) runs the same code on a hosted machine, which is not the owner's Mac and does not involve a host. This work item needs the owner. An agent prepares the guide and the record, and the owner runs the steps.

**Outcome.** A reader can register Factloom in either host by copying from the README. The Apple Silicon question is closed with recorded evidence, or the item is `Blocked` with the exact failure.

**Scope.**
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

The owner runs each step on the Apple Silicon Mac, in order, and records the result in the completion record.

- [ ] `uname -m`, `sw_vers` and `node --version`. Record the three outputs. The first is `arm64`.
- [ ] At the repository root: `pnpm install`, then `pnpm check`. Record pass or fail. A pass means the native SQLite modules loaded and the smoke test ran on this machine.
- [ ] `cd spikes/sqlite-vec-fts5 && npm ci && node spike.mjs`. Record the `platform` line and the last line. Expected: `platform: 'darwin-arm64'` and `SPIKE OK`. This is the check Q-01 names.
- [ ] If any native module fails to load in the two steps above: record the exact message and the output of `xattr` on the file it names, set this work item to `Blocked`, and stop. This is the check Q-02 names.
- [ ] `cd spikes/embedding-retrieval && npm ci && node compare.mjs`, then `du -sh node_modules`. Record the "Size and time" rows for `bge-small-en-v1.5`, the load time of the first run, and the size. This is the check Q-23 names.
- [ ] Claude Code: run the guide's `claude mcp add` command with a namespace made for this test. Start a session, run `/mcp`, and record that the server is connected and lists five tools. Record `claude --version`.
- [ ] In that session, ask the agent to call `record_fact` with subject `repository` named `factloom`, predicate `uses_package_manager`, object `dependency` named `pnpm`. Record the returned outcome and fact identifier. Record how long the call took, since it includes the model download.
- [ ] End the session, start a new one, and ask the agent to call `recall` with the question "Which package manager does this repository use?". Record that the fact is returned.
- [ ] With `ANTHROPIC_API_KEY` set in the registration, ask the agent to call `remember` with the text "We use Vitest for unit tests." Record the returned facts and how long the call took.
- [ ] Codex: run the guide's `codex mcp add` command with the same database and namespace. Start a session, run `/mcp`, and record that the server is connected. Record `codex --version`.
- [ ] In the Codex session, ask the agent to call `recall` with the same question. Record that the fact recorded from Claude Code is returned. Then ask it to call `get_fact_history` for that fact and record the number of entries.
- [ ] The README section carries the confirmation line of requirement 7.
- [ ] Rows Q-01, Q-02, Q-15 and Q-23 of `OPEN-QUESTIONS.md` are closed with the recorded results, and [`mcp.md`](../../research/technical/mcp.md), [`sqlite.md`](../../research/technical/sqlite.md) and [`embeddings.md`](../../research/technical/embeddings.md) say "confirmed" with the date where they said "likely" or "unverified" for these points. A row whose step failed stays open, with the failure recorded.

**Validation.** A run by the owner on the Apple Silicon Mac. No automated test can stand in for the two hosts.

**Completion evidence.** The commit with the README section and the revised research documents. In the commit message or in the closed rows: the outputs recorded in each step above, the two host versions, and the date of the run.
