# EPIC-07: Evaluation

| | |
|---|---|
| Status | Pending |
| Phases | 0-2 |
| Packages | `apps/mcp-server` (the directory `evals/`), exercising `packages/graph-rag`, `packages/core` and `packages/storage` |
| Requirements | REQ-30, REQ-35, REQ-37, REQ-38 |

Nothing in this epic is implemented. Terms are used as defined in [`GLOSSARY.md`](../../../GLOSSARY.md).

## Outcome

Factloom can show, on every check and with no network, that memory ends in the right state after a realistic sequence of inputs. The "fact changed over time" cases exist as reviewed data before the code they judge, LLM responses are replayed from recordings so a run is deterministic, and the scenario runner reports the numbers that phase 2 is measured by: staleness rate, false invalidation rate and missed invalidation rate. A benchmark measures how long `recall`, `record_fact` and server start take, and enforces the budgets of REQ-35.

## Scope

- The timeline scenarios of Layer B as data files, with a schema that validates them ([`TESTING.md`](../../architecture/TESTING.md), "Layer B").
- A record-and-replay wrapper around `LlmClient` (`TESTING.md`, "Keeping it deterministic").
- The extraction cases of Layer C, with a scorer that reports precision and recall.
- The scenario runner, which sends each scenario through the use cases and asserts on memory.
- The performance benchmark and the budgets it enforces.
- The place of all of this in the repository: `apps/mcp-server/evals/`, as [`TESTING.md`](../../architecture/TESTING.md), "Layer B", states. It holds the scenario files, the extraction cases, the recordings, the record-and-replay wrapper, the scenario runner, the retrieval eval and the benchmark. There is no workspace member for evals and no new package.

## Out of scope

- Layer A, the time-semantics cases with no LLM. They are the storage contract suite: FL-012 in [EPIC-03](EPIC-03.md).
- The retrieval eval and the lane weights chosen with it: FL-033 and FL-057 in EPIC-05. They live in the same directory but measure something else, with the real embedder and no LLM.
- The smoke test over stdio: FL-037 in EPIC-06.
- The conflict judge, and making the succession and correction scenarios pass through `remember`: FL-041 and FL-042 in EPIC-08. This epic supplies the measurement; EPIC-08 moves the numbers.
- An LLM-judge harness, public benchmark runs, comparisons against other memory products, and coverage targets. `TESTING.md`, "Not planned", gives the reasons.

## Boundaries and constraints

- **A scenario asserts on memory, not on a ranked answer.** An `ask` reads with `MemoryStore.listFacts`; a `history` reads with the `getFactHistory` use case. Neither goes through `recall`. Values are normalised and compared exactly, and no LLM judges an answer ([`TESTING.md`](../../architecture/TESTING.md), "Layer B"; [testing rules](../../../.claude/rules/testing.md), "Evals").
- **Inputs go through the same use cases the MCP server calls.** The runner does not write to a store directly.
- **Replay by default.** A missing recording fails the run. Recording again is a deliberate act, and its changes are reviewed in the diff.
- **Fixed clock and counting identifiers**, taken from the dependencies ([ADR 0003](../../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md)). No eval reads the real time.
- **Evals live in the app.** `apps/mcp-server` is the composition root, and so the one place that may import the storage adapter, the use cases and the LLM and embedding implementations together ([`TESTING.md`](../../architecture/TESTING.md), "Layer B"; [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md)). An app exports nothing, so no package can import an eval, and an eval reaches a package only through its `index.ts`. `core` stays free of file access and of a test framework.
- **Conflicts are keyed by subject and predicate** ([ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md)). The "unrelated fact about the same subject" scenario exists to guard that key.
- **The repository is public** ([git rules](../../../.claude/rules/git.md)). Scenario texts and recordings are invented, hold no real project's data and no secret, and an API key is never written to a recording.

## Dependencies

- [EPIC-01](EPIC-01.md): the app `apps/mcp-server`, which FL-001 creates and in which the evals directory lives; the `pnpm eval` command (FL-001) and its workflow job (FL-002), in which the benchmark runs.
- [EPIC-02](EPIC-02.md): the types, the `LlmClient` interface and timestamps (FL-006).
- EPIC-04: the software development domain (FL-018), whose entity types and predicates the data files use, the use cases `remember` (FL-023) and `changeFact` (FL-025), which the runner calls, and the record command of FL-069, which the runner reuses.
- EPIC-05: `getFactHistory` (FL-032), which the runner uses for `history` assertions.
- [EPIC-03](EPIC-03.md): the SQLite adapter with its structural reads (FL-015), on which the runner runs.
- EPIC-06: the `recall` tool (FL-058) and the `record_fact` tool (FL-035), which the benchmark measures.

EPIC-08 depends on this epic: FL-041 and FL-042 are measured with the scenario data and the runner. EPIC-04 depends on it too: extraction (FL-021) is written against the extraction cases, and their run in replay (FL-069) uses the wrapper of FL-028. The runner of FL-039 reuses the record command of FL-069.

## Deliverables

- Eleven scenario files, one per case in the table of `TESTING.md`, each reviewed by hand.
- A schema and a loader that validate every scenario file and every extraction case.
- The record-and-replay wrapper.
- About 20 extraction cases and a scorer.
- The scenario runner and its report.
- The benchmark, its table, and the recorded first run.

## Success criteria

- `pnpm check` runs the scenarios and the extraction scorer from recordings, with no network and no API key, and gives the same report on every run.
- Deleting one recording makes `pnpm check` fail with a message that names the missing recording.
- The runner's report gives a staleness rate, a false invalidation rate, a missed invalidation rate and a historical accuracy for the scenario set, and the numbers measured before self-correction are recorded as the baseline for EPIC-08.
- Every scenario that phase 1 behaviour decides passes: restatement, multi-valued predicate, unrelated fact, older fact arriving late, a known name mentioned under a different entity type, a date in the text, no date in the text, a plan, and retraction. With succession and correction, which wait for FL-042, that is all eleven.
- The benchmark of FL-066 runs under `pnpm eval`, prints its table in a continuous integration job started by hand or on a schedule, and exits non-zero when a budget of REQ-35 is exceeded by more than its stated tolerance.

## Work items

| ID | Title | Phase | Depends on | Status |
|---|---|---|---|---|
| FL-027 | Timeline scenarios as reviewed data | 0 | FL-006, FL-018 | Completed |
| FL-028 | Record-and-replay wrapper for the LLM client | 1 | FL-006, FL-027 | Completed |
| FL-029 | Extraction cases | 1 | FL-018, FL-027 | Completed |
| FL-039 | Scenario runner | 2 | FL-027, FL-028, FL-069, FL-025, FL-032, FL-015 | Completed |
| FL-066 | Performance benchmark and budgets | 1 | FL-002, FL-058, FL-035 | Completed |
| FL-074 | Token and tool-call comparison with and without Factloom | 1 | FL-038 | Completed |
| FL-075 | Property-based tests of the time rules | 1 | FL-056, FL-067 | Completed |
| FL-076 | Differential tests between the in-memory store and SQLite | 1 | FL-075, FL-068, FL-016, FL-017 | Completed |
| FL-077 | Mutation-testing trial on core | 1 | FL-008, FL-009, FL-010, FL-011 | Completed |
| FL-081 | Token comparison on why-did-this-change tasks | 1 | FL-074, FL-080 | Under Review |

### FL-027: Timeline scenarios as reviewed data

| | |
|---|---|
| Status | Completed |
| Phase | 0 |
| Depends on | FL-006, FL-018 |
| Requirements | REQ-30 |
| Components | `apps/mcp-server` (evals) |

**Objective.** Write the eleven "fact changed over time" scenarios as data files with expected results, and a schema that validates them, before any code that they will judge exists.

**Background.** [`TESTING.md`](../../architecture/TESTING.md), "Layer B", gives the file format, the table of eleven cases that the first scenarios must cover, and the place: `apps/mcp-server/evals/`. No public benchmark tests as-of and known-at questions or supersession links, so Factloom has its own set. The scenarios are written before the code they judge, so that they fix what "right" means before an implementation can bend it. The first domain (FL-018) is defined from the same table and holds only what the eleven cases need ([ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md), "Consequences"). The scenario files use its entity types and predicates, and a test holds them to it.

This item writes one file per row of the table.

**Outcome.** A reviewed set of eleven scenario files exists, and a test fails when one is malformed or names an entity type or predicate the domain does not have. The runner (FL-039) executes them without changing them.

**Scope.**
- The directory `apps/mcp-server/evals/`, and its place in the Vitest include list if the root configuration needs one.
- A Zod schema for a scenario file and a loader that parses and validates one.
- Eleven scenario files in `apps/mcp-server/evals/scenarios/`.
- A test that loads and validates every file, and checks every entity type and predicate against `softwareDevelopmentDomain`.

**Non-goals.**
- A workspace member or a package for evals. The evals are a directory of the app ([`TESTING.md`](../../architecture/TESTING.md)).
- Running a scenario: FL-039.
- LLM recordings for the scenario texts: made when the runner first runs, in FL-039.
- Defining the domain: FL-018. If a scenario needs an entity type or a predicate the domain lacks, the domain is changed in its own commit, with its tests.
- More scenarios than the table asks for. One is added whenever a bug is found (`TESTING.md`).
- Branch divergence, scenario 8 of the [software development research](../../research/industries/software-development.md), section I. It is a question of which commit a fact belongs to, not of time, and nothing in phases 0 to 3 models it.
- Scripted git repositories. Phase 3 verification (FL-050) builds its own.

**Functional requirements.**
1. A scenario file follows the format in `TESTING.md`: a `name`, a list of `steps`, and a list of `expect` entries.
2. A step has a time, `at`, and one input. Two kinds of input exist, because inputs go through the use cases an agent reaches:
   - `remember`: a text, as an agent would send it to the `remember` tool.
   - `change_fact`: a report that a stored fact was wrong or is no longer true. It names the fact by subject, predicate and value, and carries `because`, an optional `ended_at`, and an `explanation`. It maps to the `changeFact` use case.
3. An `expect` entry is one of three kinds:
   - `ask`: a subject, a predicate, an optional `as_of` and an optional `known_at`; with `returns`, the exact set of values expected, and optionally `must_not_return`, and `sources`, the number of sources the one returned fact must have.
   - `history`: a subject and a predicate; with `superseded`, a list of `{ from, kind }` where `kind` is `succession`, `correction` or `revision`, and optionally `fact_rows`, the number of facts ever recorded for that subject and predicate.
   - `entities`: a name and `count`, the number of entities of any type that have that name. Neither `ask` nor `history` can show that an entity was reused rather than created twice; this kind can.
4. A date is a full timestamp or a calendar date, read with `parseDateInput` from `core`. A subject is an entity name, with an optional type. A predicate, and a type where one is given, must be in the software development domain of FL-018.
5. The schema is strict. It rejects an unknown key, a step with both or neither kind of input, an `ask` with no `returns`, an `entities` entry with no `count`, an empty `steps` list, and steps whose times are not in order.
6. There is one file per row of the table, and each meets the row's "what must happen" with explicit assertions:

   | File covers | Assertions it must contain |
   |---|---|
   | Succession | Now returns the new value and not the old one. `as_of` an earlier date returns the old one. `known_at` a date before the second step returns the old one. `history` shows the old value superseded, kind `succession` |
   | Correction | Now, and `as_of` any date, return the right value. `known_at` a date before the correction returns the wrong one. `history` shows kind `correction` |
   | Restatement | Now returns one value with `sources: 2`. `history` has `fact_rows: 1` |
   | Multi-valued predicate | Now returns both values. `history` has an empty `superseded` list |
   | Unrelated fact about the same subject | Two asks, one per predicate, each returning its value. Both `history` entries have an empty `superseded` list |
   | Older fact arriving late | Two late facts. One ends before the current fact begins: an `as_of` date inside its period returns it, and now still returns the current value. The other overlaps a live fact for a single-valued predicate: no ask returns it, and `fact_rows` does not grow |
   | A known name mentioned under a different entity type | The first text gives the repository a convention, recorded as a `convention` entity through `follows_convention`. The second text names the same thing as a decision with a status. An `ask` for the repository's `follows_convention` returns the name. An `ask` with that name as subject and `has_status` returns the status. An `entities` entry with that name has `count: 1`: the existing entity is reused and no second entity is created |
   | A date in the text | `as_of` the day before the date returns nothing. `as_of` the date returns the value. The step's own `at` is weeks later |
   | No date in the text | `as_of` a date years before the step returns the value |
   | A plan | Now returns nothing for the planned value, and the value in force before the plan is still returned |
   | Retraction | A `change_fact` step with no replacement. Now returns nothing. `known_at` a date before the retraction returns the value. `history` has an empty `superseded` list |

7. Step texts are written in the style of coding-agent notes and commit messages. Scenarios 1, 3 to 7 of the research section I are the starting points where they fit a row.
8. Each file uses specific predicates, one per kind of value, such as `uses_test_framework`, and no general predicate with a role ([ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md)).

**Technical requirements.**
1. Scenario files are YAML, as shown in `TESTING.md`. This needs a YAML parser as a development dependency of `apps/mcp-server`. Its version is read from the registry and pinned exactly, and the reason is stated in the commit.
2. The evals import `@factloom/core`, `@factloom/graph-rag` and `zod` by package name, through each package's `index.ts`. Nothing in `apps/mcp-server/src` imports from `evals/`, so the server does not load eval code.
3. The [testing rules](../../../.claude/rules/testing.md) already list `apps/mcp-server/evals/**` in their `paths`, so they apply to every file written here.
4. Expected values are written as an agent would say them. Comparison rules belong to the runner; the schema only requires non-empty strings.
5. The schema's derived type is what FL-039 consumes. No second description of a scenario exists.

**Constraints.**
- [`TESTING.md`](../../architecture/TESTING.md), "Layer B".
- [Testing rules](../../../.claude/rules/testing.md), "Evals".
- [ADR 0004](../../architecture/adr/0004-zod-schemas-and-result-values.md): the schema is the source of the type.
- [Git rules](../../../.claude/rules/git.md): the repository is public; texts are invented.
- [Engineering principles](../../../.claude/rules/engineering-principles.md): few dependencies, each with a reason.

**Acceptance criteria.**
- [x] Test "every scenario file matches the scenario schema" passes and reports eleven files.
- [x] Test "rejects a scenario with an unknown key" passes, and so do "rejects a step with no input", "rejects an ask with no expected values" and "rejects steps that are out of order", each on an inline example.
- [x] Test "covers every case in the table" passes: each of the eleven case names appears in exactly one file's `name`.
- [x] Test "every ask about the past states a date" passes: each file whose row mentions an earlier date has an `ask` with `as_of` or `known_at`.
- [x] Test "every scenario uses only entity types and predicates of the software development domain" passes, and "rejects a scenario that names a predicate the domain does not have" passes on an inline example.
- [x] Review by the owner: the owner reads each file and checks every expected value against the row of the table, by hand. The owner records, per file, "reviewed" and the date in the completion evidence. A file changed after its review is reviewed again.
- [x] `git grep -n "evals/" -- apps/mcp-server/src` shows no import.
- [x] `pnpm check` exits 0.

**Validation.** Unit tests in `apps/mcp-server/evals/` for the schema and the loader; the owner's review of the data.

**Completion evidence.** The commit, the passing `pnpm check` output, and the owner's review record per file. The `entities` kind of expectation is added to the file format shown in [`TESTING.md`](../../architecture/TESTING.md), "Layer B", in its own commit.

**Recorded evidence.** Everything except the owner's review was done on 2026-11-14, in three commits: `build(mcp-server): add yaml 2.9.1 and the evals folder to the check`, `test(evals): add the scenario format and the eleven timeline scenarios`, and `docs: show the scenario format as built in the testing strategy`. The item is `Under Review` until the owner has read the eleven files.

`pnpm check`, on Linux x64 with Node.js v22.23.4, ended with:

```text
 Test Files  17 passed (17)
      Tests  250 passed (250)
```

`git grep -n "evals/" -- apps/mcp-server/src` shows no import.

Owner's review. The owner approved FL-027 on 2026-11-16, in the working session, with the message "approve FL-027", after the last change to the files on 2026-11-15. The approval was given once for all eleven files and for the choices listed below the table; it is recorded here per file as the acceptance criterion asks. Each file is in `apps/mcp-server/evals/scenarios/`. For each, check every expected value against its row of the table in functional requirement 6.

| File | Reviewed | Date |
|---|---|---|
| `succession.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `correction.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `restatement.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `multi-valued-predicate.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `unrelated-fact.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `older-fact-arriving-late.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `known-name-different-type.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `date-in-text.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `no-date-in-text.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `plan.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `retraction.yaml` | Reviewed, approved by the owner | 2026-11-16 |

Choices made where the item left one, for the owner to confirm in the review:

- A subject is written as `{ name, type }`, with the type optional. The repository in every scenario is an invented one, `shop-api`.
- The correction scenario corrects through a `remember` text ("Correction: ..."), because a `change_fact` step carries no replacement value. Only the retraction scenario uses `change_fact`.
- A scenario's `name` starts with its case name and a colon, which is how the test "covers every case in the table" matches files to cases.
- In "Older fact arriving late", the fact that fits is Heroku, from 2024-01-01 to 2025-02-01, before Fly.io begins. The fact that overlaps is Render, from June to September 2025, inside the Fly.io period. It must not be recorded, so `fact_rows` stays at 2.
- Expected values that look like numbers, the ports, are quoted so that they are read as text.

### FL-028: Record-and-replay wrapper for the LLM client

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-006, FL-027 |
| Requirements | REQ-30 |
| Components | `apps/mcp-server` (evals) |

**Objective.** Make every eval that calls an LLM deterministic, by replaying recorded responses and failing when one is missing.

**Background.** [`TESTING.md`](../../architecture/TESTING.md), "Keeping it deterministic", describes the mechanism. It separates two questions. A replayed run answers "given these model outputs, does the pipeline do the right thing?" on every check. A live run, by hand, answers "is the model good enough?". The wrapper sits around the `LlmClient` interface of `core` ([ADR 0013](../../architecture/adr/0013-claude-behind-a-one-method-interface.md)), so it works for extraction now and for conflict detection and verification later. It lives in the evals directory that FL-027 sets up.

**Outcome.** An eval author wraps any `LlmClient` and gets one that replays. `pnpm check` never calls a model. A changed prompt shows up as a missing recording, and the new recordings show up in the diff.

**Scope.**
- A function in `apps/mcp-server/evals/` that takes a directory of recordings, a mode, a model label and an inner `LlmClient`, and returns an `LlmClient`.
- The key derived from a request.
- The format of a recording file.
- Unit tests, with a small inner client written in the test that returns the responses it is given.

**Non-goals.**
- The Anthropic client: FL-019.
- Any recording of a real model. The first are made in FL-069, for the extraction cases, and in FL-039.
- Recording or replaying the embedder. Evals that need meaning use the real local embedder (FL-033); the others use the fake one.
- Removing recordings that are no longer used.
- Matching a request loosely. A request either has its exact recording or it has none.

**Functional requirements.**
1. In replay mode, which is the default, `generateObject` looks up the recording for the request's key, parses the stored response with the request's schema, and returns it. The inner client is not called and may be absent.
2. In replay mode a missing recording throws an error that names the key, the file expected and the command that records. It throws, and does not return `llm_failed`, so that no pipeline can treat a missing recording as an ordinary model failure and carry on.
3. A stored response that no longer matches the request's schema returns `llm_failed`, as a real client would for output that does not match.
4. In record mode, `generateObject` calls the inner client. A successful response is written as a recording and returned. A failure is returned and nothing is written.
5. Record mode is chosen explicitly by the caller of the wrapper. No environment default and no fallback turns replay into a live call.
6. The key is a hash of the task, the instructions, the input, the JSON Schema form of the request's schema, and the model label. A change to any of them gives another key.
7. A recording is one JSON file named by its key. It holds the task, the model label, the instructions, the input and the response, written with stable key order and indentation so that a diff shows what changed.
8. Recording the same request twice leaves the file byte for byte the same when the response is the same.

**Technical requirements.**
1. The wrapper implements `LlmClient` exactly. Nothing that receives it can tell it from another client.
2. The interface does not name a model, so the model label is an argument of the wrapper. The caller passes the model that the inner client is configured with.
3. The JSON Schema form comes from Zod's own conversion, which the [toolchain research](../../research/technical/toolchain.md) ran (`z.toJSONSchema`).
4. A recording never holds an API key, a header or a file path of the machine. The wrapper sees only the four fields of a request, so this holds by construction, and a test asserts the exact set of keys written.
5. File access stays in `apps/mcp-server/evals/`. Nothing is added to `core`.

**Constraints.**
- [ADR 0013](../../architecture/adr/0013-claude-behind-a-one-method-interface.md): one method on the interface.
- [Testing rules](../../../.claude/rules/testing.md): "A missing recording fails the run. Re-record deliberately, and review the diff."
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): `core` imports only `zod`.
- [Git rules](../../../.claude/rules/git.md): never commit a secret.

**Acceptance criteria.**
- [x] Unit test "replays a recorded response without calling the inner client" passes, with an inner client that throws when called.
- [x] Unit test "throws and names the missing recording when none exists" passes.
- [x] Unit test "records a response and then replays it" passes, in a temporary directory.
- [x] Unit test "uses another recording when the instructions change" passes, and the same for the input, the task, the schema and the model label: five cases.
- [x] Unit test "returns llm_failed when a recording no longer matches the schema" passes.
- [x] Unit test "writes nothing when the inner client fails" passes.
- [x] Unit test "writes the same bytes when the same response is recorded twice" passes.
- [x] Unit test "a recording holds only the task, the model label, the instructions, the input and the response" passes.
- [x] `pnpm check` exits 0 with the network unavailable to the test process.

**Validation.** Unit tests in `apps/mcp-server/evals/`, on temporary directories, with an inner client written in the test.

**Completion evidence.** The commit and the passing `pnpm check` output.

**Recorded evidence.** Done on 2026-11-16, in the commit `test(mcp-server): add the record-and-replay wrapper for the LLM client`. The wrapper is `createRecordingLlmClient` in `apps/mcp-server/evals/create-recording-llm-client.ts`.

`pnpm check`, on Linux x64 with Node.js v22.23.4, run under `unshare -rn` so that the process had no network (a request to the npm registry from inside it failed), exited 0 and ended with:

```text
 Test Files  55 passed (55)
      Tests  662 passed (662)
```

Each rule was broken by hand once and a test failed: replay calling the inner client; each of the five parts of the key left out, one at a time, failed exactly the test for that part; the schema check of a stored response; writing a recording after a failure; the sorting of the response's keys; and a missing recording returning a value instead of throwing.

Differences from the item:

- The wrapper takes a fifth argument, `recordCommand`, the command named in the error for a missing recording (functional requirement 2). No record command exists yet; FL-069 and FL-039 make the first, and pass it here.
- A recording file that is not valid JSON, or not a recording, returns `llm_failed`, as a stored response that does not match the schema does.
- The response is written with the keys of every object sorted, so that functional requirement 7's stable key order does not depend on the schema's field order. The five top-level fields are written in the order task, model, instructions, input, response; the model label is stored as `model`.
- The schema test of functional requirement 3 uses a refinement, because a refinement is not part of the JSON Schema form: the key stays the same and the stored response no longer passes. Any other change to the schema gives a new key, and so a missing recording.


### FL-029: Extraction cases

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-018, FL-027 |
| Requirements | REQ-30 |
| Components | `apps/mcp-server` (evals) |

**Objective.** Write about 20 input texts with the facts expected from each, and a scorer that reports extraction precision and recall.

**Background.** [`TESTING.md`](../../architecture/TESTING.md), "Layer C": one input text and the facts expected from it, subject, predicate, object and dates. The cases guard the extraction prompt. How good extraction is beyond one two-sentence example is open question Q-31. Precision and recall are reported and tracked, with no target, because the outcome depends on a model (`TESTING.md`, "What is measured"). The cases exist before extraction does: FL-021 is written against their expected facts. The cases call the public `remember` use case, so `graph-rag` needs no new export; the first run against recorded model output is therefore made in FL-069, after `remember` exists (FL-023). That run passes or fails each case by the facts it marks as required and forbidden, and reports precision and recall beside.

**Outcome.** The author of the extraction step has a fixed set of inputs and expected facts to work against, and a scorer that prints precision and recall for whatever function is given to it. A change to the extraction instructions shows its effect as a change in two numbers and in the recordings.

**Scope.**
- A schema and loader for an extraction case, in `apps/mcp-server/evals/`.
- About 20 case files.
- A pure scoring function, and a function that runs every case through a given function and builds the report.
- Unit tests of the scorer, and a validation test of the case files.

**Non-goals.**
- The extraction step, its schema and its instructions: FL-021.
- Recordings of a real model for these cases, the function that sends a case through `remember`, and the rule that passes or fails a case. All are made in FL-069, with the wrapper of FL-028.
- A target for precision or recall.
- Judging statements. A statement's wording is not compared, only subject, predicate, object and dates.
- Entity resolution against stored entities: each case starts from empty memory.

**Functional requirements.**
1. A case file holds: a `name`; the `text`; `observed_at`, the moment the text is taken to be written, against which a relative date is resolved; `expected`, a list of facts; and optionally `forbidden`, a list of facts that must not be extracted.
2. An expected or forbidden fact holds a subject with type and name, a predicate, an object that is either a value or an entity with type and name, and `valid_from` and `valid_to`, each a date or null. An expected fact also holds `required`, true or false: true for a fact the case exists to test, which must be extracted for the case to pass in FL-069. Every case with an expected fact has at least one that is required.
3. The schema is strict, and it rejects a case whose predicate or entity type is not in the software development domain of FL-018.
4. The cases cover, with the number of cases for each printed by the validation test:
   - one fact stated plainly;
   - several facts in one text;
   - a date in the text, so `valid_from` is that date and not `observed_at`;
   - a relative date such as "last week";
   - no date, so `valid_from` is null;
   - an end stated in the text, so `valid_to` is set;
   - a plan or intention, which must give no current fact, written under `forbidden`;
   - a text with no fact at all;
   - a question or a hypothetical, which must give no fact;
   - an object that is an entity, and an object that is a literal value such as a version or a command;
   - a multi-valued predicate with two values in one sentence;
   - one thing named twice in ways that suggest two entity types;
   - a commit-message style text and a terse agent-note style text;
   - a text where the fact is surrounded by unrelated talk.
5. The scorer takes the extracted facts and a case. An extracted fact matches an expected one when the normalised subject name, the predicate, the normalised object and both dates are equal. Entity type is reported separately and does not decide a match, because resolution prefers an existing entity of any type.
6. The report gives, per case and for the whole set: the number expected, extracted and matched; precision, matched over extracted; recall, matched over expected; the number of forbidden facts that were extracted; and the number of matches whose entity type differed.
7. The run function takes, as an argument, a function from a text and `observed_at` to a list of facts or a failure, and calls it once per case. A case whose function returns a failure is reported as a failure and counts as zero extracted.

**Technical requirements.**
1. Names and values are normalised with `normaliseEntityName` from `core`, the same function entity resolution uses.
2. Precision over zero extracted and recall over zero expected are reported as not applicable, not as 0 or 1, and are left out of the set's totals.
3. Case files use the same file format and loader approach as the scenarios of FL-027, in `apps/mcp-server/evals/extraction-cases/`.
4. The run function imports no use case. The function it is given in production use sends the text through `remember` on empty memory and returns the facts recorded; FL-069 writes it. In this item the tests pass a stub.

**Constraints.**
- [`TESTING.md`](../../architecture/TESTING.md), "Layer C" and "What is measured".
- [Testing rules](../../../.claude/rules/testing.md), "Evals".
- [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md): specific predicates.
- [Git rules](../../../.claude/rules/git.md): texts are invented and hold no secret.

**Acceptance criteria.**
- [x] Test "every extraction case matches the case schema and the domain" passes and reports the number of files, which is 18 or more.
- [x] Test "every listed kind of case is present" passes, from a tag on each case.
- [x] Unit test "counts a fact as matched when subject, predicate, object and dates agree" passes.
- [x] Unit test "does not match a fact whose valid_from differs" passes.
- [x] Unit test "matches across upper case and spacing" passes.
- [x] Unit test "reports precision and recall for the set" passes: with a stub extraction function that returns a known mix of right, wrong and missing facts over three inline cases, the report's numbers equal hand-computed values written in the test.
- [x] Unit test "counts a forbidden fact that was extracted" passes.
- [x] Unit test "reports a failed extraction as a failure and no extracted facts" passes.
- [x] Test "every case with an expected fact marks one as required" passes, and the schema rejects an expected fact with no `required` field, on an inline example.
- [x] Review by the owner: the owner reads each case and checks the expected facts, and which of them are required, against the text. The owner records, per file, "reviewed" and the date in the completion evidence.
- [x] `pnpm check` exits 0.

**Validation.** Unit tests in `apps/mcp-server/evals/` for the scorer, with a stub function; a validation test of the data; the owner's review. The run through `remember`, in replay, is FL-069.

**Completion evidence.** The commit, the passing `pnpm check` output, the number of cases per kind, and the owner's review record.

**Recorded evidence.** Everything except the owner's review was done on 2026-11-16, in the commit `test(mcp-server): add extraction cases and their scorer`. The owner approved the cases on 2026-11-16.

`pnpm check`, on Linux x64 with Node.js v22.23.4, ended with:

```text
 Test Files  54 passed (54)
      Tests  647 passed (647)
```

The validation test printed 20 case files, and this number of cases per kind. A case is tagged with every kind it covers, so the counts add up to more than the number of files.

| Kind | Cases |
|---|---|
| `one-plain-fact` | 3 |
| `several-facts` | 2 |
| `date-in-text` | 3 |
| `relative-date` | 2 |
| `no-date` | 3 |
| `end-stated` | 2 |
| `plan` | 2 |
| `no-fact` | 1 |
| `question-or-hypothetical` | 2 |
| `entity-object` | 8 |
| `value-object` | 11 |
| `multi-valued-two-values` | 1 |
| `two-entity-types` | 1 |
| `commit-message` | 2 |
| `agent-note` | 2 |
| `surrounded-by-talk` | 1 |

Each rule was broken by hand once and a test failed: the `valid_from` of the match key, the normalisation of the subject name, the count of forbidden facts, the failure flag of a failed extraction, the check that one expected fact is required, the check against the domain, and the entity type count.

Owner's review. The owner approved FL-029 on 2026-11-16, in the working session, with the message "approve FL-029", after the last change to the files on 2026-11-16. The approval was given once for all 20 files and for the choices listed below the table; it is recorded here per file as the acceptance criterion asks. Each file is in `apps/mcp-server/evals/extraction-cases/`. For each, check the expected facts, and which of them are required, against the text.

| File | Reviewed | Date |
|---|---|---|
| `agent-note-status.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `agent-note.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `commit-message-port.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `commit-message.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `date-in-text.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `end-stated.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `hypothetical.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `multi-valued.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `no-date.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `no-fact.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `one-plain-fact.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `plan-beside-fact.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `plan.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `question.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `relative-date-days-ago.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `relative-date.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `several-facts.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `start-and-end-stated.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `surrounded-by-talk.yaml` | Reviewed, approved by the owner | 2026-11-16 |
| `two-entity-types.yaml` | Reviewed, approved by the owner | 2026-11-16 |

Choices made where the item left one, for the owner to confirm in the review:

- The fourteen kinds of functional requirement 4 are sixteen tags: "an object that is an entity, and an object that is a literal value" is two tags, `entity-object` and `value-object`, and "a commit-message style text and a terse agent-note style text" is two, `commit-message` and `agent-note`.
- `follows_convention` takes a `convention` entity as its object, as in the FL-027 scenario "A known name mentioned under a different entity type". `uses_test_framework` and `uses_package_manager` take a `dependency` entity. `deploys_to`, `listens_on_port` and `has_status` take a value.
- A switch ("from npm to pnpm") expects the old fact too, with `valid_to` the date of the switch, but marks it not required: the case exists to test the new fact.
- In `commit-message.yaml`, the replaced Jest fact ends at the commit's own `observed_at`, the latest moment the text allows. It is not required.
- A relative date resolves to the calendar day: "yesterday", written on 2026-03-16, is 2026-03-15.
- `plan.yaml` forbids the planned fact both with no date and with the planned date, 2026-06-01.
- `surrounded-by-talk.yaml` forbids port 9200, the default that the text says is not used.
- A failed case counts as zero extracted, so it lowers recall and leaves precision alone. Totals are the sums of the counts over the cases, so a case whose precision or recall is not applicable adds nothing to that ratio.


### FL-039: Scenario runner

| | |
|---|---|
| Status | Completed |
| Phase | 2 |
| Depends on | FL-027, FL-028, FL-069, FL-025, FL-032, FL-015 |
| Requirements | REQ-30 |
| Components | `apps/mcp-server` (evals), exercising `packages/graph-rag`, `packages/core` and `packages/storage` |

**Objective.** Run each timeline scenario through the use cases with a fixed clock and a replayed LLM, assert on the resulting memory, and report the rates that self-correction is measured by.

**Background.** [`TESTING.md`](../../architecture/TESTING.md), "Layer B" and "What is measured". In phase 1, `remember` sorts extracted facts by two deterministic rules: a restated fact gains the source, and a fact that conflicts with a stored one is skipped ([`INTERFACES.md`](../../architecture/INTERFACES.md), "Use cases"). So before phase 2 the succession and correction scenarios cannot pass through `remember`: the new fact is skipped and the old one stays current. That is the staleness the runner must measure. FL-042 then makes `remember` resolve the conflict, and its acceptance is this runner reporting a staleness rate of 0 and a false invalidation rate of 0.

Assertions read memory directly. `recall` takes a free-text question and ranks its answers, so it is not used.

The `remember` steps need LLM recordings, and a recording can only be made with a real API key, which only the owner holds. A replayed run fails while a recording is missing ([`TESTING.md`](../../architecture/TESTING.md), "Keeping it deterministic"). As for FL-069, this item is therefore done in a session with the owner present: the agent writes the runner and its unit tests, the owner makes the recordings in the same working tree with the record command of FL-069, and the code and the recordings are committed together once `pnpm check` passes. The `remember` use case reaches this item through FL-069, which depends on it.

**Outcome.** `pnpm check` runs every scenario from recordings. An engineer working on self-correction changes the code, runs one command, and reads four numbers and the list of scenarios that failed.

**Scope.**
- The runner, in `apps/mcp-server/evals/`: load a scenario, build the dependencies, apply each step, evaluate each `expect` entry.
- The four metrics and a printed report.
- LLM recordings for every `remember` step of the eleven scenarios, made once with a real model.
- A cross-check of the scenario files against the domain.
- The baseline numbers, recorded.

**Non-goals.**
- Changing `remember` so that the succession and correction scenarios pass: FL-042.
- The conflict judge and its measurement: FL-041.
- Asserting through `recall`, and any LLM judge.
- Running against the MCP server over stdio: FL-037.
- New scenarios. One is added when a bug is found.
- Repeated live runs to measure how much a model varies. A live run is made by hand when wanted.

**Functional requirements.**
1. For each scenario the runner creates empty memory in a namespace of its own, on a new SQLite database, since an eval uses a database ([`TESTING.md`](../../architecture/TESTING.md), "Four kinds of test"). It needs `commit` and the structural reads of the adapter (FL-015), and neither retrieval lane.
2. Steps are applied in order. For each step the clock is fixed at the step's `at`. Identifiers come from a counting generator. The embedder is the fake embedder of `core`, and the database is opened with its model name and dimensions. The LLM is the wrapper of FL-028 in replay mode.
3. A `remember` step calls the `remember` use case (FL-023) with the step's text, the trigger `agent`, and a source of kind `agent_note`.
4. A `change_fact` step finds the named fact with `listFacts` for the subject and predicate at the step's time, picks the one with the named value, and calls the `changeFact` use case (FL-025) with its identifier.
5. A step whose use case returns a failure fails the scenario, with the error code in the report. A fact that `remember` returns in `skipped` is not a failure.
6. An `ask` finds the subject with `findEntities` by name, and by type when one is given. It then calls `MemoryStore.listFacts` with the subject, the predicate, and a time filter built by the rule of [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md): both dates default to the time just after the last step, and `as_of` takes the `known_at` date when only `known_at` is given. The values returned are the object value, or the object entity's name.
7. An `ask` passes when the set of normalised values equals `returns` exactly, none is in `must_not_return`, and `sources`, when given, equals the number of sources of the one returned fact. A subject that does not exist gives an empty set.
8. A `history` takes a fact from `listFacts` with `'all'` for the subject and predicate and calls the `getFactHistory` use case (FL-032) with it. Each superseded fact's kind is the operation of its `fact.invalidated` audit entry. The entry passes when the `{ from, kind }` pairs found equal `superseded` exactly and, when `fact_rows` is given, the number of history entries equals it. A fact that was retracted has no supersession link and is not in `superseded`.
9. An `entities` entry calls `findEntities` with the name and `type: null` after the last step, and passes when the number of entities returned equals `count`.
10. A scenario passes when every step succeeds and every `expect` entry passes.
11. The report gives, over the whole set:
    - staleness rate: of the asks with no `as_of` and no `known_at`, the share that returned a value listed in `must_not_return`;
    - false invalidation rate: of the values listed in `returns` of those same asks, the share for which a fact was recorded and is no longer live;
    - missed invalidation rate: of the `superseded` pairs expected, the share whose `from` fact is still live;
    - historical accuracy: of the asks with `as_of` or `known_at`, the share that passed.
    It also lists each failed scenario with its failed entries, expected against found.
12. Every scenario runs as one test in `pnpm check`. Two scenarios, succession and correction, need self-correction. Until FL-042 they are run and reported, and their failure does not fail the check. They are named in one list in the runner, with FL-042 as the reason. A listed scenario that passes fails the check, so the list cannot outlive its reason. Every other scenario must pass.
13. The scenario files were checked against the software development domain when they were written (FL-027). The runner loads them with the same loader, so a file that names a predicate or an entity type the domain does not have fails before any step runs, with the file and the name.

**Technical requirements.**
1. The runner calls only exports of the packages: `remember`, `changeFact` and `getFactHistory` from `@factloom/graph-rag`, `openSqliteMemoryStore` from `@factloom/storage`, and the helpers and types of `@factloom/core`. The app already declares those three packages as dependencies.
2. Values are normalised with `normaliseEntityName` from `core` before comparison.
3. Recordings live under `apps/mcp-server/evals/`, one directory per scenario. They are made by a command in record mode that the owner runs by hand with an API key in the environment. The command builds the Anthropic client of the app, which is in the same application, and wraps it with the wrapper of FL-028 in record mode. It reuses the record command written for the extraction cases in FL-069, given the scenario files in place of the cases, and is started as `pnpm run record:scenarios` from `apps/mcp-server`.
4. The record command is not part of `pnpm check`. `pnpm check` sets no API key and makes no network call.
5. The report is printed by the test run. Nothing is written to the repository by a replayed run.
6. The metric functions are pure and have unit tests on hand-built results.

**Constraints.**
- [`TESTING.md`](../../architecture/TESTING.md), "Layer B", "Keeping it deterministic", "What is measured".
- [Testing rules](../../../.claude/rules/testing.md): a scenario reads memory with `MemoryStore.listFacts` and `getFactHistory`, not with `recall`; no LLM judges an answer; never weaken a failing test to get a green run. The list in functional requirement 12 is the one stated exception, and it is closed by FL-042.
- [Architecture rules](../../../.claude/rules/architecture.md): the runner changes memory only through use cases.
- [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md) and [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): what the scenarios guard.
- [Git rules](../../../.claude/rules/git.md): recordings are checked for secrets before they are pushed.

**Acceptance criteria.**
- [x] `pnpm check` exits 0 with no API key set, and its output contains the report with the four metrics and one line per scenario.
- [x] By hand, once, by the owner in the session: with `ANTHROPIC_API_KEY` set in the environment and nowhere else, the owner runs `pnpm run record:scenarios` from `apps/mcp-server`. It ends with exit code 0. The owner reads the diff of the new recordings for secrets and records the model identifier. Until this step is done nothing of this item is committed, and the item is not `Completed`.
- [x] Nine scenarios pass: restatement, multi-valued predicate, unrelated fact about the same subject, older fact arriving late, a known name mentioned under a different entity type, a date in the text, no date in the text, a plan, and retraction.
- [x] Unit test "an entities expectation counts the entities with a name of any type" passes, on an inline scenario.
- [x] The succession and correction scenarios are run and reported as failing, with the stale value named. Staleness rate, false invalidation rate, missed invalidation rate and historical accuracy are recorded as the baseline before self-correction.
- [x] False invalidation rate is 0 on the nine passing scenarios.
- [x] Unit test "a listed scenario that passes fails the check" passes, on an inline scenario.
- [x] Unit test "an ask reads memory through listFacts with both dates" passes: with a store wrapper that fails on `searchFactsByVector` and `searchFactsByKeyword`, a scenario still runs to the end.
- [x] Unit tests of the four metric functions pass, each against a hand-computed value written in the test.
- [x] Unit test "fails with the file and the predicate when a scenario names a predicate the domain does not have" passes.
- [x] With one recording removed in a local run, `pnpm check` exits non-zero and names the missing recording. The output is recorded and the file restored.
- [x] Two runs of `pnpm test` in a row print the same report, byte for byte.
- [x] `git grep -n "API_KEY" -- apps/mcp-server/evals` shows no line that holds a key's value. The owner reads the diff of the recordings before the push and records that it was done.

**Validation.** Eval: the eleven scenarios in replay, inside `pnpm check`. Unit tests of the metric functions and the gating list. One live recording run by the owner, by hand.

**Completion evidence.** The commit, the passing `pnpm check` output with the report, the four baseline numbers, the model the recordings were made with, and the output of the run with a recording removed.

**Recorded evidence.** Done on 2026-11-20 on Linux x64 with Node.js v22.23.4, ahead of the owner's review of FL-069, with the owner's approval: the extraction recordings FL-069 supplies exist and pass, and a change the owner asks for there costs one re-recording here. The item is `Under Review` until the owner confirms the recording step and reads its diff, the two criteria that are the owner's. The commits were made while the new repository refused pushes from this session, so they wait locally until it accepts them.

Commits, in order:

1. `feat(mcp-server): add the scenario runner and the four self-correction metrics`;
2. `feat(mcp-server): add the record command for the timeline scenarios`;
3. `test(mcp-server): run the timeline scenarios in replay, recorded with the owner's key`.

Built:

- **The loader.** `loadScenarios` in `evals/scenario.ts` reads every file in name order and fails before any step runs when a file names a predicate or an entity type outside the domain, with the file and the name.
- **The runner.** `runScenario` in `evals/run-scenario.ts` opens a new SQLite database at `:memory:` for each scenario, with the fake embedder's model and dimensions, a counting identifier generator, and the clock fixed at each step's `at`. A `remember` step calls `remember` with the trigger `agent` and an `agent_note` source. A `change_fact` step finds the fact with `listFacts` at the step's time and calls `changeFact`. A failed use case ends the steps, with its code in the report. The expectations are checked at the moment just after the last step, by `listFacts` with both dates and `getFactHistory`, never `recall`, on values normalised with `normaliseEntityName`.
- **The metrics.** `evals/scenario-metrics.ts` holds the four pure functions, the list `SCENARIOS_FAILING_UNTIL_FL_042` (correction and succession), `judgeScenarioOutcome`, which refuses a listed scenario that passes, and the report.
- **The record command.** `pnpm run record:scenarios` in `src/record-scenarios.ts`, one recordings directory per scenario under `evals/recordings/scenarios/`.
- **The replay test.** `src/scenarios-replay.test.ts` runs each scenario as one test in `pnpm check`, and a last test prints the report and asserts that the scenarios that pass have no false invalidation.

The recording run. `pnpm run record:scenarios` ran once from `apps/mcp-server` with `ANTHROPIC_API_KEY` set for that command only, from `OWNER_ANTHROPIC_API_KEY`, and exited 0. Model `claude-haiku-5-5`, 20 calls, every stop reason `end_turn`. Tokens over the 20 calls: 1,078 input, 3,376 output, 2,257 written to the cache and 42,883 read from it; the second call read 2,257 cached tokens. The 20 recordings were read for secrets: each holds only `task`, `model`, `instructions`, `input` and `response`, and none matches a key, token, password or machine path pattern. `git grep -n "API_KEY" -- apps/mcp-server/evals` shows nothing.

The report, the same in the record run and in replay. These are the baseline numbers before self-correction:

```text
Timeline scenarios in replay, model claude-haiku-5-5:
FAIL  Correction: the database port was recorded wrongly  (listed until FL-042)
PASS  A date in the text: the move to pnpm is dated
PASS  A known name mentioned under a different entity type: a convention that is also a decision
PASS  Multi-valued predicate: two conventions at once
PASS  No date in the text: a test framework with an unknown start
PASS  Older fact arriving late: earlier deployment targets
PASS  A plan: an intended move to another deployment target
PASS  Restatement: the package manager is stated twice
PASS  Retraction: a convention that was never followed
FAIL  Succession: the test framework was switched  (listed until FL-042)
PASS  Unrelated fact about the same subject: a package manager does not replace a test framework

Staleness rate: 2 of 13 (0.154).
False invalidation rate: 0 of 13 (0.000).
Missed invalidation rate: 2 of 2 (1.000).
Historical accuracy: 9 of 10 (0.900).
Failed: Correction: the database port was recorded wrongly
  ask PostgreSQL listens_on_port: expected [5432], found [5433], 1 sources; stale: 5433
  ask PostgreSQL listens_on_port (as_of 2026-01-20): expected [5432], found [5433], 1 sources
  history PostgreSQL listens_on_port: expected [5433 correction], found [], 1 rows

Failed: Succession: the test framework was switched
  ask shop-api uses_test_framework: expected [Vitest], found [jest], 2 sources; stale: jest
  history shop-api uses_test_framework: expected [Jest succession], found [], 1 rows
```

In the succession scenario the second text restates Jest, which gains a second source, and the Vitest fact is skipped as a conflict with it; in the correction scenario the right port is skipped the same way. That is the staleness FL-042 removes.

`pnpm check`, under `unshare -rn` with no network and no API key, exited 0 with the report in its output and:

```text
 Test Files  117 passed (117)
      Tests  1148 passed (1148)
```

Vitest 5.1.0 hides the output of passing tests when it detects an AI agent, so `CLAUDECODE` and `AI_AGENT` were unset, as for FL-069.

With the recording `evals/recordings/scenarios/plan/03b2c97601217cdd38b5f25be95aa672af1dabee5b9814b4673758f7ae98404f.json` moved aside, `pnpm test` exited 1 with:

```text
Error: No recording for the key 03b2c97601217cdd38b5f25be95aa672af1dabee5b9814b4673758f7ae98404f. Expected the file /home/user/factloom/apps/mcp-server/evals/recordings/scenarios/plan/03b2c97601217cdd38b5f25be95aa672af1dabee5b9814b4673758f7ae98404f.json. Record it with: pnpm --filter @factloom/mcp-server run record:scenarios
```

The file was restored, byte for byte. Two runs of `pnpm test` in a row printed the same report, byte for byte (`cmp` of the two, 26 lines).

Rules broken by hand, each then restored:

| Break | Test that failed |
|---|---|
| Succession taken off the list of FL-042 | the replay test of the succession scenario |
| `as_of` no longer takes the `known_at` date | "gives the as-of date the known-at date when only known_at is given" |
| A listed scenario that passes is accepted | "a listed scenario that passes fails the check" |
| Staleness never counted | the staleness metric test |

Differences from the item:

- **A history reads every fact of the subject and predicate.** Functional requirement 8 takes one fact. For a multi-valued predicate `getFactHistory` reaches only the facts linked by supersession, so the multi-valued scenario, whose `fact_rows` is "the number of facts ever recorded for the subject and predicate", saw one row of two. The runner reads the history of each fact and joins the entries by fact.
- **The missed invalidation rate** counts an expected supersession as missed when the first fact recorded with its `from` value is still live. A succession revises the old fact into an ended copy, which is live, so "the `from` fact" is the original.
- **A failed step ends the steps, and the expectations are still checked**, so that the report shows memory as the failure left it.
- **The recordings were made by the agent**, with the owner's key set for the one command, as for FL-069, FL-041 and FL-064.

For the owner's review: confirm the recording step (the model, the token counts, and the diff of the 20 recordings), and record that the diff was read before the push.

**Owner's review.** On 2026-11-25 the owner confirmed in the session ("yes to all confirmed") the recording run made with the owner's key, its model and token counts, and that the diff of the recordings was read for secrets before the push, as recorded above. The item is `Completed`.

### FL-066: Performance benchmark and budgets

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-002, FL-058, FL-035 |
| Requirements | REQ-35 |
| Components | `apps/mcp-server` (evals), exercising `packages/storage` and `packages/graph-rag` |

**Objective.** Measure how long `recall`, `record_fact` and server start take on namespaces of 10,000 and 100,000 facts, and fail when a budget of REQ-35 is missed.

**Background.** REQ-35 in [`REQUIREMENTS.md`](../../product/REQUIREMENTS.md) sets the budgets: `recall` within 150 ms at the 95th percentile on a namespace of 10,000 facts and within 500 ms on 100,000; `record_fact` at most 50 ms excluding embedding; server start within 2 seconds once the embedding model is downloaded. The numbers are targets until the first run of this benchmark confirms or revises them.

What has been measured so far comes from two spikes, both run on a Linux virtual machine and not on the owner's Mac:

- Vector search. [`spikes/sqlite-vec-fts5/README.md`](../../../spikes/sqlite-vec-fts5/README.md), "Recorded output: `node spike-plain-table-knn.mjs`": on an in-memory database with random vectors of 384 dimensions, ordering 100,000 rows of an ordinary table by `vec_distance_cosine()` took 82.0 ms with the time filter and 87.8 ms without, against 43.7 ms for the `vec0` table with no filter. [ADR 0008](../../architecture/adr/0008-vector-search-on-a-plain-table.md) accepts that cost. A file database was not timed (open question Q-09).
- Embedding latency. [`spikes/embedding-retrieval/README.md`](../../../spikes/embedding-retrieval/README.md), "Size and time", records the load time and the time per text of the local model. `recall` embeds its question on every call, so that time is inside the `recall` budget.

Neither spike measured the keyword lane, the graph lane, rank fusion, a write, or a server start. The one extraction call measured in the [LLM research](../../research/technical/llm-anthropic.md) took about 3.5 seconds, which is why `remember` is reported and not budgeted: its time is dominated by the LLM call, and no local change removes that.

Hosted runners vary from run to run, so a 95th percentile measured there moves without a code change. A budget is therefore missed only when it is exceeded by more than a stated tolerance on the named machine, and the benchmark runs on demand and on a schedule, not on every push.

**Outcome.** One command prints a table of timings for both namespace sizes and exits non-zero when a budget is exceeded by more than its tolerance. It runs under `pnpm eval` and in a continuous integration job, started by hand or on a schedule, on the same machine type each time, so a change that makes recall slower is seen in the next scheduled run.

**Scope.**
- A benchmark in `apps/mcp-server/evals/`.
- A generator of synthetic namespaces of 10,000 and 100,000 facts.
- Measurements of `recall`, `record_fact` and server start, and a reported time for `remember`.
- The budgets as data, the table, and the exit code.
- Its place in the eval job of FL-002, started by hand or on a schedule.
- The record of the first run, and of what followed from it.

**Non-goals.**
- An approximate vector index, a reranking model, and caching layers. Each is considered only if the benchmark shows a budget missed.
- Optimising anything before the benchmark shows a miss. Measure first.
- A budget for `remember`. It is reported.
- Timings on the owner's Mac. The owner may run the command there and record the result; the budgets are enforced on the continuous integration machine.
- Measuring the quality of answers: FL-033 and FL-057.
- Two processes writing at once, and load from several callers.

**Functional requirements.**
1. The generator builds a namespace of a given size in a new SQLite file: entities, facts and sources through `commit`, with vectors of the real embedding dimensions, 384 ([ADR 0014](../../architecture/adr/0014-local-embeddings-with-bge-small.md)). The vectors are pseudo-random from a fixed seed, so that building 100,000 facts does not need 100,000 runs of the embedding model. A fixed share of the facts is ended or invalidated, so that the time filter has work to do.
2. `recall` is measured through the `recall` use case with the real local embedder and the default settings, over a fixed set of questions, each asked a fixed number of times after one warm-up call. The table gives the 50th and the 95th percentile for each namespace size.
3. `record_fact` is measured through the `recordStructuredFacts` use case on the 10,000 and the 100,000 namespace, with the time spent inside the embedder subtracted. The table gives the 50th and the 95th percentile of what remains.
4. Server start is measured by starting `node` on the server's `main.ts` as a child process on the 10,000 namespace, with the embedding model already in the cache, and taking the time until the initialise request is answered. The table gives the median of a fixed number of starts.
5. `remember` is timed only when `ANTHROPIC_API_KEY` is set. Its time is printed in the table, marked as reported and not budgeted. Without a key the row says that it was not measured.
6. The budgets are one data structure that holds the four numbers of REQ-35, each with a tolerance stated beside it as a share of the budget. The first tolerance is 20 percent, a starting value that the first runs confirm or revise; a change is recorded in this work item. The table shows each measured value beside its budget and its tolerance.
7. The command exits with 0 when every budgeted value is within its budget plus its tolerance, and with a non-zero code otherwise. The output names each budget missed. A value above the budget but within the tolerance is printed as a warning and does not fail.
8. The output names the machine: the operating system, the processor architecture and model, the number of cores, and the Node and SQLite versions.
9. If the first run misses a budget, one of two things is recorded in this work item before it is completed: what was changed to meet the budget, with the timings before and after; or the revised budget, approved by the owner, with the new number written into REQ-35 in `REQUIREMENTS.md`.

**Technical requirements.**
1. The benchmark calls only exports of the packages and the server's entry point. It adds no export to a package.
2. A root script, `pnpm bench`, runs it, and `pnpm eval` runs it too ([`TESTING.md`](../../architecture/TESTING.md), "Four kinds of test"). It is not part of `pnpm check`, because it needs the real embedding model and building 100,000 facts takes longer than a check should.
3. The time inside the embedder is measured by wrapping the `Embedder` passed to the use case, not by estimating.
4. A clock for measuring durations is the one place in the evals where the real time is read. It is passed in as a dependency, and the unit tests of the percentile and budget functions use a fake.
5. The benchmark runs in the eval job of FL-002, on that job's one runner label, when the job is started by hand or by its schedule. It does not run on every push. Its output is kept as a job artefact or in the job log.
6. The percentile function and the budget comparison are pure and have unit tests.

**Constraints.**
- [`TESTING.md`](../../architecture/TESTING.md), "Layer B": evals live in `apps/mcp-server/evals/`.
- [ADR 0008](../../architecture/adr/0008-vector-search-on-a-plain-table.md): an exact scan on an ordinary table; measure again before changing it.
- [ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md): the time filter inside each lane.
- [Engineering principles](../../../.claude/rules/engineering-principles.md): no complexity without a measured problem; a measured result is labelled confirmed and cites the run.
- [Git rules](../../../.claude/rules/git.md): the workflow uses no secret, so the `remember` row is not measured in continuous integration.

**Acceptance criteria.**
- [x] `pnpm bench` builds both namespaces and prints a table with: `recall` at the 50th and 95th percentile for 10,000 and for 100,000 facts; `record_fact` excluding embedding at the 50th and 95th percentile; server start; and the `remember` row.
- [x] The output names the machine, as in functional requirement 8.
- [x] With every budget met, `pnpm bench` exits 0. With the `recall` budget for 10,000 facts lowered to 1 ms in a local run, it exits non-zero and names that budget. The output is recorded and the budget restored.
- [x] Unit tests pass with these names: "gives the 95th percentile of a list of durations", "reports a value above its budget and its tolerance as missed", "warns and does not fail for a value above its budget within its tolerance", "does not budget the remember row".
- [x] A test named "builds the same namespace from the same seed" builds 100 facts twice and compares the fact identifiers and the first vector.
- [x] The eval job of FL-002, started by hand, shows the benchmark with its table. Its address is recorded. The workflow file shows that the job runs by hand and on a schedule and not on a push.
- [x] The first run is recorded in this work item: the table, the machine, and for each budget "met", "met after a change" with the change named, or "revised" with the owner's approval and the new number in REQ-35.
- [x] `pnpm check` still exits 0 and does not run the benchmark.

**Validation.** The benchmark command, run locally and in the eval job. Unit tests of the percentile and budget functions on every check.

**Completion evidence.** The commit, the address of the workflow run, the table of the first run with the machine it ran on, and the record of each budget's outcome. Q-09 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) is updated with the timings on a file database.

**Recorded evidence.** Done on 2026-11-16, in the commits `feat(mcp-server): add the performance benchmark`, `ci: run the eval job and its benchmark weekly`, `ci: format the schedule of the eval job`, and `docs: record the first file database timings in Q-09`. The benchmark's entry is `apps/mcp-server/src/run-benchmark.ts`; the budgets, the percentile, the table and the generator are in `apps/mcp-server/evals/benchmark/`.

The first run, in the eval job of the workflow, started by hand: https://github.com/Enriquez-Johnmark/factloom/actions/runs/43919467899 . The job's log holds this table; building 10,000 facts took 2.1 s and 100,000 facts 23.9 s.

```text
Machine:
  Operating system: Linux 7.0.0-1017-azure
  Processor: x64, AMD EPYC 9V74 80-Core Processor, 4 cores
  Node.js v22.23.4, SQLite 3.54.1

| Measure | Value (ms) | Budget (ms) | Tolerance | Outcome |
|---|---|---|---|---|
| recall, 10,000 facts, p50 | 91.9 | none | none | reported |
| recall, 10,000 facts, p95 | 98.7 | 150 | 20% | met |
| record_fact excluding embedding, 10,000 facts, p50 | 1.6 | none | none | reported |
| record_fact excluding embedding, 10,000 facts, p95 | 6.0 | 50 | 20% | met |
| remember, median (reported) | not measured: ANTHROPIC_API_KEY is not set | none | none | not measured |
| server start, median of 5 | 553.1 | 2000 | 20% | met |
| recall, 100,000 facts, p50 | 330.9 | none | none | reported |
| recall, 100,000 facts, p95 | 350.4 | 500 | 20% | met |
| record_fact excluding embedding, 100,000 facts, p50 | 3.3 | none | none | reported |
| record_fact excluding embedding, 100,000 facts, p95 | 3.6 | 50 | 20% | met |

Every budget is met.
```

Outcome of each budget of REQ-35 on that first run: `recall` on 10,000 facts, met; `recall` on 100,000 facts, met; `record_fact` excluding embedding, met; server start, met. No budget was revised and nothing was changed to meet one. The tolerance stays at 20 percent.

A local run on the session's machine (Linux 6.18.44, x64, Intel Xeon at 2.10 GHz, 4 cores, Node.js v22.23.4, SQLite 3.54.1), with `ANTHROPIC_API_KEY` set for that command from the owner's key, met every budget: `recall` p95 52.7 ms on 10,000 facts and 278.0 ms on 100,000; `record_fact` p95 5.2 ms and 2.0 ms; server start 414.0 ms; `remember` 1,369.9 ms, reported. With the `recall` budget for 10,000 facts set to 1 ms in a local run, `pnpm bench` exited 1 and printed `| recall, 10,000 facts, p95 | 48.9 | 1 | 20% | missed |` and `Budgets missed: recall, 10,000 facts, p95.`; the file was restored, and `git diff` showed no change.

The workflow file runs the eval job on `workflow_dispatch` with the input `eval` and on a weekly `schedule`, Monday 04:17 UTC; the job's condition excludes `push`. `pnpm eval` runs the vitest eval tests and then `pnpm bench`. `pnpm check` exits 0 and does not run the benchmark.

Differences from the item:

- The command's entry is in `apps/mcp-server/src`, not `evals/`, because it builds the local embedder and starts `main.ts`; the boundary lint keeps `evals/` from importing `src` (the precedent of FL-033).
- Server start is measured with the child's home directory set to a temporary directory, so its model cache there is empty. The server loads the model on the first embedding and not at start (FL-058), so the start does not touch the cache either way.
- The SQLite version is read by running `node` in `packages/storage`, where `better-sqlite3` is installed, so that no package gains an export.
- The generator puts every fact under the multi-valued predicate `follows_convention`, so that no fact breaks the single-value rule; a fifth of the facts have an ended valid period and a tenth are invalidated.
- Extra unit tests: a value at its budget is met, each budget missed is named, and the generator ends a fifth and invalidates a tenth.

### FL-074: Token and tool-call comparison with and without Factloom

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-038 |
| Requirements | REQ-37 |
| Components | `apps/mcp-server` (evals), a fixture repository, the coding agent's own command line |

**Objective.** Measure whether a coding agent uses fewer tokens and makes fewer tool calls on the same tasks when Factloom is registered, and publish the result whatever it shows.

**Background.** Factloom's purpose for coding agents is to stop them re-discovering, every session, what the code does not show: decisions, conventions, reasons. The expected benefit is fewer tokens and fewer search and read calls. That is a goal, not a finding. Memory also costs tokens: tool definitions and every `recall` result enter the context, and one study found that repository context files raised cost by about 20% with no gain in task success ([software development research](../../research/industries/software-development.md), finding 1.14). So the saving has to be measured, and the measurement has to be able to show a loss.

**Outcome.** A table, committed to the repository, of token use, tool calls and task success with and without Factloom on a fixed set of tasks, and a statement in the root `README.md` that says exactly what the table shows.

**Scope.**
- A fixture repository and a fixed set of about ten tasks, each in two sessions. The first session gives the agent something worth knowing later, such as a decision and its reason, a convention, or the cause of a bug. The second session, started fresh, gives a task that depends on it.
- A runner that plays each task twice through the agent's non-interactive command line: once with the Factloom server registered and once without. It records, per session, input tokens, output tokens, the number of tool calls by tool, and whether the task's check passed.
- Each task has a check that passes or fails by running something, so that a cheaper wrong answer does not count as a saving.
- A report with the totals and the per-task differences, the agent and model used, and the date.

**Non-goals.**
- A claim of statistical significance. Ten tasks show a direction, not a law, and the report says so.
- A comparison with other memory systems.
- Tuning Factloom to the tasks. If a task reveals a weakness, the fix is a separate work item and the task stays in the set.

**Functional requirements.**
1. The task set and the checks are written and committed before any run, and are not changed after seeing results. A change is listed in the report with its reason.
2. The runner works with at least one of Claude Code and Codex. How each reports token use and tool calls from a non-interactive run is not verified in the research; the item starts by confirming it in the agent's current documentation, and cites the page.
3. The baseline run uses the agent as shipped, including its built-in file memory, because that is what a user already has for free.
4. Every figure in the report comes from the agent's own usage output. Nothing is estimated.
5. The report states the result plainly in each of three cases: a saving, no clear difference, or a cost.

**Technical requirements.**
1. The runner and the task set live in `apps/mcp-server/evals/`, with the other evals ([`TESTING.md`](../../architecture/TESTING.md)).
2. The runner is not part of `pnpm check` or `pnpm eval`: it needs a signed-in agent and spends real tokens. The owner starts it by hand.
3. Each run starts from a clean copy of the fixture repository and, for the Factloom runs, a new database file and namespace.
4. Secrets: the runner never prints or stores a key or a session token.

**Constraints.**
- Findings are labelled as measured or unverified, and nothing is stated as fact without its source ([engineering principles](../../../.claude/rules/engineering-principles.md)).
- Glossary terms are used exactly ([`GLOSSARY.md`](../../../GLOSSARY.md)).

**Acceptance criteria.**
- [x] The task set and its checks are committed in a commit that precedes the commit of the first results.
- [x] Unit tests of the report's arithmetic (totals, differences, medians) pass under `pnpm check`.
- [x] The owner runs the runner once per configuration and commits the raw usage output and the generated report. The report names the agent, the model, the date and the number of tasks.
- [x] The report has, for each task and in total, input tokens, output tokens, tool calls and pass or fail, with and without Factloom.
- [x] The root `README.md` states the measured result in one or two sentences that match the report, including when the result is no saving or a cost.
- [x] `pnpm check` still exits 0 and does not start the runner.

**Validation.** Unit tests for the report arithmetic on every check. The comparison itself is a manual run by the owner, because it needs a signed-in agent and spends tokens.

**Completion evidence.** The commit of the task set, the commit of the raw output and report, and the sentence added to `README.md`.

**Recorded evidence.** Prepared on 2026-11-25 on Linux x64 with Node.js v22.23.4, in a separate git worktree, and cherry-picked onto `main`. No agent session was started and no token was spent. The item is `Under Review`: the run, its raw output, the report and the `README.md` sentence (criteria 3 to 5) are the owner's, because they need a signed-in agent.

Commits, in order: `test(mcp-server): add the task set and checks of the agent comparison`, which comes before everything that depends on it; `feat(mcp-server): read token use and tool calls from a Claude Code session`; `feat(mcp-server): compare the agent runs and write the comparison report`; `feat(mcp-server): add the runner of the agent comparison`.

Built, in `apps/mcp-server/evals/agent-comparison/`: a fixture repository, `invoice-service`, with its own `node --test` tests; ten tasks of two sessions each, the first stating a decision, a convention or a cause and the second depending on it; a check per task, copied in only after the second session, with a reference answer that shows it can pass; a reader of Claude Code's stream-json output; the arithmetic of totals, per-task differences and medians; the report with a plain statement for a saving, no clear difference and a cost; and the runner, `pnpm run compare:agent`, with `--dry-run`, one configuration per run, a clean copy and a new database and namespace per task, and every result file passed through `checkForSecrets` before it is written. The outcome rule is fixed in code before any run: fewer checks passed with Factloom is a cost; otherwise a median per-task change in tokens of -10% or less is a saving, +10% or more a cost, and anything between no clear difference.

How Claude Code reports usage from a non-interactive run was read on 2026-11-25 from https://code.claude.com/docs/en/headless, https://code.claude.com/docs/en/cli-reference, https://code.claude.com/docs/en/agent-sdk/cost-tracking, https://code.claude.com/docs/en/agent-sdk/typescript, https://code.claude.com/docs/en/mcp, https://code.claude.com/docs/en/permissions and https://code.claude.com/docs/en/memory. Confirmed there: `-p` with `--output-format stream-json`, the result message's `usage` and per-model `modelUsage` (which includes subagents and which the page says to prefer), the `system/init` event with the model and the MCP servers' status, `--strict-mcp-config` and `--mcp-config`, and that auto memory is on by default. Unverified until the first run: whether stream-json needs `--verbose` (the runner passes it), whether `--strict-mcp-config` with no `--mcp-config` loads no server (the runner checks the servers of every session), whether the server's `env` overrides an inherited key, and whether `modelUsage` is cumulative across several results. Codex's `codex exec --json` usage was read at https://learn.chatgpt.com/docs/non-interactive-mode; Codex is not implemented, because the item asks for one agent.

67 tests, none of which starts `claude`: every check fails on the untouched fixture and passes with its reference answer; the stream reader; the arithmetic against hand-worked values; the three statements; the agent's arguments; and a result file withheld because it holds a credential. Three breaks of the arithmetic by hand each failed a test. The whole `--run` path was run with a stand-in `claude` script that prints canned output.

`pnpm check`:

```text
      Tests  1278 passed (1278)
```

Differences from the item: reference answers were added; the outcome rule is the agent's definition, as the item gives none; the owner's other MCP servers and claude.ai connectors are off in both configurations, so only Factloom differs; Factloom runs with no key for `remember`, so the agent records facts with `record_fact`; and the fixture's code is in `lib/`, because the boundary lint reads `**/src/**`.

For the owner: in a plain terminal, from `apps/mcp-server`, `pnpm run compare:agent --dry-run`, then `pnpm run compare:agent --run --configuration without --model <model>` and `pnpm run compare:agent --run --configuration with --model <model> --results <the first run's directory>`. That is 40 sessions in all, each cut off after 30 minutes. Then commit the results directory and add the README sentence that matches the report.

**The owner's run, 2026-11-26.** On the owner's Mac (Apple Silicon), Claude Code 2.1.332 with claude-sonnet-5-5, signed in with an API key (`apiKeySource` in each session's init event), both configurations on the same day: without Factloom from 09:27:00Z, with it from 09:33:22Z. 40 sessions, all ending in `success`; in all 20 sessions with Factloom the init event reports the server `connected`. Committed in `4a700b0` with the raw stream-json output, the check output and the generated [`report.md`](../../../apps/mcp-server/evals/agent-comparison/results/2026-11-26/report.md), merged in `84d3467`. The task set (`bc53b5e`) precedes them, and the report lists no change to it.

- **Result, as the report states it:** no clear difference. Median per-task change in input and output tokens +1.8%, inside the report's 10% band; total input tokens 1,859,692 without and 1,837,695 with, output 30,495 and 33,868; tool calls 96 and 98; checks 10 of 10 both ways. Per task the change runs from −34.2% (utc-dates) to +53.4% (refund-rounding).
- **What the run shows besides, measured from the raw output:** the agent made no Factloom tool call in any of the 20 sessions with Factloom. In the first session of every task, in both configurations, it wrote what it learned to Claude Code's auto memory, the `memory/` folder Claude Code keeps per project, and read it back in the second. The baseline keeping auto memory is functional requirement 3, so the run is as specified; what it measures is the cost of registering Factloom with an agent that does not use it. Why the agent prefers its built-in memory, and what makes it use Factloom, is FL-079.
- **Secrets:** the results were searched for key patterns (`sk-ant-`, `ANTHROPIC_API_KEY=`, bearer tokens): none. They name the owner's local user name in paths, and the two commits carry the Mac's default git identity, unsigned, not the project's; both are pushed and stay, as history is not rewritten.
- **`README.md`:** the sentence under "What it is for" states the result and that the agent did not call Factloom, in `1bac162`.

### FL-075: Property-based tests of the time rules

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-056, FL-067 |
| Requirements | REQ-38 |
| Components | `packages/core`, `packages/storage` (tests only) |

**Objective.** Check the rules that must always hold for memory against thousands of generated sequences of changes, not only against examples someone thought of.

**Background.** The unit tests and the contract suite check chosen examples. The architecture review found a real defect, overlapping valid periods, by trying cases the examples did not cover ([`DECISIONS.md`](../../architecture/DECISIONS.md)). A property-based test generates sequences of commits and checks invariants after each one. The invariants come from [`SCHEMA.md`](../../architecture/SCHEMA.md), "Rules the schema enforces", and from the error table of `commit` in [`INTERFACES.md`](../../architecture/INTERFACES.md).

**Outcome.** A defect in the time rules that no hand-written case covers is likely to be found by a generated one, and when it is, the failing sequence is printed in a form that can be replayed.

**Scope.**
- A generator of valid change sets over a small world: a few entities, a few predicates of both cardinalities, a few values, and dates from a short range, so that overlaps and boundaries are common.
- A property test in `storage` that applies a generated sequence to a store and checks the invariants after every commit.
- It runs against the in-memory store in this item. FL-076 runs the same generator against SQLite.
- One development dependency for property-based testing.

**Non-goals.**
- Comparing two stores: FL-076.
- Generating use-case inputs or text. The generator builds change sets, as the contract suite does.
- Generating changes of phases 2 and 3.

**Functional requirements.**
1. After every commit, accepted or refused, these hold: the number of facts listed with `'all'` has not gone down; no fact that was listed before has changed except by going from live to invalidated, once; no two live facts with the same subject and single-valued predicate have overlapping valid periods; every fact has at least one source; a refused commit leaves every read unchanged.
2. For a random as-of date and known-at date, `listFacts` with that time filter returns exactly the facts for which `matchesTimeFilter` is true among those listed with `'all'`.
3. A known-at question is stable: the answer for a known-at date in the past, taken after commit N, equals the answer taken after every later commit whose time is after that date.
4. Both lanes return only facts that pass the time filter, and never more than the limit.
5. The generator also produces changes that should be refused (a missing fact, a second invalidation, an overlapping fact), so that refusals are exercised and not only successes.

**Technical requirements.**
1. The library and its version are read from the npm registry and its documentation on the day, pinned exactly in the catalog, and cited in the commit. Its support for the Vitest version in use is checked first.
2. Every run uses a fixed seed that is printed, and a failure prints the seed and the shrunk sequence. A failure found once is added to the contract suite as a named case.
3. The number of generated sequences is set so that `pnpm check` stays fast; the number and the measured time are recorded.
4. The generator lives beside the contract suite in `storage` and is not exported from the package.

**Constraints.**
- [Testing rules](../../../.claude/rules/testing.md): no test depends on the real time or on random values that cannot be replayed.
- [Engineering principles](../../../.claude/rules/engineering-principles.md): few dependencies, each pinned and with a stated reason; no version stated from memory.
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): `core` imports no test framework in its source.

**Acceptance criteria.**
- [x] Property test "every commit keeps the rules of memory" passes with the recorded number of sequences and seed.
- [x] Property test "a read by time agrees with the time predicate" passes.
- [x] Property test "what was believed at a past date does not change later" passes.
- [x] Shown once by hand: with the single-value check removed from the in-memory store's commit, the first property test fails and prints a short sequence. The output is recorded and the check restored.
- [x] `pnpm check` exits 0, and the time the property tests add is recorded.

**Validation.** The property tests, run by `pnpm check`; the by-hand proof that they can fail.

**Completion evidence.** The commit, the passing `pnpm check` output with the seed and the number of sequences, and the recorded failing output of the by-hand proof.

**Recorded evidence.** Completed on 2026-11-15, in two commits: `build(storage): add fast-check 4.10.2 for property-based tests` and `test(storage): add property-based tests of the rules of memory`. The generator is `packages/storage/src/change-sequence-generator.ts` and the tests are `memory-store-properties.test.ts` beside it.

`pnpm check`, on Linux x64 with Node.js v22.23.4, ended with:

```text
 Test Files  18 passed (18)
      Tests  253 passed (253)
```

The three property tests each run 300 generated sequences with the fixed seed 20261115, against the in-memory store. A sequence has 1 to 12 steps. Run alone, the file takes about 2 seconds of wall time, most of it start-up.

The proof that the tests can fail. With the single-value check removed from the in-memory store's commit, "every commit keeps the rules of memory" failed on the eighth sequence and shrank it to two steps. The check was then restored and `pnpm check` passed again:

```text
Error: Property failed after 8 tests
{ seed: 20261115, path: "7:2:2:3:3", endOnFailure: true }
Counterexample: [[{"kind":"record","subject":0,"predicate":1,"value":0,"from":null,"to":null},{"kind":"record","subject":0,"predicate":1,"value":0,"from":null,"to":null}]]
Shrunk 4 time(s)
Caused by: AssertionError: f-1 and f-2 overlap for single_b: expected true to be false
```

With the code as it is, the properties found no defect in the in-memory store.

How it is built, where the item left a choice:

- The library is fast-check 4.10.2. It runs inside ordinary Vitest tests, so it needs no adapter for the test runner.
- A sequence is a list of intentions: record a fact, invalidate one with or without a replacement, end one, attach a source, invalidate a missing fact. Each becomes a change set when it meets the store's state, because only then is it known which facts exist. A step picks among all facts ever recorded, live or not, so refusals are generated as well as successes.
- The world is two subjects, two single-valued predicates and one multi-valued predicate, three values, and valid dates from a stretch of twenty days. That keeps overlaps and boundary dates frequent.
- The first test also asserts that the run produced more than 300 accepted and more than 150 refused commits, so that it cannot pass by generating only one kind.
- The second test checks both lanes as well as `listFacts`: each returns only facts that pass the time filter, and exactly as many as the limit allows.

### FL-076: Differential tests between the in-memory store and SQLite

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-075, FL-068, FL-016, FL-017 |
| Requirements | REQ-38 |
| Components | `packages/core`, `packages/storage` (tests only) |

**Objective.** Apply the same generated sequences of changes to the in-memory store and to the SQLite adapter, and require the two to answer every read identically.

**Background.** The in-memory store and the SQLite adapter are two independent implementations of `MemoryStore`. The contract suite checks both against chosen cases. Two implementations rarely share the same defect, so any difference between them on a generated sequence is a defect in one of them or a gap in [`INTERFACES.md`](../../architecture/INTERFACES.md).

**Outcome.** The in-memory store, which every use-case test relies on, is known to behave as the real adapter does on far more inputs than the contract suite lists.

**Scope.**
- A property test that applies each generated sequence of FL-075 to both stores.
- After every commit it compares: the result of the commit (success, or the error code and related facts); `listFacts` for several time filters and for `'live'` and `'all'`; `getFact`; `findEntities`; `getSource`; `listAuditEntries`.
- The set of facts each lane returns for a query, compared as a set.

**Non-goals.**
- Comparing the order of lane results. The two stores rank differently by design ([ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md)); only the set of facts within the limit of an unlimited query is compared.
- Comparing error messages. Codes and related facts are compared.
- Performance: FL-066.

**Functional requirements.**
1. A difference fails the test and prints the seed, the shrunk sequence, the read that differed and both answers.
2. Each difference found is settled in one of three ways, and the choice is recorded: the in-memory store is corrected, the adapter is corrected, or `INTERFACES.md` is made specific and both are brought to it. A case for it is added to the contract suite.
3. Audit entry identifiers are compared by order within a namespace, not by value, if the two stores number them differently.

**Technical requirements.**
1. The SQLite store is opened in memory for each sequence, so the test needs no file and leaves none.
2. The number of sequences and the time they take are recorded, and `pnpm check` stays fast.

**Constraints.**
- [Testing rules](../../../.claude/rules/testing.md): no test depends on the real time or on random values that cannot be replayed.
- [Engineering principles](../../../.claude/rules/engineering-principles.md): few dependencies, each pinned and with a stated reason; no version stated from memory.
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): `core` imports no test framework in its source.

**Acceptance criteria.**
- [x] Property test "the in-memory store and SQLite give the same answers" passes with the recorded number of sequences and seed.
- [x] Every difference found while writing the item is listed in the completion evidence with how it was settled.
- [x] Shown once by hand: with the time predicate of one store changed from `>` to `>=` at a period's end, the test fails. The output is recorded and the change undone.
- [x] `pnpm check` exits 0.

**Validation.** The differential property test, run by `pnpm check`; the by-hand proof that it can fail.

**Completion evidence.** The commit, the passing output with seed and number of sequences, and the list of differences found and how each was settled.

**Recorded evidence.** Completed on 2026-11-16, in the commit `test(storage): add differential tests between the in-memory store and SQLite`. The test is `packages/storage/src/memory-store-differential.test.ts`. It reuses the generator of FL-075, `change-sequence-generator.ts`, unchanged.

The property test "the in-memory store and SQLite give the same answers" runs 200 generated sequences with the fixed seed 20261116. A sequence has 1 to 12 steps and 1 to 3 time filters. Each sequence opens a new SQLite store on `:memory:` and a new in-memory store, seeds both, and applies every step to both. After each commit it compares:

- the result of the commit: success with its receipt, or the error code and the related facts, sorted;
- `listFacts` with `'all'`, with `'live'`, and with each time filter, whole and in order;
- for each time filter, the facts the vector lane and the keyword lane return for an unlimited query, as sets;
- `getFact` for every fact and for a missing identifier, and `listFacts` by `supersededByFactId` for every fact;
- `findEntities` for each subject, `getSource` for the source of every step so far and for a missing one;
- `listAuditEntries` for every fact, subject and source.

The test also asserts that the run produced more than 200 accepted and more than 100 refused commits, so that agreeing on both outcomes is not vacuous. Run alone, the file takes 4.7 seconds. With it, the test step of `pnpm check` took 6.2 seconds on this machine, and the whole check 8.0 seconds.

**Differences found: none.** No difference between the two stores was found while writing the item, so none had to be settled and no case was added to the contract suite.

What differs from the work item as written:

- The components line names `packages/core` as well. The test lives in `packages/storage` only, because it needs both stores and `core` cannot import the SQLite adapter.
- Functional requirement 3 did not apply: on the same sequence in one namespace, the two stores number audit entries identically, so they are compared by value.
- The change set of each step is built from the facts the in-memory store holds. That `listFacts` with `'all'` agrees after every step is part of what is compared.
- `listFacts` filtered by subject, by predicate or by `touchingEntityIds` is not compared, nor are lanes for query vectors and texts other than one of each. The scope lists neither.

The proof that the test can fail. With the SQLite time predicate's end of valid time changed from `f.valid_to > @validAt` to `f.valid_to >= @validAt`, the test failed on the fifth sequence and shrank it to one fact ending on the as-of date. The change was then undone and the test passed again:

```text
Error: Property failed after 5 tests
{ seed: 20261116, path: "4:0:0:0:4:7:6:6:6:7:7:1:0:1:0:0:1", endOnFailure: true }
Counterexample: [[{"kind":"record","subject":0,"predicate":0,"value":0,"from":null,"to":0}],[{"validAt":"2025-01-01T00:00:00.000Z","knownAt":"2026-01-02T00:00:00.000Z"}]]
Shrunk 16 time(s)
Caused by: AssertionError: the SQLite store and the in-memory store differ on listFacts at {"validAt":"2025-01-01T00:00:00.000Z","knownAt":"2026-01-02T00:00:00.000Z"}: expected { ok: true, value: [ { …(4) } ] } to deeply equal { ok: true, value: [] }
```

Two further changes, each made by hand in the in-memory store and each restored, made the test fail: `listFacts` returning the oldest fact first ("differ on listFacts with 'all'"), and the keyword lane reading without the time filter ("differ on the keyword lane at ...").

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed: https://github.com/Enriquez-Johnmark/factloom/actions/runs/43799381889.

`pnpm check`, on Linux x64 with Node.js v22.23.4. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 118 files. No fixes applied.
$ biome lint .
Checked 118 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  39 passed (39)
      Tests  554 passed (554)
```

Follow-up on 2026-11-16, in the commit `fix(storage): give the differential test a time limit of its own`. A later workflow run, https://github.com/Enriquez-Johnmark/factloom/actions/runs/43800490944, failed on the job for Linux with Node.js 22: "Error: Test timed out in 5000ms" for "the in-memory store and SQLite give the same answers". The test takes about five seconds here, at Vitest's default limit, and had passed in the run recorded above by a small margin. It now has a limit of its own, 60 seconds, as a named constant. The number of sequences, the seed and every assertion are unchanged. The next runs passed: https://github.com/Enriquez-Johnmark/factloom/actions/runs/43800626684.

### FL-077: Mutation-testing trial on core

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-008, FL-009, FL-010, FL-011 |
| Requirements | REQ-38 |
| Components | `packages/core`, `packages/storage` (tests only) |

**Objective.** Find out whether a mutation-testing tool works with this toolchain, and if it does, use it once on `core` to find tests that cannot detect a defect.

**Background.** A mutation-testing tool makes small changes to the code, such as replacing `<` with `<=`, and runs the tests against each. A change that no test notices marks a gap. This measures whether tests can detect a defect, which a coverage percentage does not. Whether any such tool supports the versions in use, Vitest and TypeScript as pinned in the catalog, is not verified; this item is a trial for that reason.

**Outcome.** Either a list of gaps in the tests of `core` with each one closed or justified, or a recorded finding that no tool works with the toolchain yet.

**Scope.**
- Check the candidate tools' current documentation and registry entries for support of the pinned Vitest and TypeScript versions.
- If one works: run it on `packages/core/src`, excluding test files and the test helpers.
- For each surviving change: add a test that catches it, or record why it is equivalent or does not matter.
- Record the result in this work item.

**Non-goals.**
- A mutation score as a target or a gate in `pnpm check` or in continuous integration. A run is slow, and a target invites tests written to a number.
- Running it on `storage`, `graph-rag` or the app. That is decided from what this trial shows.
- Keeping the tool as a dependency if the trial shows it is not worth it.

**Functional requirements.**
1. The trial ends in one of two recorded outcomes: the tool ran and its surviving changes were handled, or no tool supports the toolchain, with the evidence.
2. If the tool ran, the functions that carry the rules are covered by it: `periodsOverlap`, `matchesTimeFilter`, the single-value check and the audit detail in the in-memory store's commit, `parseDateInput`, and each fact operation.
3. A test added for a surviving change has a name that states the behaviour, as every other test does.

**Technical requirements.**
1. The tool and its version are read from the registry and its documentation on the day and cited. If it is kept, it is pinned exactly in the catalog; if not, it is removed and the lockfile restored.
2. The run is started by its own command, not by `pnpm check`.

**Constraints.**
- [Testing rules](../../../.claude/rules/testing.md): no test depends on the real time or on random values that cannot be replayed.
- [Engineering principles](../../../.claude/rules/engineering-principles.md): few dependencies, each pinned and with a stated reason; no version stated from memory.
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): `core` imports no test framework in its source.

**Acceptance criteria.**
- [x] The work item records which tools were checked, with the page that states their support, and the outcome.
- [x] If a tool ran: the number of changes made, killed and surviving is recorded, and every surviving change in the listed functions has a new test or a written reason.
- [x] `pnpm check` exits 0 and does not start the tool.

**Validation.** The tool's own report, and the tests added because of it.

**Completion evidence.** The commit or commits, the recorded outcome, and the tool's summary if it ran.

**Recorded evidence.** Completed on 2026-11-16. **Outcome: the tool ran, and its surviving changes in the listed functions were handled.** The commits: `build: add StrykerJS 10.1.1 for a mutation run of core`, `chore: ignore the working directory of a mutation run`, `test(core): close the gaps in the fact operations that the mutation run found`, `test(storage): add contract cases for revised copies and a fact invalidated in its own change set`, and `test(storage): add a correction from one entity object to another to contract case C10`.

**The tools checked.**

| Tool | Version on 2026-11-16 | What states its support | Result |
|---|---|---|---|
| `@stryker-mutator/core` | 10.1.1, `latest` (`npm view`) | `engines: node >=22.0.0` | Runs on Node.js v22.23.4 |
| `@stryker-mutator/vitest-runner` | 10.1.1, `latest` | Peer range `vitest >=2.0.0`; https://stryker-mutator.io/docs/stryker-js/vitest-runner/ ("Since v7.0") names no upper bound | Runs with Vitest 5.1.0 |
| `@stryker-mutator/typescript-checker` | 10.1.1, `latest` | Peer range `typescript >=3.6` | Not installed: it uses the TypeScript compiler API, which TypeScript 7.0.2 does not ship (below) |

**What it took to run, all confirmed by running:**

- A sandboxed run fails before any test with `TypeError: ts.parseConfigFileTextToJson is not a function`. Stryker's tsconfig preprocessor loads `typescript`, and the TypeScript 7.0.2 package exports two keys and no compiler API. The documented `inPlace` mode skips the preprocessor. It also suits this workspace: in a sandbox copy, `packages/storage` would import `@factloom/core` through the original workspace links and test the unmutated core. In place, Stryker backs the files up in `.stryker-tmp` and restores them; after each run `git status` showed no change.
- pnpm does not place the runner where Stryker's default plugin pattern looks, so the configuration names `@stryker-mutator/vitest-runner` in `plugins`.
- The configuration is `stryker.config.json`, and the command is `pnpm mutate:core`. `pnpm check` does not start it: its output has no line from Stryker.

**The first run,** on `packages/core/src` without the test files and the three test helpers, with the tests of `vitest.config.ts` related to each mutated file, which include the storage contract suite and the property and differential tests. 1,244 mutants in 23 files, 10 minutes 27 seconds on four cores, 19.87 tests per mutant on average:

```text
File                          |  total | covered | # killed | # timeout | # survived | # no cov | # errors |
All files                     |  84.73 |   87.32 |     1053 |         1 |        153 |       37 |        0 |
 valid-period.ts              | 100.00 |  100.00 |       62 |         0 |          0 |        0 |        0 |
```

`valid-period.ts`, which holds `periodsOverlap` and `matchesTimeFilter`, killed every mutant. `parseDateInput` itself had no survivor; five survived in `isTimestamp` and `TimestampSchema`, which it uses.

**The survivors in the listed functions** (the fact operations, the single-value check and the audit detail of the in-memory store's commit, and the timestamp functions), by mutant number in the report, and what was done:

New tests, each of which kills the mutants named, checked in the second run:

- `findConflictCandidates`: "returns the newest candidate when the limit is 1" (892), "returns invalid_input for a period that ends where it starts" (907), "returns a storage failure as it is" (916).
- `invalidateFact`: "keeps the end a replacement gives when it gives no start" (961), "returns already_invalidated with no related fact for a fact that was retracted" (1088, 1090), "returns a storage failure as it is" (1071).
- `endFact`: "refuses a successor whose predicate the domain does not have, and changes nothing" (866), "returns conflict when a later end would overlap another live fact" (868, 870, 875, 878), "ends a fact whose predicate the domain no longer has" (877).
- `recordFacts`: "records nothing when the embedder returns fewer vectors than statements" (1040, 1042, 1043).
- The contract suite, run against both stores: "C9: an ended copy of a fact whose object is an entity names the fact it revises" (218, 221, 222, 224 to 226, 228, 229), "C10: a replacement with another object, object kind, subject or predicate names no revised fact" (227, 243, 257 to 260, 263, 265), "A5: a fact that its own change set records and invalidates is not held to the rule" (475, 476, 479). Both stores pass all three; the counts of registered cases in the two contract test files rose with them, from 41 to 43 and from 15 and 16 to 16 and 17.

Written reasons:

- **Message text** (StringLiteral and the like: 896, 911, 853, 987, 993, 1014, 1015, 1023, 1024, 1026, 1044, 1076, 1081 to 1085, 1109, 1176, 1177, 512, 513). The testing rules assert error codes, not message text. 1081 to 1083 only choose between two messages.
- **Equivalent, because a later check gives the same result.** `endFact`'s check that the end is after the start (844, 846, 847, 849, 851): the store refuses an empty or reversed period with the same `invalid_input`, and nothing is written. `findConflictCandidates` with one bound `null` (901, 902, 904): comparing a timestamp with `null` is always false. The full-form and calendar-date patterns without an anchor (1133, 1148): the round trip or the anchored full form still refuses the text. A value that is not a string (1173): it never equals its own round trip.
- **Equivalent, because the case cannot arise.** One draft gives exactly one prepared fact (884, 930, 977, 1050, 1052). Both uses of an empty successor list filter it by kind (808). A duplicate key in a `Map` is set to the same value (999). `listFacts` already returns newest first, so sorting again changes nothing (917, 920). A change other than `record_fact` has no `singleValued` (470). Every recorded fact exists after the changes apply (477). The entity identifier is the primary key across namespaces, so two facts with the same subject are in one namespace (497). The `default` branch of `detailOf` is unreachable by its type (285, 286). An entity object and a value object compare unequal on every path (219, 220, 223, 230, 232, 233, 236).
- **Equivalent for every change set the fact operations build** (247 to 249, 252, 261): each holds at most one invalidation, of a fact stored before the commit and linked to the recorded fact. A change set built by hand that records two facts and invalidates one by the other would reach them.
- **Not testable without asserting on a call** (1035): the purpose `statement` sent to the embedder. The fake embedder ignores the purpose by design, and the testing rules forbid asserting which arguments a call received.

**The second run,** with the new tests and before the case for 227: 1,244 mutants, 10 minutes 8 seconds.

```text
File                          |  total | covered | # killed | # timeout | # survived | # no cov | # errors |
All files                     |  87.54 |   89.26 |     1088 |         1 |        131 |       24 |        0 |
```

Mutant 227, a correction from one entity object to another, still survived; C10 gained that replacement, and a run of `pnpm mutate:core --mutate 'packages/core/src/in-memory-store.ts:84-112'` then killed it.

What differs from the work item as written:

- None of the new tests failed against the code as it was: the run found gaps in the tests and no defect in `core`.
- The mutants outside the listed functions were not handled: in the second run, 73 survived and 21 were not covered. They are in `fact.ts` (13), `change-set.ts` (5 survived, 2 not covered), `domain.ts` (2), `audit.ts` (1), and the rest of `in-memory-store.ts` (52 survived, 19 not covered: 28 in `applyChange`, which checks each change, 36 in the reads and the two lanes, 7 in small helpers). Whether to handle them is for the owner, with whether to run the tool on `storage`.
- The tool is kept, pinned in the catalog, because it found gaps that the contract suite, the property tests and the differential test had all missed. The tests it led to are what remains of value if it is removed later.

`pnpm check`, on Linux x64 with Node.js v22.23.4, with `.cache/models` present. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 125 files. No fixes applied.
$ biome lint .
Checked 125 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  41 passed (41)
      Tests  583 passed (583)
```

The workflow runs for these commits passed on Linux and macOS arm64: https://github.com/Enriquez-Johnmark/factloom/actions/runs/43802767744 and https://github.com/Enriquez-Johnmark/factloom/actions/runs/43804148703.

### FL-081: Token comparison on why-did-this-change tasks

| | |
|---|---|
| Status | Under Review |
| Phase | 1 |
| Depends on | FL-074, FL-080 |
| Requirements | REQ-37 |
| Components | `apps/mcp-server` (evals), a fixture repository with a git history, the runner of FL-074 |

**Objective.** Measure whether Factloom saves tokens and tool calls when what the agent needs is why, or when, the code changed: knowledge that the code does not show and that an agent without memory digs for in the git history. Publish the result whatever it shows.

**Background.** The three comparisons of FL-074, FL-079 and FL-080 ([third report](../../../apps/mcp-server/evals/agent-comparison/results/2026-11-26-third/report.md)) gave the agent its knowledge in the first session's prompt, with a request to remember it. Claude Code's file memory keeps that as well as Factloom does, and with the recall hook the two came out level. A reason for a change is different: it is often only in a commit message, and an agent finds it with `git log`, `git blame` and `git show`, a turn each, while Factloom holds it as a fact with when it became true ([`GLOSSARY.md`](../../../GLOSSARY.md), "valid time"), and can answer what was true before. That is where Factloom is expected to save the most, and it is not measured. Asked for by the owner on 2026-11-26.

**Outcome.** A second task set and a report, committed, of token use, tool calls and task success on it with and without Factloom, and a statement in the root `README.md` of what the report shows.

**Scope.**
- A fixture repository with a git history, built by a script so that it is the same on every run, in which several functions changed, each commit message giving the reason.
- About ten tasks, each in two sessions. In the first, the agent makes a change and is told why, and commits it with that reason. In the second, started fresh, it gets a task whose right answer depends on why or when something changed: for example a request to "simplify" a function back to what the change replaced.
- At least two tasks ask about the past, such as the value of a setting before a change, answered in a file that the check reads.
- Each task has a check that passes or fails by running something, so that a cheaper wrong answer does not count as a saving.
- The runner of FL-074 plays the set, with the configurations of FL-080: without Factloom, Claude Code as shipped, auto memory on; with Factloom, as the registration guide sets it up, auto memory off and the recall hook.

**Non-goals.**
- Changing the task set of FL-074, or its results.
- A claim of statistical significance. About ten tasks show a direction, not a law, and the report says so.
- Tuning Factloom to the tasks. A weakness the tasks reveal becomes a separate work item, and the task stays in the set.
- Factloom reading the git history by itself. The fact reaches memory as the guide says: the agent records it, or `remember` extracts it.

**Functional requirements.**
1. The task set, the fixture's history and the checks are committed before any run, and are not changed after seeing results. A change is listed in the report with its reason.
2. In every task the reason is in the git history, so that the run without Factloom can find it; a task the baseline cannot answer at all would measure knowledge, not cost.
3. Every figure in the report comes from the agent's own usage output. Nothing is estimated.
4. The report states the result plainly in each of three cases: a saving, no clear difference, or a cost.

**Technical requirements.**
1. The task set lives in `apps/mcp-server/evals/`, beside the agent comparison, and the runner takes the set to play as an option; the set of FL-074 stays the default.
2. The runner is not part of `pnpm check` or `pnpm eval`: it needs a signed-in agent and spends real tokens. The owner starts it by hand.
3. Each run starts from a clean copy of the fixture, with its history, and, with Factloom, a new database file and namespace.
4. Secrets: as in FL-074, nothing prints or stores a key or a session token, and the home directory is shown as `~`.

**Constraints.**
- Findings are labelled as measured or unverified, and nothing is stated as fact without its source ([engineering principles](../../../.claude/rules/engineering-principles.md)).
- Glossary terms are used exactly ([`GLOSSARY.md`](../../../GLOSSARY.md)).

**Acceptance criteria.**
- [x] The task set, the fixture's history and the checks are committed in a commit that precedes the commit of the first results.
- [x] Unit tests show each check passing on one solution and failing on the fixture as it is, and the fixture's history being the same on every build.
- [ ] The owner runs the runner once per configuration and commits the raw usage output and the generated report. The report names the agent, the model, the date and the number of tasks.
- [ ] The root `README.md` states the measured result in one or two sentences that match the report, including when the result is no saving or a cost.
- [x] `pnpm check` still exits 0 and does not start the runner.

**Validation.** Unit tests for the fixture's build and the checks on every check; the comparison is a manual run by the owner, because it needs a signed-in agent and spends tokens.

**Completion evidence.** The commit of the task set, the commit of the raw output and report, and the sentence added to `README.md`.

**Recorded evidence.** Prepared on 2026-11-26 on Linux x64 with Node.js v22.23.4. The item is `Under Review`: the two runs and the `README.md` sentence (criteria 3 and 4) are the owner's, because they need a signed-in agent and spend tokens.

- **The runner.** `a355fb4` lets a task's check come from another set's directory; `aec46bd` lets a task carry the commit of its first session; `a0b1173` adds `--task-set` (default `memory`, the set of FL-074), names the set in the run log and in the report's "Tasks" row, reads a run log written before this item as one of the memory set, and commits a task's first session with its message, `--allow-empty`, after session 1 in both configurations (functional requirement 2). `56a1d8b` adds the set to the runner, with a test that run logs of two sets are refused in one report.
- **The task set (`be205b8`), written in a separate git worktree by a helper agent and reviewed here.** `apps/mcp-server/evals/change-history/`: a `shipping-service` fixture with a scripted history of 21 commits, the base and 20 steps dated every five days from 2026-03-02 to 2026-06-10, most of them unrelated to the tasks, with a fixed identity and dates and signing off, so the HEAD hash is the same on every build; ten tasks, seven `change reason` and three `earlier value`; a check per task and three reference answers each (`first`, `second`, and `wrong`, a session 2 that ignores the reason). The reasons are only in commit messages, which the tests check against the tree. Session-2 prompts do not name the earlier change.
- **Criterion 1:** the set is committed in `be205b8`, before any results.
- **Criterion 2:** 51 tests in `change-history-tasks.test.ts`: the history builds to the same HEAD twice; the fixture's own tests pass; for each task the check fails on the untouched fixture, fails after a right first session alone, passes after a right second session, and fails on the `wrong` answer.
- **Dry run:** `pnpm run compare:agent --dry-run --task-set change-history` printed `10 tasks, 20 sessions per configuration. No agent was started.`, with every check failing on the untouched fixture.
- **Known limits of the set, from the helper agent's review and mine.** Two tasks, `ascii-address-lines` and `label-timeout`, tempt only mildly: an agent that ignores the reason can still pass by keeping its fix local, so they measure cost more than they discriminate. `signature-threshold`'s second prompt asks to leave parcels "without asking for a signature"; passing means keeping the signature above 300 euros, which is right only because of the reason. `label-timeout`'s check expects the timeout through `transport.send`'s documented `timeoutMs`.
- **`pnpm check`:** 132 test files, 1,347 tests passed.
