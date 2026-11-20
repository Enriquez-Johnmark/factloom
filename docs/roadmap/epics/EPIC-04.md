# EPIC-04: Remember

| | |
|---|---|
| Status | Pending |
| Phases | 0-1 |
| Packages | `@factloom/graph-rag`, `apps/mcp-server` |
| Requirements | REQ-13, REQ-14, REQ-19, REQ-26, REQ-30, REQ-31, REQ-36 |

Terms in bold are defined in [`GLOSSARY.md`](../../../GLOSSARY.md).

## Outcome

Factloom can take new information and record it as entities and facts with a **source**. Free text goes through an LLM extraction step. A fact that is already structured is recorded with no LLM call. A report that a stored fact was wrong, or is no longer true, is applied as a **correction**, a **retraction**, a **succession** or a **revision**. Every write path refuses text that contains a recognisable secret, and every write is one commit.

## Scope

- The software development **domain**: its entity types and predicates.
- The Anthropic implementation of `LlmClient`.
- **Entity resolution** by exact name.
- Extraction of facts from text.
- The secret check that refuses a write.
- The three write use cases: `remember`, `recordStructuredFacts` and `changeFact`.
- The run of the extraction cases through `remember` against recorded model output, with the recordings (FL-069).

## Out of scope

- The fact operations `recordFacts`, `invalidateFact`, `endFact` and `findConflictCandidates`: [EPIC-02](EPIC-02.md).
- The SQLite adapter and its enforcement of the **single-value rule**: [EPIC-03](EPIC-03.md).
- The MCP tools that call these use cases: [EPIC-06](EPIC-06.md).
- The record-and-replay wrapper for the LLM client, the extraction cases and the timeline scenarios: [EPIC-07](EPIC-07.md).
- Judging a **conflict** with an LLM and resolving it automatically, and **purge**: [EPIC-08](EPIC-08.md).
- **Entity merge** and detection of duplicate entities: [EPIC-09](EPIC-09.md).

## Boundaries and constraints

- `graph-rag` imports only `@factloom/core` and `zod`. The Anthropic client lives in `apps/mcp-server` and reaches a use case as an argument ([`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md), [ADR 0003](../../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md)).
- A use case changes memory only by calling a fact operation in `core`, and each call of a use case makes at most one commit ([ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md)), except `remember` from phase 2, which commits each succession and correction on its own ([ADR 0022](../../architecture/adr/0022-remember-commits-each-correction-on-its-own.md)).
- Expected failures are `Result` values with a code from the shared list ([ADR 0004](../../architecture/adr/0004-zod-schemas-and-result-values.md)).
- A conflict is keyed by subject and predicate, and only for a **single-valued predicate** ([ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md)).
- The LLM is reached only through the one-method `LlmClient` interface ([ADR 0013](../../architecture/adr/0013-claude-behind-a-one-method-interface.md)).
- The behaviour of the three use cases is specified in the "Use cases" section of [`INTERFACES.md`](../../architecture/INTERFACES.md). Where another document disagrees, `INTERFACES.md` wins.
- The audit log holds no free text. An explanation is the content of a source ([ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md)).

## Dependencies

- [EPIC-02](EPIC-02.md): the types, the `Result` type, the in-memory store and test helpers, and the four phase 1 fact operations.
- [EPIC-07](EPIC-07.md): the extraction cases (FL-029), which exist before extraction is written and are what it is written to pass, and the record-and-replay wrapper (FL-028), which replays the model's responses when the cases are run in FL-069.

## Deliverables

- `softwareDevelopmentDomain`, exported from `@factloom/graph-rag`.
- The Anthropic `LlmClient` in `apps/mcp-server`.
- Internal modules of `graph-rag` for entity resolution, extraction and the secret check.
- The use cases `remember`, `recordStructuredFacts` and `changeFact`, exported from `@factloom/graph-rag`.

## Success criteria

- `pnpm check` passes with the unit tests of every work item below.
- A unit test records a structured fact with a client that fails on any LLM call, and the fact is in memory afterwards (REQ-13).
- A unit test remembers the same statement twice and memory holds one fact with two sources (REQ-14).
- A unit test passes a text that contains a credential to each of the three use cases, and each returns `invalid_input`, makes no commit and makes no LLM call (REQ-19).
- No file in `packages/graph-rag` imports an LLM SDK. The boundary lint of FL-001 passes (REQ-26).
- The extraction cases run through `remember` in replay with no missing recording; every fact a case marks as required is extracted and no forbidden fact is; precision and recall are reported (FL-069).

## Work items

| ID | Title | Phase | Depends on | Status |
|---|---|---|---|---|
| FL-018 | Software development domain: entity types and predicates | 0 | FL-006 | Completed |
| FL-019 | Anthropic LLM client | 1 | FL-006 | Completed |
| FL-020 | Entity resolution by exact name | 1 | FL-007, FL-056 | Completed |
| FL-021 | Extraction of facts from text | 1 | FL-018, FL-029, FL-056 | Completed |
| FL-022 | Secret check that refuses a write | 1 | FL-004 | Completed |
| FL-023 | remember use case, tested with a scripted LLM | 1 | FL-008, FL-011, FL-020, FL-021, FL-022, FL-056 | Completed |
| FL-069 | Extraction replay run and recordings | 1 | FL-023, FL-029, FL-028, FL-019 | Under Review |
| FL-024 | recordStructuredFacts use case | 1 | FL-008, FL-011, FL-020, FL-022, FL-023, FL-056 | Completed |
| FL-025 | changeFact use case | 1 | FL-009, FL-010, FL-020, FL-022, FL-056 | Completed |

### FL-018: Software development domain: entity types and predicates

| | |
|---|---|
| Status | Completed |
| Phase | 0 |
| Depends on | FL-006 |
| Requirements | REQ-31 |
| Components | `@factloom/graph-rag` |

**Objective.** Define the first **domain** as data: the few entity types and predicates that the eleven timeline scenario cases need, with each predicate marked single-valued or multi-valued.

**Background.** A `Domain` is a typed object ([`INTERFACES.md`](../../architecture/INTERFACES.md), "Domain"). The [software development research](../../research/industries/software-development.md) proposed nine entity types and fourteen predicates (sections B and C), several of them keyed by a qualifier. [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md) rejected the qualifier and asks for specific predicates, such as `uses_test_framework`, and for a first domain that "starts with the few predicates its eval scenarios use". [`DECISIONS.md`](../../architecture/DECISIONS.md) lists the larger set as left out. The scenarios are the eleven cases in the table under "Layer B" of [`TESTING.md`](../../architecture/TESTING.md), which draw on section I of the research. The domain is defined from that table, and the scenario files (FL-027 in [EPIC-07](EPIC-07.md)) are then written with its entity types and predicates.

**Outcome.** `softwareDevelopmentDomain` exists and is exported from `@factloom/graph-rag`. Every scenario case can be written as a subject, a predicate and an object using only its entity types and predicates.

**Scope.**
- Four entity types: `repository`, `dependency`, `convention`, `decision`.
- Six predicates:

| Predicate | Subject | Object | Cardinality |
|---|---|---|---|
| `uses_test_framework` | `repository` | a `dependency` entity | single |
| `uses_package_manager` | `repository` | a `dependency` entity | single |
| `deploys_to` | `repository` | a value | single |
| `listens_on_port` | `dependency` | a value | single |
| `follows_convention` | `repository` | a `convention` entity | multi |
| `has_status` | `decision` | a value | single |

- Coverage of the scenario cases:

| Case in `TESTING.md` | Subject, predicate, object |
|---|---|
| Succession | `repository` `uses_test_framework` Jest, then Vitest |
| Correction | `dependency` `listens_on_port` 5433, corrected to 5432 |
| Restatement | `repository` `uses_package_manager` pnpm, stated twice |
| Multi-valued predicate | `repository` `follows_convention`, two conventions |
| Unrelated fact about the same subject | `repository` `uses_test_framework` and `repository` `uses_package_manager` |
| Older fact arriving late | `repository` `deploys_to`, an earlier target learned after the current one |
| A known name mentioned under a different entity type | `repository` `follows_convention` a `convention` entity; a later text names the same thing as a `decision` that is the subject of `has_status`. Entity resolution reuses the `convention` entity, because it is the only one with that name, so the `has_status` fact has it as its subject |
| A date in the text | `repository` `uses_package_manager` with a stated date |
| No date in the text | `repository` `uses_test_framework` with no date |
| A plan | `repository` `deploys_to`, stated as an intention |
| Retraction | `repository` `follows_convention`, withdrawn |

- `correctionPolicy` is `automatic`. Nothing reads it before phase 2 (FL-042).
- `extractionInstructions` holds one interim sentence that tells the model to use only the listed entity types and predicates. FL-021 replaces it.

**Non-goals.**
- The other entity types and predicates of the research (`path`, `symbol`, `command`, `work_item`, `person`, `pins_version`, `located_at` and the rest). Each is added when a scenario or a real use needs it. An entity type for a function or symbol is added by FL-071 in EPIC-09.
- A rule for which entity type a predicate may link. The coverage row above relies on there being none: a `has_status` fact may have a `convention` as its subject. `PredicateDefinition` has no field for it. The expected subject and object are stated in each predicate's `description` only.
- The full extraction instructions: FL-021.
- A separate adapter package. The domain stays in `graph-rag` until phase 4, when it moves to its own adapter package ([`INTERFACES.md`](../../architecture/INTERFACES.md), "Domain"; EPIC-10).
- A predicate for a dependency's version. FL-062 in EPIC-09 adds it when deterministic verification needs it.

**Functional requirements.**
1. The domain's `name` is `software_development`.
2. Each predicate has a `description` of one sentence that names the expected subject, the expected object and gives one example.
3. Entity type names and predicate names are lower-case snake case. FL-021 relies on this, because the LLM API does not guarantee the capitalisation of enumerated values ([LLM research](../../research/technical/llm-anthropic.md), section 3).
4. No two predicates share a name, and no two entity types share a name.

**Technical requirements.**
1. The domain is one immutable object that satisfies the `Domain` schema of FL-006. It has no behaviour.
2. `softwareDevelopmentDomain` is exported from the package's `index.ts`, as [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md) lists.

**Constraints.**
- [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md): specific predicates, no qualifier.
- [`.claude/rules/engineering-principles.md`](../../../.claude/rules/engineering-principles.md): build only what the current phase needs.

**Acceptance criteria.**
- [x] A test named "the software development domain passes the domain schema" parses the object with the `Domain` schema of FL-006 and passes.
- [x] A test named "every scenario case can be expressed with the domain" holds the coverage table above as data. For each row it checks that the subject type and any object entity type are in `entityTypes`, that the predicate is in `predicates`, and that the predicate's cardinality equals the table's. It passes.
- [x] A test asserts the exact list of four entity type names and six predicate names, so that an addition is a visible change.
- [x] A test asserts that every name matches lower-case snake case and that names are unique.
- [x] `pnpm check` passes.

**Validation.** Unit tests in `graph-rag`, run by `pnpm check`. No store, no LLM.

**Completion evidence.** The commit, and the passing output of `pnpm check`.

**Recorded evidence.** Completed on 2026-11-14, in the commit `feat(graph-rag): add the software development domain`. The code is `packages/graph-rag/src/software-development-domain.ts`, with its tests beside it.

`pnpm check`, on Linux x64 with Node.js v22.23.4, ended with:

```text
 Test Files  15 passed (15)
      Tests  166 passed (166)
```

The coverage table is held as data in the test, one row per fact a scenario case needs: thirteen rows for the eleven cases, since two cases need two predicates each. A further test checks that each description is one sentence, contains "for example" and names its predicate.

### FL-019: Anthropic LLM client

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-006 |
| Requirements | REQ-26, REQ-12 |
| Components | `apps/mcp-server` |

**Objective.** Implement `LlmClient` with the Anthropic API: one call that returns an object matching a Zod schema, with the model chosen per task and the instructions cached.

**Background.** [ADR 0013](../../architecture/adr/0013-claude-behind-a-one-method-interface.md) puts Claude behind `LlmClient.generateObject` ([`INTERFACES.md`](../../architecture/INTERFACES.md), "LLM client"). The [LLM research](../../research/technical/llm-anthropic.md) verified on 2026-11-13, by reading the registry and the documentation and by running a call:

- the package `@anthropic-ai/sdk`, its version on that date, and that it releases often, so the version is pinned exactly (section 1);
- structured output through `output_config.format` with the SDK's Zod helper and `messages.parse()`, which checks the response against the original schema on the client (sections 3 and 4);
- that a response with stop reason `refusal` or `max_tokens` may not match the schema (section 3);
- prompt caching with a breakpoint on the system block, the minimum length of a cacheable prefix, and that the schema is part of the cached prefix (sections 4 and 5);
- the current models and the suggestion to start with the smallest current model for every task (section 2 and "Recommendation").

**Outcome.** The composition root can build an `LlmClient` from an API key and a task-to-model map. Extraction (FL-021) and, later, conflict detection and verification call it without knowing the provider.

**Scope.**
- A factory in `apps/mcp-server` that returns an `LlmClient`.
- The mapping of every failure to `llm_failed`.
- A usage report to the caller's logger for each call.
- A package script for one live check, run by hand.

**Non-goals.**
- The Message Batches API. It is a different shape of call and is considered with background verification in FL-051.
- A retry loop of its own. The SDK's own handling of transport errors is left at its default.
- A second provider.
- An environment variable for the model. The map is a typed configuration value with a default. A variable is added when a user needs one.
- Record and replay: FL-028 wraps this client.

**Functional requirements.**
1. `generateObject` sends `instructions` as the system prompt and `input` as the one user message, asks for output in the given schema, and returns `ok` with the parsed object.
2. The model is taken from a map of `LlmTask` to model identifier. The default map names, for all three tasks, the smallest current model that the research recommends. The identifier is copied from section 2 of the research, and the commit cites it.
3. The instructions carry the cache breakpoint. The input comes after it, so a call with the same task, instructions and schema reuses the cached prefix.
4. It returns `llm_failed`, and never throws, when: no API key is configured; the SDK throws; the stop reason is `refusal` or `max_tokens`; the response does not match the schema.
5. With no API key, it returns `llm_failed` without making a request. The message says that no key is configured. Building the client with no key does not fail, because the server must start without one ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Shape of the server").
6. After each call it reports to the logger it was given: the task, the model, the stop reason and the token counts for input, output, cache read and cache write. This is the data open question Q-33 asks for.
7. The API key, the instructions, the input and the output never appear in an error message, in an error's `cause`, or in anything logged.

**Technical requirements.**
1. `@anthropic-ai/sdk` is a dependency of `apps/mcp-server` only, with an exact version and no range. The version is the latest on the registry on the day of implementation, checked with `npm view` and cited in the commit message. The research records the version it verified. The pin test of FL-001 fails if it is a range; this item adds no pin test of its own.
2. The factory takes its dependencies as one argument: the API key or `null`, the model map, the logger, and the SDK call it uses. Tests pass a fake in place of the SDK call. No test in `pnpm check` uses the network or a key.
3. The key is read from `ANTHROPIC_API_KEY` by the composition root and passed in. This module does not read the environment.
4. The maximum number of output tokens is a named constant.
5. A package script `check:llm` in `apps/mcp-server` makes two calls with the same instructions, of a length above the minimum cacheable prefix given in section 5 of the research, and a small schema. It prints the two usage reports to standard error.

**Constraints.**
- [ADR 0013](../../architecture/adr/0013-claude-behind-a-one-method-interface.md) and [ADR 0003](../../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md).
- [ADR 0004](../../architecture/adr/0004-zod-schemas-and-result-values.md): an adapter catches what its library throws.
- [`.claude/rules/git.md`](../../../.claude/rules/git.md): the repository is public, and no secret is committed.

**Acceptance criteria.**
- [x] Unit tests with these names pass: "returns the parsed object when the response matches the schema", "returns llm_failed when the response does not match the schema", "returns llm_failed when the model refuses", "returns llm_failed when the response stops at the token limit", "returns llm_failed when the SDK throws", "returns llm_failed without a request when no key is configured", "uses the model configured for the task", "marks the instructions for caching and sends the input after them".
- [x] A test named "never exposes the API key" builds the client with a marker key, forces each failure above, and asserts that the marker is absent from the full printed form of every returned error, including `cause`, and from everything passed to the logger.
- [x] `pnpm check` passes with no network access and no `ANTHROPIC_API_KEY` set.
- [x] By hand, once: with `ANTHROPIC_API_KEY` set, the owner runs `pnpm run check:llm` from `apps/mcp-server` and records the two usage reports. The second report shows a cache read count above zero.

**Validation.** Unit tests with a fake SDK call, on every check. One live run by hand.

**Completion evidence.** The commit, with the registry check for the SDK version in its message. The passing output of `pnpm check`. The two usage reports from the live run, recorded under Q-33 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md).

**Recorded evidence.** Completed on 2026-11-16, in three commits: `build(mcp-server): add @anthropic-ai/sdk 1.8.0 for the LLM client`, `feat(mcp-server): add the Anthropic LLM client and its live check`, and `docs(research): record the first usage reports under Q-33`. The code is `apps/mcp-server/src/create-anthropic-llm-client.ts`, with its tests beside it, and the live check is `apps/mcp-server/src/check-llm.ts`, run by the package script `check:llm`.

The SDK version. `npm view @anthropic-ai/sdk version` on 2026-11-16 gave 1.8.0, the `latest` dist-tag, published 2026-11-10 and the version the research verified. It is pinned exactly in the catalog and is a dependency of `apps/mcp-server` only; the first commit's message records the check.

What differs from the work item as written:

- **`messages.create`, not `messages.parse`.** The request asks for structured output with `output_config.format` built by the SDK's `zodOutputFormat`, as section 3 of the research describes, but it is sent with `create`. In SDK 1.8.0, `parse` validates inside the SDK and throws on a response it cannot read (`lib/parser.js`), which loses the stop reason and the usage of a refusal or of a response cut off at the token limit. The client therefore checks the stop reason first and then validates the text with the original Zod schema itself, which is the check `parse` makes.
- The default model, `claude-haiku-5-5` for all three tasks, is copied from section 2 of the research and cited in a comment beside the map. The commit message does not cite it, as functional requirement 2 asks; the comment carries the citation instead.
- `MAX_OUTPUT_TOKENS` is 16,000, the value the Claude API guidance for the TypeScript SDK gives as the default for a non-streaming request. The research's own call used 2,000; the bound is far above an extraction response either way.
- Thinking and effort are left at the model's defaults. Choosing them is open questions Q-31 and Q-32.
- The SDK call that the factory takes receives the key with each request, `{ apiKey, params }`, so the factory alone decides that no request is made without a key. The real one, `createAnthropicMessageSender`, creates one SDK client per key on first use.
- The logger is a function that takes a typed report. A call whose SDK request throws has no usage, and nothing is reported for it.
- No error carries a `cause`, and an SDK error is described only by its HTTP status or its class name. The SDK's error messages and the Zod issues are not passed on, because they can quote the request or the model's output: a strict object's error names an unrecognised key.
- Two tests besides the named ones: "returns llm_failed when the response is not JSON" and "reports the task, the model, the stop reason and the token counts of each call".
- The live run was made in the session, with the key the owner supplied for this work, rather than by the owner at their own terminal.

Nine changes, each made by hand and each restored, made a test fail: the thrown error passed on as `cause`, the Zod issues passed on as the message, no check of `refusal`, no check of `max_tokens`, a request sent without a key, one model for every task, no cache breakpoint, no usage report, and the response trusted without the schema. The Zod issues at first failed no test, because Zod 4 does not repeat input values in its messages; the leak test gained a response with an unrecognised key, and the change then failed it.

The live check, `pnpm run check:llm` from `apps/mcp-server` with `ANTHROPIC_API_KEY` set, on 2026-11-16. The second call read the whole cached prefix:

```text
{"task":"extraction","model":"claude-haiku-5-5","stopReason":"end_turn","inputTokens":20,"outputTokens":18,"cacheReadTokens":0,"cacheWriteTokens":2114}
{"task":"extraction","model":"claude-haiku-5-5","stopReason":"end_turn","inputTokens":23,"outputTokens":19,"cacheReadTokens":2114,"cacheWriteTokens":0}
```

With no key set, the same command printed "check:llm failed: No Anthropic API key is configured, so no model can be asked. Set ANTHROPIC_API_KEY." and exited 1 without a request.

Not verified: that `pnpm check` passes with the network cut off. It was run with `ANTHROPIC_API_KEY` unset; no test builds the real SDK call, and every test passes a fake.

`pnpm check`, on Linux x64 with Node.js v22.23.4 and `ANTHROPIC_API_KEY` unset. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 121 files. No fixes applied.
$ biome lint .
Checked 121 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  40 passed (40)
      Tests  565 passed (565)
```

### FL-020: Entity resolution by exact name

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-007, FL-056 |
| Requirements | Supports REQ-13 and REQ-14 |
| Components | `@factloom/graph-rag` (internal) |

**Objective.** Decide, for each entity mentioned in new information, whether it is an entity Factloom already holds, and plan a new entity when it is not.

**Background.** Phase 1 **entity resolution** is an exact match on the normalised name ([`SCHEMA.md`](../../architecture/SCHEMA.md), `entity.name_key`). [`INTERFACES.md`](../../architecture/INTERFACES.md) says a use case "resolves each entity by name, preferring an existing entity of any type when exactly one has that name". [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md) explains why: the same thing extracted with two entity types would become two entities that can hold contradictory facts. The three write use cases all need this step.

**Outcome.** One internal function of `graph-rag` that the use cases call with a list of mentions. It returns an entity identifier for each mention and the list of new entities to create.

**Scope.**
- Resolution of a list of mentions, each a type and a name, in one namespace.
- Planning of new entities, with identifiers from the `newId` dependency.

**Non-goals.**
- Matching by alias, by similar spelling, by embedding or by an LLM: FL-053.
- **Entity merge**: FL-052.
- Checking that a type is in the domain. The use cases do that before they resolve.
- Retrying after `already_exists` from a commit. When another process creates the same entity between the lookup and the commit, the error is returned and calling again succeeds ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Errors").

**Functional requirements.**
1. For each mention, the function reads the entities with that name of every type, with `findEntities` and `type: null`.
2. When exactly one entity has the name, that entity is used, whatever its type.
3. When more than one has the name, the one whose type equals the mention's type is used. When none has that type, a new entity of the mention's type is planned.
4. When none has the name, a new entity is planned with the mention's type and name.
5. A planned entity counts as existing for later mentions in the same call. Two mentions with the same normalised name therefore resolve to one planned entity, by rules 2 to 4.
6. Mentions are processed in the order given, so the result is deterministic.
7. A storage failure is returned as it is. The function makes no write.

**Technical requirements.**
1. The function takes `store` and `newId` as dependencies. It is not exported from the package ([`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): entity resolution is internal).
2. Two names are the same when their normalised forms are equal: lower-cased, trimmed, with runs of white space collapsed ([`SCHEMA.md`](../../architecture/SCHEMA.md)). The function uses `normaliseEntityName`, which `core` exports from FL-007 and which the stores use. It does not write a second copy.
3. The result is plain data: the entity identifier for each mention, in order, and the new entities in the shape of `NewEntity`.

**Constraints.**
- [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md), "Consequences".
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md): nothing is read across namespaces.

**Acceptance criteria.**
- [x] Unit tests with these names pass, using the in-memory store: "reuses the only entity with that name whatever its type", "chooses the entity of the mentioned type when several share the name", "plans a new entity when several share the name and none has the mentioned type", "plans a new entity when no entity has the name", "treats names that differ only in case and spacing as the same", "resolves two mentions of one new name to one planned entity", "does not see an entity in another namespace", "writes nothing".
- [x] The last test asserts that the number of entities in the store is unchanged after the call.
- [x] `pnpm check` passes.

**Validation.** Unit tests in `graph-rag` with `createTestDeps`, on every check.

**Completion evidence.** The commit, and the passing output of `pnpm check`.

**Recorded evidence.** Completed on 2026-11-16, in the commit `feat(graph-rag): add entity resolution by exact name`. The code is `packages/graph-rag/src/resolve-entities.ts`, with its tests beside it. The function is not exported from the package.

Besides the eight named tests, one test covers a storage failure being returned as it is. The test "resolves two mentions of one new name to one planned entity" also covers the same new name mentioned under a second type: the one planned entity is used, by rule 2.

"Writes nothing" counts the entities with `findEntities` for the two names the call mentions, because `MemoryStore` has no method that lists every entity.

With the planned entities left out of the candidates, and with the rule for the only entity removed, each by hand, two tests failed; both were restored.

`pnpm check`, on Linux x64 with Node.js v22.23.4. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 106 files. No fixes applied.
$ biome lint .
Checked 106 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  33 passed (33)
      Tests  468 passed (468)
```

### FL-021: Extraction of facts from text

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-018, FL-029, FL-056 |
| Requirements | REQ-26, REQ-31 |
| Components | `@factloom/graph-rag` (internal) |

**Objective.** Turn a text into structured facts with one LLM call, using the domain's entity types and predicates as closed sets, and with valid time taken from the text.

**Background.** `remember` "asks the LLM for facts using the domain's entity types and predicates, which the extraction schema lists as closed sets" ([`INTERFACES.md`](../../architecture/INTERFACES.md), "Use cases"). The LLM API accepts a subset of JSON Schema. The [LLM research](../../research/technical/llm-anthropic.md), section 3, lists the limits: no recursion, closed objects, no maps, a cap on optional fields and a cap on union-typed fields in one request. [ADR 0013](../../architecture/adr/0013-claude-behind-a-one-method-interface.md) requires the extraction schema to stay inside them. The one test call in the research (section 4) turned "March 2026" into the first day of the month, which is open question Q-29. [`TESTING.md`](../../architecture/TESTING.md) lists three cases that depend on extraction: a date in the text, no date in the text, and a plan.

The extraction cases of FL-029 exist first. Their expected facts are the target the schema and the instructions are written against. The cases, the recordings and the record-and-replay wrapper of FL-028 live in `apps/mcp-server/evals/`, and the cases call the public `remember` use case, so `graph-rag` needs no new export. `remember` is FL-023, which depends on this item, and the run of the cases against recorded model output is FL-069. This item is tested inside `graph-rag` with the scripted LLM of FL-056. It uses neither the Anthropic client (FL-019) nor the wrapper (FL-028).

**Outcome.** An internal function of `graph-rag` that `remember` (FL-023) calls. Given a text, it returns the facts found in it in the shape of `StructuredFactInput`, the same shape `recordStructuredFacts` takes, so the two write paths share everything after this step.

**Scope.**
- The extraction schema, built from a `Domain`.
- The extraction instructions of the software development domain, replacing the interim sentence of FL-018.
- The function that calls `LlmClient.generateObject` with task `extraction` and maps the response.

**Non-goals.**
- Recordings of real model output, and the measured run of the FL-029 cases. Both need `remember` and are made in FL-069.
- A field for the precision of a date. Q-29 stays open. The instructions state one rule for imprecise dates, given below.
- Choosing a stronger model, or tuning effort settings. Q-31 and Q-32 are answered with the extraction cases of FL-029, once they run in FL-069.
- Entity resolution, conflict handling and recording: FL-020 and FL-023.
- Extraction from files, commits or transcripts. Phase 1 takes only text given to `remember`.

**Functional requirements.**
1. Each extracted fact has a subject (entity type and name), a predicate, an object (an entity with type and name, or a value), a **statement** of one sentence that can be read on its own, a **confidence** from 0 to 1, and a start and an end of valid time, each a date or absent.
2. The schema allows only the domain's entity types and predicates. A response that names another fails the schema, and the function returns `llm_failed`.
3. Dates in the response are full UTC timestamps or calendar dates. They are converted with `parseDateInput` from `core`. A date in any other form fails the schema.
4. A fact whose text gives no date has `validFrom: null`.
5. A date stated in the text becomes `validFrom`, or `validTo` for something that stopped. A relative date, such as "last week", is resolved against the reference time, which is `now` from the dependencies and is sent in the input.
6. When the text gives only a month or a year, the date is the first day of that period. The model is told never to give a date that the text does not support.
7. A plan, an intention or a proposal is not returned as a fact.
8. A text with nothing worth remembering returns an empty list, not an error.
9. `llm_failed` from the client is returned as it is.

**Technical requirements.**
1. The extraction schema stays inside the limits in section 3 of the LLM research: no recursive type, no map or record type, every object closed, no optional field (an absent value is `null`), and no more union-typed or nullable fields than the cap given there. It is smaller than the storage schema.
2. The schema contains only names from the domain, never text from memory. The provider caches a schema for a time (same section).
3. The instructions are the stable part of the prompt: the rules above, and the domain's entity types and predicates with their descriptions and cardinality, written in a fixed order. They are byte-identical between calls. The text and the reference time are the `input`.
4. Bounds that the API does not enforce, such as confidence from 0 to 1, are enforced by the Zod schema on the client, which the Anthropic client of FL-019 applies.
5. Unit tests use `createScriptedLlm`. The scripted responses for the four kinds of case named under acceptance criteria are written from the expected facts of the matching FL-029 cases, so the mapping is tested on the shapes the cases expect.
6. The function is not exported from the package. Real model output reaches it only through `remember`, with the wrapper of FL-028 in replay.

**Constraints.**
- [ADR 0013](../../architecture/adr/0013-claude-behind-a-one-method-interface.md), "Consequences".
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): `graph-rag` imports no LLM SDK.
- [`.claude/rules/testing.md`](../../../.claude/rules/testing.md), "Evals": responses are replayed from recordings.

**Acceptance criteria.**
- [x] A test named "the extraction schema stays inside the structured output limits" walks the JSON Schema form of the schema built from `softwareDevelopmentDomain` and asserts: no recursion, no object with open keys, no optional property, and a count of union-typed and nullable properties at or below the cap cited from the research.
- [x] Unit tests with a scripted LLM pass with these names: "maps each extracted fact to a structured fact", "converts a calendar date to the start of that day in UTC", "leaves the start of valid time unknown when the response gives none", "returns an empty list when the model finds nothing", "returns llm_failed when the client fails", "sends the reference time in the input and not in the instructions".
- [x] Unit tests with a scripted LLM pass with these names, each scripted from the expected facts of an FL-029 case of that kind: "takes the date stated in the text as the start of valid time", "gives no start when the text has no date", "returns no fact for a plan", "passes on a date the model resolved from a relative date".
- [x] A test named "the instructions are the same bytes on every call" calls the function twice with different texts and asserts equal `instructions` and different `input`.
- [x] A test named "the instructions name every entity type and predicate of the domain" passes.
- [x] `pnpm check` passes with no network access.

**Validation.** Unit tests in `graph-rag` with a scripted LLM, on every check. The extraction cases of FL-029 against recorded model output are run in FL-069.

**Completion evidence.** The commit. The passing output of `pnpm check`.

**Recorded evidence.** Done on 2026-11-16, in three commits: `build(graph-rag): add zod for the extraction schema`, `feat(graph-rag): extract facts from text with one LLM call`, and `feat(graph-rag): write the extraction guidance of the software development domain`. The function is `extractFacts` in `packages/graph-rag/src/extract-facts.ts`; it is not exported from the package.

`pnpm check`, on Linux x64 with Node.js v22.23.4, run under `unshare -rn` so that the process had no network, exited 0 and ended with:

```text
 Test Files  56 passed (56)
      Tests  680 passed (680)
```

The JSON Schema form of the schema built from `softwareDevelopmentDomain` is 1,547 bytes and has three union-typed or nullable properties (the object, `valid_from` and `valid_to`), against the cap of 16.

Each rule was broken by hand once and a test failed: the reference time left out of the input; `valid_from` mapped from the wrong field; the object's kind mapped the wrong way round; an open object in the schema; an optional field in the schema; the date check removed; the bounds of confidence removed.

Differences from the item:

- `graph-rag` gains `zod` as a dependency, from the workspace catalog. [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md) already allows it.
- `buildExtractionSchema` and `buildExtractionInstructions` are exported from their file, for the tests, and not from the package.
- The shared rules say that when a text says something replaced something else, the replaced fact is also returned, with `valid_to` the date of the change. This is the shape the FL-029 cases expect, where the replaced fact is listed and not required.
- The domain's guidance says which kinds of thing are entities and which are values, so that a port, a deployment target and a status are values, as the predicates' descriptions already say.

### FL-022: Secret check that refuses a write

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-004 |
| Requirements | REQ-19 |
| Components | `@factloom/graph-rag` (internal) |

**Objective.** Refuse any write whose text contains a recognisable credential, before the text is recorded or sent to an LLM, and say which kind of secret was found without repeating it.

**Background.** Factloom invalidates and never deletes, so a secret that is recorded stays on record until a **purge** ([ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md)). The [software development research](../../research/industries/software-development.md), sections 6 and G, recommends checking every text before it is recorded or sent for extraction, starting with a small set of high-precision patterns. The owner approved a check based on patterns that refuses the write in phase 1, with purge (FL-061) for anything that slips through. The review recorded in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md), section C, notes that an entropy check is not needed to start.

**Outcome.** One pure function of `graph-rag`. The three write use cases call it first. A caller that sends a credential gets `invalid_input` with the kind of secret and the field it was found in.

**Scope.**
- A list of patterns, each with a kind.
- The function that checks a list of named fields and returns the first match as an error.

**Non-goals.**
- An entropy check. Commit hashes and content hashes are common in notes about code and would be refused.
- Redaction. The write is refused whole, and the caller removes the secret and tries again.
- Removing a secret that is already recorded: FL-061.
- Recording that a refusal happened. A refusal writes nothing.
- A complete catalogue of credential formats. A pattern is added when a miss is found.

**Functional requirements.**
1. The function takes fields as pairs of a name and a value, checks them in order, and returns `ok` when none matches.
2. On a match it returns `invalid_input`. The message names the kind of secret and the field, and tells the caller to remove it and try again.
3. The message, the error's `cause` and anything logged contain neither the matched text nor any other part of the field's value.
4. The kinds are at least: `private_key` (a PEM private key block), `aws_access_key`, `github_token`, `anthropic_api_key`, `openai_api_key`, `slack_token`, `url_credentials` (a URL with a user name and password), and `credential_assignment` (a name such as `password`, `secret`, `token` or `api_key` assigned a literal value).
5. A `credential_assignment` whose value is a variable reference, such as `$NAME` or `${NAME}`, or a placeholder in angle brackets, is not a match.
6. None of these is a match: a 40-character git commit hash, a UUID, a SHA-256 hash in hexadecimal, and a sentence that names a variable without a value, such as "the key is read from ANTHROPIC_API_KEY".

**Technical requirements.**
1. Each pattern is taken from a cited public source, the provider's documentation or the rule set of an open-source scanner with a compatible licence, with the URL and the access date in a comment beside it. No pattern is written from memory.
2. The function is pure and synchronous. It takes no dependencies and is not exported from the package.
3. Test inputs that look like credentials are assembled at run time from fragments. No file in the repository contains a string that matches a pattern, because the repository is public and hosting services block pushes that contain credential formats (research, finding 6.3).
4. Adding a kind is one entry in the list and one test.

**Constraints.**
- [ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md).
- [`.claude/rules/git.md`](../../../.claude/rules/git.md), "The repository is public".

**Acceptance criteria.**
- [x] For each kind in requirement 4, a test named "refuses a text that contains a <kind>" passes and asserts the code `invalid_input`.
- [x] A test named "names the kind and the field and never repeats the secret" asserts, for every kind, that the full printed form of the error contains the kind and the field name and does not contain the assembled secret or any eight-character slice of it.
- [x] Tests named "accepts a commit hash", "accepts a UUID", "accepts a content hash", "accepts the name of a variable without a value" and "accepts an assignment from a variable reference" pass.
- [x] A command that runs every pattern over the tracked files of the repository reports no match. The command is part of this item's tests.
- [x] `pnpm check` passes.

**Validation.** Unit tests in `graph-rag`, on every check. The use of the check before any LLM call or commit is tested in FL-023, FL-024 and FL-025.

**Completion evidence.** The commit, with the sources of the patterns cited in the code. The passing output of `pnpm check`.

**Recorded evidence.** Completed on 2026-11-16, in the commit `feat(graph-rag): add the secret check that refuses a write`. The code is `packages/graph-rag/src/check-for-secrets.ts`, with its tests beside it. The function, `checkForSecrets`, is not exported from the package. The open question found while writing it is in the commit `docs(research): add Q-83 on Anthropic key formats the secret check misses`.

The patterns come from two rule sets, each cited in the code with its licence, the commit it was read at and the access date: Gitleaks (MIT), for the private key, AWS, GitHub, Anthropic, OpenAI and Slack kinds, and detect-secrets (Apache License 2.0), for `url_credentials` and `credential_assignment`. Gitleaks rules end with a group that is written here as a lookahead, which matches the same texts. Several Gitleaks rules make up one kind: five for `github_token`, eight for `slack_token`.

What differs from the work item as written:

- `credential_assignment` takes the assignment forms that detect-secrets applies to text of unknown file type, which all require a quoted value. An unquoted literal, such as `DB_PASSWORD=` followed by a bare word, is not refused; a provider-prefixed key in that position is still refused by its own kind. The quote-optional forms were tried over the tracked files first and matched ordinary code and prose, such as a variable assigned from a function call.
- detect-secrets allows any word characters after the credential name. Here the name must end with the keyword, so `tokenize = "unicode61"` in the spikes is not refused. A name such as `secretKey` is therefore not a credential name. `token` is added to the detect-secrets names, from the keywords of the Gitleaks rule `generic-api-key`.
- Requirement 5 needs no extra code: the detect-secrets value must start with a word character, so `"$NAME"`, `"${NAME}"` and `"<placeholder>"` are not values.
- The scan of the tracked files skips the agent skills copied from other repositories, the folders that `skills-lock.json` lists. One of them, `typescript-advanced-types`, has an example that assigns a five-letter literal to a password field, which requirement 4 makes a match and the acceptance criterion forbids. The owner chose to skip the copies rather than narrow the pattern. Every other tracked file is scanned, this item's own files and this evidence block included. The scan caught a first draft of this block, which quoted that example.
- The Anthropic pattern accepts any type segment of lower-case letters and digits, where the Gitleaks rules name only `api03` and `admin01`. See the follow-up below.
- Besides the named tests, two more cover requirement 1: "returns ok when no field contains a secret" and "reports the first field that contains a secret".

Five changes, each made by hand and each restored, made a test fail: removing the GitHub pattern (three tests), putting the field's value in the message, removing the word-character lookahead (the variable-reference test and the repository scan), restoring the detect-secrets suffix after the name (the repository scan), and reporting the last matching field instead of the first.

Not run: the patterns against real credentials of each provider. The samples are assembled from fragments in the test, to the shape each rule describes. The scan test runs `git ls-files`, so it was waited for in continuous integration: the workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed: https://github.com/Enriquez-Johnmark/factloom/actions/runs/43793155280.

`pnpm check`, on Linux x64 with Node.js v22.23.4. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 110 files. No fixes applied.
$ biome lint .
Checked 110 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  35 passed (35)
      Tests  496 passed (496)
```

Follow-up on 2026-11-16, in the commit `fix(graph-rag): refuse Anthropic API keys of any type segment`. As first committed, the Anthropic pattern was the Gitleaks one, which names two type segments. The key supplied to the cloud session had a third, so it was not refused; this was found with booleans only, and the key was not printed. It was recorded as Q-83, and the owner confirmed that the key is an API key issued by the Claude Platform. The pattern now accepts any type segment of lower-case letters and digits, and keeps the Gitleaks prefix, length and ending. The test "refuses an Anthropic API key whose type segment the Gitleaks rules do not name" fails when the Gitleaks segments are restored by hand; it was restored. The session's key is now refused, again checked with a boolean only. Q-83 is closed in the commit `docs(research): close Q-83 on Anthropic key formats`.

`pnpm check` after the follow-up, on Linux x64 with Node.js v22.23.4:

```text
$ vitest run
 Test Files  35 passed (35)
      Tests  497 passed (497)
```

### FL-023: remember use case, tested with a scripted LLM

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-008, FL-011, FL-020, FL-021, FL-022, FL-056 |
| Requirements | REQ-14, REQ-19, REQ-26, REQ-30 |
| Components | `@factloom/graph-rag` |

**Objective.** Implement `remember`: extract facts from a text, resolve their entities, sort them into restated, conflicting and new, and record the result in one commit.

**Background.** The signature and the behaviour are in the "Use cases" section of [`INTERFACES.md`](../../architecture/INTERFACES.md). The flow is drawn in [`ARCHITECTURE.md`](../../architecture/ARCHITECTURE.md), "Remember". [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "`remember`", states the two deterministic rules of phase 1: **restatement**, and the **single-value rule** with its two skip reasons. `recordFacts` is all or nothing, so deciding which facts to leave out is this use case's job.

The item was split to fit one session. It keeps the use case and its unit tests with a scripted LLM. The run of the extraction cases through `remember` against recorded model output, and the recordings, are FL-069, because only the owner can make the recordings.

```ts
export declare function remember(
  deps: RememberDeps,
  input: { readonly namespace: Namespace; readonly text: string; readonly source: SourceInput; readonly trigger: Trigger },
): Promise<Result<{ readonly facts: readonly RememberedFact[]; readonly skipped: readonly SkippedFact[] }>>;
```

**Outcome.** An agent's note becomes facts in memory. A fact that was already live gains the new source. A fact that would break the single-value rule is returned as skipped, with the facts in the way, so the caller can decide.

**Scope.**
- The use case, in one file, exported from `@factloom/graph-rag` with its input and output types.
- The sorting rules below, as one internal function of `graph-rag` that compares a fact with its candidates. `recordStructuredFacts` (FL-024) reuses it.

**Non-goals.**
- The run of the extraction cases, the record command and the recordings: FL-069.
- Judging a conflict or resolving it. Phase 2 replaces the skip with the conflict judge and the domain's **correction policy** (FL-041, FL-042).
- Retrying after `conflict` or `already_exists` from the commit.
- Splitting a long text into parts. The length limit is set by the MCP tool (FL-035).

**Functional requirements.**
1. Input is checked first: an empty text or an empty source kind is `invalid_input`.
2. The secret check of FL-022 runs on the text, the source locator and the source version. On a match the use case returns its `invalid_input` and makes no LLM call and no commit.
3. Extraction (FL-021) runs once. If it returns no fact, the result is two empty lists and no commit is made.
4. Entities are resolved with FL-020, for all facts in order.
5. Two extracted facts with the same subject, predicate and object whose valid periods overlap are treated as one. The first is kept.
6. Each fact is then sorted, using `findConflictCandidates` with a fixed limit:
   - **Conflict with a stored fact.** The predicate is single-valued and a candidate has a different object. The fact goes to `skipped` with reason `conflicts_with_stored_fact` and the identifiers of those candidates.
   - **Restated.** Otherwise, a candidate has the same object. The fact is not recorded again. The most recently recorded such candidate gains the source.
   - **Conflict within the text.** Among the facts that remain, two with the same subject and single-valued predicate, different objects and overlapping valid periods are both skipped, with reason `conflicts_within_text` and an empty `conflictingFactIds`.
   - **New.** The rest.
7. Objects are the same when they are the same entity, or values that are equal strings. Valid periods overlap as [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md) defines: a missing bound is open, and periods that only touch do not overlap.
8. A fact whose subject is a new entity has no candidates and needs no lookup.
9. If nothing is new and nothing is restated, no commit is made and the result lists only the skipped facts.
10. Otherwise one call to `recordFacts` writes everything: the source, with the text as its content and `now` as its observed time; the new entities that a recorded fact uses; the new facts; and the source attached to each restated fact. A new entity used only by skipped facts is not created.
11. The change context carries the input's namespace and **trigger**. The reason code is `stated` when at least one fact is new, and `restated` when the call only attaches the source.
12. The result lists each recorded or restated fact with its sources, read after the commit, with outcome `recorded` or `restated`, in the order of extraction.
13. An error from extraction, from a read or from `recordFacts` is returned as it is. A `conflict` from the commit means another process wrote in between. It is returned as an error, not as a skip.

**Technical requirements.**
1. The use case takes its dependencies as its first argument and its input as its second, and returns a `Result`.
2. It calls `recordFacts` at most once and writes in no other way.
3. The limit passed to `findConflictCandidates` is a named constant.
4. The comparison of requirements 6 and 7 is one internal function with its own unit tests: given a fact and its candidates, it returns whether the fact conflicts, restates a candidate, or is new. It is not exported from the package.

**Constraints.**
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md): one commit.
- [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md): what a conflict is.
- [`.claude/rules/architecture.md`](../../../.claude/rules/architecture.md): one use case per file, writes go through one door.

**Acceptance criteria.**
- [x] Unit tests pass with these names, using `createTestDeps` and a scripted LLM: "records a new fact with the text as its source", "attaches the source to a live fact that is stated again and records no second fact", "skips a fact that conflicts with a stored fact and names the fact in the way", "skips both facts when two facts in one text conflict with each other", "records both values of a multi-valued predicate", "does not skip an unrelated fact about the same subject", "records an older fact whose valid period ends before the current one starts", "records one fact when the text states it twice", "returns two empty lists and writes nothing when nothing is extracted", "writes nothing when every fact is skipped", "creates no entity that only a skipped fact uses", "reuses an existing entity of another type when it is the only one with that name".
- [x] A test named "writes everything in one commit" remembers a text with one new fact and one restated fact and asserts that every audit entry written by the call shares one operation identifier.
- [x] A test named "refuses a text that contains a secret before calling the LLM" passes a client that fails on any call, and asserts `invalid_input` and an unchanged store.
- [x] A test named "returns llm_failed and writes nothing when extraction fails" passes.
- [x] Unit tests of the comparison function pass with these names: "a different object under a single-valued predicate conflicts", "the same entity or an equal value restates", "a period that only touches does not overlap".
- [x] `pnpm check` passes with no network access and no API key.

**Validation.** Unit tests in `graph-rag` with the in-memory store and a scripted LLM, on every check. The extraction cases of FL-029 run through this use case in FL-069, and the timeline scenarios in FL-039.

**Completion evidence.** The commit, and the passing output of `pnpm check`.

**Recorded evidence.** Done on 2026-11-16, in two commits: `feat(graph-rag): compare a new fact with its conflict candidates` and `feat(graph-rag): add the remember use case`. `remember` is exported from `@factloom/graph-rag` with `RememberDeps`, `RememberInput`, `RememberResult`, `RememberedFact`, `SkippedFact` and `SourceInput`.

`pnpm check`, on Linux x64 with Node.js v22.23.4, run under `unshare -rn` so that the process had no network, and with no API key in its environment, exited 0 and ended with:

```text
 Test Files  58 passed (58)
      Tests  705 passed (705)
```

Each rule was broken by hand once and a test failed: the single-valued check of the comparison; its overlap check; the removal of repeats; the skip of conflicts within the text; the secret check; the reason code; and giving every draft all the new entities, which created an entity that only a skipped fact used. Removing the shortcut of functional requirement 8, no lookup for a new subject, failed no test: it saves a read and changes no outcome, and the testing rules forbid asserting on which store methods are called.

Differences from the item:

- `CONFLICT_CANDIDATE_LIMIT` is 50.
- `SourceInput` is in its own file, `source-input.ts`, because `recordStructuredFacts` (FL-024) takes it too.
- When two extracted facts restate the same stored fact, the source is attached once and the fact is listed once.
- The test "creates no entity that only a skipped fact uses" records one fact and skips another in the same call, so that a commit is made and could create the skipped fact's entity.
- Extra tests: the reason codes and trigger in the audit log, a secret in the source locator, an empty text or source kind, and four more cases of the comparison function.

### FL-069: Extraction replay run and recordings

| | |
|---|---|
| Status | Under Review |
| Phase | 1 |
| Depends on | FL-023, FL-029, FL-028, FL-019 |
| Requirements | REQ-26, REQ-30 |
| Components | `apps/mcp-server` (evals), exercising `@factloom/graph-rag` |

**Objective.** Run every extraction case of FL-029 through the `remember` use case against recorded model output, decide pass or fail per case, and report precision and recall. Make the recordings once with a real model.

**Background.** This item is the second part of FL-023, split off because one step needs the owner. [`TESTING.md`](../../architecture/TESTING.md), "Layer C" and "Keeping it deterministic", says that LLM calls in the evals go through a recording wrapper, that the first run records and every later run replays, and that a replayed run fails if a recording is missing. The wrapper is FL-028, the cases and the scorer are FL-029, the Anthropic client is FL-019, and `remember` is FL-023. Extraction precision and recall are reported, with no target ([`TESTING.md`](../../architecture/TESTING.md), "What is measured"). A pass or fail per case is still needed, so that a change to the extraction instructions that drops a fact a case exists for fails the check.

A recording can only be made with a real API key, and only the owner holds one. Until the recordings exist the replay run fails, so nothing of this item can be committed before the owner's step. This item is therefore done in a session with the owner present: the agent writes the code and its unit tests, the owner makes the recordings in the same working tree, and the code and the recordings are committed together once `pnpm check` passes.

**Outcome.** `pnpm check` runs the extraction cases through `remember` from recordings, with no network and no API key, and prints a pass or fail per case and precision and recall for the set. A changed extraction prompt shows up as missing recordings, and the new recordings show up in the diff.

**Scope.**
- In `apps/mcp-server/evals/`: the function that runs one extraction case through `remember` on empty memory and returns the facts recorded. It is the function that the run function of FL-029 takes as an argument.
- The rule that decides whether a case passes.
- A record command, a package script of `apps/mcp-server`, that builds the Anthropic client of FL-019, wraps it with the wrapper of FL-028 in record mode, and runs every case.
- The test, run by `pnpm check`, that runs every case in replay and prints the report.
- The recordings, one directory for the extraction cases.

**Non-goals.**
- Changing the cases or the scorer: FL-029. A case found wrong is corrected there, in its own commit, and reviewed again by the owner.
- A target for precision or recall.
- Repeated live runs to measure how much the model varies. A live run is made by hand when wanted.
- Recordings for the timeline scenarios: FL-039, which reuses the record command.
- Changing the extraction instructions to make a case pass. That is a change to FL-021's code in its own commit, followed by new recordings.

**Functional requirements.**
1. Each case runs on a new in-memory store with the clock fixed at the case's `observed_at`, counting identifiers, the fake embedder of `core`, and the software development domain. The text is sent through `remember` with the trigger `agent` and a source of kind `agent_note`. The facts recorded are read back and given to the scorer of FL-029.
2. In replay mode, which is the only mode inside `pnpm check`, the LLM is the wrapper of FL-028 over no inner client. A missing recording throws and names the case and the command that records, as FL-028 specifies.
3. A case passes when every expected fact it marks as required is matched, and no fact it lists under `forbidden` is extracted. A case with no required fact passes when it has no forbidden fact extracted and `remember` returns no failure. A `remember` failure fails the case.
4. The report prints, per case, pass or fail and the scorer's counts, and for the set the number of cases passed, precision and recall. Precision and recall do not decide pass or fail.
5. The record command runs only when `ANTHROPIC_API_KEY` is set, and otherwise exits non-zero with a message that names the variable. It writes one recording per LLM call and prints the usage report of FL-019 for each call.

**Technical requirements.**
1. The evals import `remember` and `softwareDevelopmentDomain` from `@factloom/graph-rag` and the helpers of `@factloom/core` by package name. Nothing in `apps/mcp-server/src` imports from `evals/`.
2. The model label given to the wrapper is the model that the default task map of FL-019 names for `extraction`, read from that map, not written a second time.
3. The record command is not part of `pnpm check`. `pnpm check` sets no API key and makes no network call.
4. The pass rule of requirement 3 is a pure function with its own unit tests.

**Constraints.**
- [`TESTING.md`](../../architecture/TESTING.md), "Layer C", "Keeping it deterministic" and "What is measured".
- [Testing rules](../../../.claude/rules/testing.md), "Evals": a missing recording fails the run; re-record deliberately and review the diff.
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): the app is the one place that imports the use cases and the LLM client together.
- [Git rules](../../../.claude/rules/git.md): recordings are checked for secrets before they are pushed.

**Acceptance criteria.**
- [x] Unit tests of the pass rule pass with these names: "passes a case when every required fact is matched", "fails a case when a required fact is missing", "fails a case when a forbidden fact is extracted", "fails a case when remember fails".
- [x] Unit test "the record command refuses to run without an API key" passes.
- [ ] By hand, once, by the owner in the session: with `ANTHROPIC_API_KEY` set in the environment and nowhere else, the owner runs the record command from `apps/mcp-server` (`pnpm run record:extraction`). It ends with exit code 0. The owner reads the diff of the new recordings for secrets, records the model identifier and the token counts from the usage reports, and confirms that a call after the first shows a cache read count above zero.
- [x] With the recordings in place and no API key set, `pnpm check` exits 0. Its output holds the report, with every case passing and with precision and recall printed.
- [x] With one recording removed in a local run, `pnpm check` exits non-zero and names the missing recording. The output is recorded and the file restored.
- [x] Two runs of `pnpm test` in a row print the same report, byte for byte.
- [x] `git grep -n "API_KEY" -- apps/mcp-server/evals` shows no line that holds a key's value.

**Validation.** Eval: the extraction cases in replay, inside `pnpm check`. Unit tests of the pass rule and of the record command's refusal. One recording run by the owner, by hand.

**Completion evidence.** One commit that holds the code and the recordings, the passing `pnpm check` output with the report, the model the recordings were made with, the token counts from the recording run, and the output of the run with a recording removed. Q-31 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) is updated with the first precision and recall, labelled as one run of one model. The item is not `Completed`, and not committed, before the owner's recording step.

**Recorded evidence.** Done on 2026-11-16 while the owner was away, under the owner's standing instruction to use the key in `OWNER_ANTHROPIC_API_KEY` and to take the recommended option at each step. The item is `Under Review` until the owner confirms the recording step below, which the item assigns to the owner.

Commits, in order: `fix(graph-rag): date no change from the time a text was written`, which by mistake also holds the code of this item (the eval run function, the pass rule, the report, the record command and the replay test) because they were staged when it was made; and `test(mcp-server): add the extraction recordings and run the cases in replay`, which adds the 20 recordings and names the case in a missing-recording error. The first of the two does not pass `pnpm check` on its own, because the replay test has no recordings yet; the two were pushed together. History was not rewritten.

The recording run. The record command ran once from `apps/mcp-server` with `ANTHROPIC_API_KEY` set for that command only, from `OWNER_ANTHROPIC_API_KEY`, and exited 0. Model `claude-haiku-5-5`, 20 calls, every stop reason `end_turn`. Tokens over the 20 calls: 1,272 input, 5,021 output, 2,090 written to the cache by the first call, and 39,710 read from the cache; the second call read 2,090 cached tokens. The 20 recordings were read for secrets: each holds only `task`, `model`, `instructions`, `input` and `response`, and none holds a key, a header, a token or a path of the machine.

A first recording run, with the instructions of FL-021 as written, passed 18 of 20 cases (precision 0.957, recall 0.880). The two commit-message cases failed: the model dated the port change at the commit's own time because the message says "now", and it returned the replaced Jest fact without an end, so `remember` skipped both facts as a conflict within the text. Two rules were added to the instructions in their own commit, as the non-goals allow: "now", "currently" and the time a text was written fix no date; and a replaced fact is returned only when the text states or fixes the date of the change. The recordings of the first run were not kept. The run above is the second.

`pnpm check`, on Linux x64 with Node.js v22.23.4, under `unshare -rn` with no network and no API key, exited 0 and printed:

```text
Cases passed: 20 of 20.
Facts: expected 25, extracted 24, matched 24; forbidden extracted 0; type differences 1.
Precision 1.000, recall 0.960.
 Test Files  67 passed (67)
      Tests  761 passed (761)
```

Vitest 5.1.0 hides the output of passing tests when it detects an AI agent through the variables `CLAUDECODE` and `AI_AGENT`. The runs recorded here unset both, as a person's terminal and continuous integration do not set them.

Two runs of `pnpm test` in a row printed the same report, byte for byte (`cmp` of the two reports).

With the recording `0951770826e29c5c0fa8dddc403c95cad50ddfc8a16b89b16273b31135256839.json` moved aside, `pnpm check` exited 1 with:

```text
Case "An end stated in the text: shop-api left Heroku": No recording for the key 0951770826e29c5c0fa8dddc403c95cad50ddfc8a16b89b16273b31135256839. Expected the file apps/mcp-server/evals/recordings/extraction/0951770826e29c5c0fa8dddc403c95cad50ddfc8a16b89b16273b31135256839.json. Record it with: pnpm --filter @factloom/mcp-server run record:extraction
```

The file was restored, byte for byte.

`git grep -n "API_KEY" -- apps/mcp-server/evals` shows nothing.

The pass rule was broken by hand three ways, and a test failed each time: forbidden facts ignored, a failure of `remember` passed, and required facts ignored.

Differences from the item:

- The record command (`src/record-extraction.ts`) and the replay test (`src/extraction-replay.test.ts`) are in `src`, and import from `evals/`. Technical requirement 1 says nothing in `src` imports from `evals/`, but the boundary lint refuses an import of `src` from `evals/`, and both need the task map of the Anthropic client (technical requirement 2). This follows the precedent of FL-033, recorded in EPIC-05. `main.ts` loads neither.
- The scorer of FL-029 exports `matchesCaseFact`, its existing match rule, so that the pass rule decides with the same rule. Nothing else of the scorer changed.
- The recordings are in `apps/mcp-server/evals/recordings/extraction/`.

For the owner's review:

- Confirm the recording step, which the item gives to the owner: the model, the token counts and the cache reads above, and the diff of the recordings.
- In `commit-message.yaml` the expected facts conflict with each other under the single-value rule: Vitest with no start and no end, and Jest with no start and an end at the commit's time, overlap. If both were extracted, `remember` would skip both. The case passes now because Jest is not required and the model, under the new rule, returns only Vitest. A change to the case is FL-029's, in its own commit, with a new review; none was made.

### FL-024: recordStructuredFacts use case

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-008, FL-011, FL-020, FL-022, FL-023, FL-056 |
| Requirements | REQ-13, REQ-14, REQ-19, REQ-36 |
| Components | `@factloom/graph-rag` |

**Objective.** Implement `recordStructuredFacts`: record facts that a caller already gives as subject, predicate and object, with no LLM call.

**Background.** The signature and the behaviour are in the "Use cases" section of [`INTERFACES.md`](../../architecture/INTERFACES.md): it "applies the same restatement rule, and returns `conflict` instead of skipping". It serves the `record_fact` tool ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md)), which needs no API key, and it is requirement REQ-CA-10 of the [competitive analysis](../../research/evaluations/competitive-analysis.md).

```ts
export declare function recordStructuredFacts(
  deps: OperationDeps,
  input: { readonly namespace: Namespace; readonly facts: readonly StructuredFactInput[]; readonly source: SourceInput; readonly trigger: Trigger },
): Promise<Result<{ readonly facts: readonly RememberedFact[] }>>;
```

**Outcome.** A caller that knows the fact records it directly. The call works with no LLM configured.

**Scope.**
- The use case, in one file, exported with its input and output types.

**Non-goals.**
- Skipping a conflicting fact. The whole call fails with `conflict`.
- Any LLM call. The dependency type has no `LlmClient`.

**Functional requirements.**
1. Input is checked first. Each of these is `invalid_input`: an empty list of facts; an entity type or a predicate that the domain does not have, with the allowed values listed in the message; a confidence outside 0 to 1; a valid period whose end is not after its start; the same subject, predicate and object given twice with overlapping valid periods.
2. The secret check of FL-022 runs on every statement, entity name and object value, and on the source locator and version.
3. Entities are resolved with FL-020. The type check of requirement 1 comes first, because resolution may reuse an existing entity of another type.
4. For each fact, `findConflictCandidates` is called. For a single-valued predicate, a candidate with a different object makes the whole call fail with `conflict`, with those candidates in `relatedFactIds`. Otherwise a candidate with the same object makes the fact a **restatement**. The comparison is the internal function that FL-023 writes; this item reuses it and does not write a second one.
5. Two facts in the call that conflict with each other make the call fail with `conflict` and an empty `relatedFactIds`.
6. One call to `recordFacts` writes the source, the new entities, the new facts and the source attached to each restated fact. The source has no content: the statement is on the fact.
7. The change context and the reason code follow the rule of FL-023: `stated` when at least one fact is new, `restated` when the call only attaches the source.
8. The result lists one fact per input fact, in order, with its sources and outcome `recorded` or `restated`.
9. Any other error is returned as it is, and nothing is written.

**Technical requirements.**
1. Dependencies first, input second, a `Result` returned.
2. `recordFacts` is called at most once.

**Constraints.**
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md) and [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md).
- [`.claude/rules/architecture.md`](../../../.claude/rules/architecture.md).

**Acceptance criteria.**
- [x] Unit tests pass with these names: "records a structured fact and creates its entities", "attaches the source to a live fact that is given again", "returns conflict and names the stored fact when a single-valued predicate already has another value", "records nothing when one of several facts conflicts", "returns conflict when two facts in one call conflict with each other", "returns invalid_input and lists the allowed predicates for an unknown predicate", "returns invalid_input and lists the allowed entity types for an unknown entity type", "returns invalid_input when the same fact is given twice", "refuses a statement that contains a secret and writes nothing", "writes everything in one commit".
- [x] Every test above runs with a client that fails on any LLM call.
- [x] `pnpm check` passes.

**Validation.** Unit tests in `graph-rag` with the in-memory store, on every check.

**Completion evidence.** The commit, and the passing output of `pnpm check`.

**Recorded evidence.** Done on 2026-11-16, in two commits: `refactor(graph-rag): share fact planning and comparison between use cases`, which moves the planning, the comparison with memory and the read after the commit out of `remember` so that both use cases call them, and `feat(graph-rag): add the recordStructuredFacts use case`. `recordStructuredFacts` is exported from `@factloom/graph-rag` with `RecordStructuredFactsInput`.

`pnpm check`, on Linux x64 with Node.js v22.23.4, run under `unshare -rn` with no network and no API key, exited 0 and ended with:

```text
 Test Files  59 passed (59)
      Tests  719 passed (719)
```

Every test uses `createTestDeps`, whose scripted LLM has no responses and throws on any call. The dependency type of the use case, `OperationDeps`, has no `LlmClient`.

Each rule was broken by hand once and a test failed: the entity type check before resolution, the check for a fact given twice, the secret check, the check for two given facts that conflict, and the reason code. Removing the use case's own check for a conflict with a stored fact failed no test: the store's commit enforces the single-value rule and returns the same `conflict` with the same stored fact, so the check gives an earlier and clearer message, not a different outcome.

Differences from the item:

- An empty source kind is `invalid_input`, as in `remember`.
- Extra tests: both values of a multi-valued predicate; a confidence outside 0 to 1, a period that ends before it starts and an empty list; an unknown entity type when an entity of that name already exists, which resolution would otherwise reuse; and the reason code `restated`.

### FL-025: changeFact use case

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-009, FL-010, FL-020, FL-022, FL-056 |
| Requirements | Supports REQ-06 and REQ-08; REQ-19 |
| Components | `@factloom/graph-rag` |

**Objective.** Implement `changeFact`: apply a report that a fact was wrong, or is no longer true, with an optional fact to take its place, in one commit.

**Background.** The signature and the behaviour are in the "Use cases" section of [`INTERFACES.md`](../../architecture/INTERFACES.md): it "resolves the replacement's entities, then calls `invalidateFact` for `was_wrong` or `endFact` for `no_longer_true`. It is one commit either way." The four outcomes are in the table under "`invalidate_fact`" in [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md). The reporter's words are stored as the content of a source, never in the audit log ([ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md)).

```ts
export declare function changeFact(
  deps: OperationDeps,
  input: {
    readonly namespace: Namespace;
    readonly factId: FactId;
    readonly because: 'was_wrong' | 'no_longer_true';
    readonly endedAt: Timestamp | null;
    readonly explanation: string;
    readonly replacement: StructuredFactInput | null;
    readonly trigger: Trigger;
  },
): Promise<Result<{ readonly invalidatedFactId: FactId; readonly replacement: FactWithSources | null }>>;
```

**Outcome.** One use case behind the `invalidate_fact` tool covers **correction**, **retraction**, **succession** and a **revision** that ends a fact.

**Scope.**
- The use case, in one file, exported with its input and output types.

**Non-goals.**
- Changing the start of a fact's valid time, or the date of a past succession: `reviseValidTime`, FL-044.
- Deciding by itself whether a fact was wrong or has ended. The caller says which.
- The rules of `invalidateFact` and `endFact` themselves: FL-009 and FL-010.

**Functional requirements.**
1. Input is checked first. Each of these is `invalid_input`: an empty explanation; `endedAt` given with `was_wrong`; a replacement whose entity type or predicate the domain does not have, with the allowed values listed; a replacement with a confidence outside 0 to 1.
2. The secret check of FL-022 runs on the explanation and on the replacement's statement, entity names and object value.
3. The replacement's entities are resolved with FL-020, after the type check.
4. The explanation becomes a new source of kind `agent_note`, with the explanation as its content and `now` as its observed time.
5. With `was_wrong`, the use case calls `invalidateFact` with reason code `reported_wrong`. With a replacement it is a correction. Without one it is a retraction.
6. A replacement for a wrong fact that gives no valid period takes the valid period of the fact it corrects. `invalidateFact` applies this rule. The use case passes the replacement's dates through unchanged.
7. With `no_longer_true`, the use case calls `endFact` with reason code `reported_ended` and `validTo` equal to `endedAt`, or to `now` when `endedAt` is `null`. With a replacement it is a succession, and a replacement that gives no start begins at that moment. Without one it is a revision that ends the fact.
8. The result gives the identifier of the fact that was invalidated, which is the input's `factId`, and the replacement with its sources, read after the commit, or `null`.
9. Errors from the operation are returned as they are: `not_found`, `already_invalidated` with the superseding fact in `relatedFactIds`, `conflict`, `already_exists`, `embedding_failed` and `storage_failed`.

**Technical requirements.**
1. Dependencies first, input second, a `Result` returned.
2. Exactly one of `invalidateFact` and `endFact` is called, once.

**Constraints.**
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): a fact changes only by being invalidated.
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md) and [ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md).
- [`.claude/rules/architecture.md`](../../../.claude/rules/architecture.md).

**Acceptance criteria.**
- [x] Unit tests pass with these names: "corrects a wrong fact and links it to the replacement", "gives the correction the valid period of the fact it corrects when none is given", "keeps the valid period a correction gives", "retracts a wrong fact when no replacement is given", "ends a fact at the given moment and records its successor from that moment", "ends a fact now when no moment is given", "ends a fact with no successor", "stores the explanation as the content of a source and not in the audit log", "returns already_invalidated with the superseding fact when the fact is no longer live", "returns not_found for a fact in another namespace", "returns conflict when the replacement overlaps another live fact", "returns invalid_input when an end is given for a wrong fact", "refuses an explanation that contains a secret and writes nothing".
- [x] The test about the explanation asserts that the audit entries of the call carry the reason code and the source identifier, and that no audit entry contains the explanation.
- [x] A test named "makes one commit either way" asserts, for a correction and for a succession, that every audit entry written by the call shares one operation identifier.
- [x] A test asserts that the number of fact rows never falls: after each call above, every fact that existed before still exists.
- [x] `pnpm check` passes.

**Validation.** Unit tests in `graph-rag` with the in-memory store and a fixed clock, on every check.

**Completion evidence.** The commit, and the passing output of `pnpm check`.

**Recorded evidence.** Completed on 2026-11-16, in the commit `feat(graph-rag): add the changeFact use case`. The code is `packages/graph-rag/src/change-fact.ts`, with its tests beside it. `changeFact` is exported from `@factloom/graph-rag` with the type `ChangeFactInput`, and with `StructuredFactInput`, which this item is the first to need. It is in its own file, `structured-fact-input.ts`, because `remember` (FL-023) and `recordStructuredFacts` (FL-024) take it too.

What differs from the work item as written:

- Of the checks in functional requirement 1, the use case makes three itself: an empty explanation (empty after trimming white space), an end given for a wrong fact, and an entity type the domain does not have. The type check comes before resolution, because resolution may reuse an existing entity of another type, which the fact operation cannot then see. An unknown predicate and a confidence outside 0 to 1 are refused with `invalid_input` by the fact operation itself (`prepareFactDrafts`, shared by the fact operations since FL-009), whose message lists the domain's predicates and entity types. A first version checked both in the use case as well; removing each by hand failed no test, so the copies were removed. The tests for both cases still pass.
- The function that resolves the replacement's entities and builds its draft is in `change-fact.ts`. FL-024 needs the same step and can move it to its own file then; today it has one use.
- The test that fact rows never fall is "never removes a fact row": it applies a correction, a retraction, a succession and a revision in turn, and after each asserts that every fact that existed before still exists. The other tests do not repeat that assertion.
- "ends a fact now when no moment is given" gives a successor, so it also shows that a successor with no start begins now.
- `MemoryStore` cannot list every audit entry, so the tests collect the audit entries of every fact, entity and source that the facts reach, and of every source an entry names.
- Technical requirement 2, one fact operation called once, is not asserted on calls, which the testing rules forbid. "makes one commit either way" shows it through the one operation identifier.
- Four tests besides the named ones: "never removes a fact row", "returns invalid_input for an empty explanation, an unknown type or predicate, or a confidence outside 0 to 1", "lists the allowed values when a type or predicate is unknown", and "refuses a replacement that contains a secret".

Ten changes, each made by hand and each restored, made a test fail: no secret check, the secret check on the explanation only, an end accepted for a wrong fact, an empty explanation accepted, the entity type check skipped, the wrong reason code, the end always at now, a report that a fact is no longer true treated as wrong, the explanation not kept, and the replacement not read back after the commit.

Not run: the use case against the SQLite store, and the `invalidate_fact` tool that calls it (FL-036).

`pnpm check`, on Linux x64 with Node.js v22.23.4. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 117 files. No fixes applied.
$ biome lint .
Checked 117 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  38 passed (38)
      Tests  553 passed (553)
```
