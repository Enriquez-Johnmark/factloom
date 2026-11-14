# EPIC-07: Evaluation

| | |
|---|---|
| Status | Pending |
| Phases | 0-2 |
| Packages | `apps/mcp-server` (the directory `evals/`), exercising `packages/graph-rag`, `packages/core` and `packages/storage` |
| Requirements | REQ-30, REQ-35, REQ-37 |

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
| FL-027 | Timeline scenarios as reviewed data | 0 | FL-006, FL-018 | Pending |
| FL-028 | Record-and-replay wrapper for the LLM client | 1 | FL-006, FL-027 | Pending |
| FL-029 | Extraction cases | 1 | FL-018, FL-027 | Pending |
| FL-039 | Scenario runner | 2 | FL-027, FL-028, FL-069, FL-025, FL-032, FL-015 | Pending |
| FL-066 | Performance benchmark and budgets | 1 | FL-002, FL-058, FL-035 | Pending |
| FL-074 | Token and tool-call comparison with and without Factloom | 1 | FL-038 | Pending |

### FL-027: Timeline scenarios as reviewed data

| | |
|---|---|
| Status | Pending |
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
- [ ] Test "every scenario file matches the scenario schema" passes and reports eleven files.
- [ ] Test "rejects a scenario with an unknown key" passes, and so do "rejects a step with no input", "rejects an ask with no expected values" and "rejects steps that are out of order", each on an inline example.
- [ ] Test "covers every case in the table" passes: each of the eleven case names appears in exactly one file's `name`.
- [ ] Test "every ask about the past states a date" passes: each file whose row mentions an earlier date has an `ask` with `as_of` or `known_at`.
- [ ] Test "every scenario uses only entity types and predicates of the software development domain" passes, and "rejects a scenario that names a predicate the domain does not have" passes on an inline example.
- [ ] Review by the owner: the owner reads each file and checks every expected value against the row of the table, by hand. The owner records, per file, "reviewed" and the date in the completion evidence. A file changed after its review is reviewed again.
- [ ] `git grep -n "evals/" -- apps/mcp-server/src` shows no import.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests in `apps/mcp-server/evals/` for the schema and the loader; the owner's review of the data.

**Completion evidence.** The commit, the passing `pnpm check` output, and the owner's review record per file. The `entities` kind of expectation is added to the file format shown in [`TESTING.md`](../../architecture/TESTING.md), "Layer B", in its own commit.

### FL-028: Record-and-replay wrapper for the LLM client

| | |
|---|---|
| Status | Pending |
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
- [ ] Unit test "replays a recorded response without calling the inner client" passes, with an inner client that throws when called.
- [ ] Unit test "throws and names the missing recording when none exists" passes.
- [ ] Unit test "records a response and then replays it" passes, in a temporary directory.
- [ ] Unit test "uses another recording when the instructions change" passes, and the same for the input, the task, the schema and the model label: five cases.
- [ ] Unit test "returns llm_failed when a recording no longer matches the schema" passes.
- [ ] Unit test "writes nothing when the inner client fails" passes.
- [ ] Unit test "writes the same bytes when the same response is recorded twice" passes.
- [ ] Unit test "a recording holds only the task, the model label, the instructions, the input and the response" passes.
- [ ] `pnpm check` exits 0 with the network unavailable to the test process.

**Validation.** Unit tests in `apps/mcp-server/evals/`, on temporary directories, with an inner client written in the test.

**Completion evidence.** The commit and the passing `pnpm check` output.

### FL-029: Extraction cases

| | |
|---|---|
| Status | Pending |
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
- [ ] Test "every extraction case matches the case schema and the domain" passes and reports the number of files, which is 18 or more.
- [ ] Test "every listed kind of case is present" passes, from a tag on each case.
- [ ] Unit test "counts a fact as matched when subject, predicate, object and dates agree" passes.
- [ ] Unit test "does not match a fact whose valid_from differs" passes.
- [ ] Unit test "matches across upper case and spacing" passes.
- [ ] Unit test "reports precision and recall for the set" passes: with a stub extraction function that returns a known mix of right, wrong and missing facts over three inline cases, the report's numbers equal hand-computed values written in the test.
- [ ] Unit test "counts a forbidden fact that was extracted" passes.
- [ ] Unit test "reports a failed extraction as a failure and no extracted facts" passes.
- [ ] Test "every case with an expected fact marks one as required" passes, and the schema rejects an expected fact with no `required` field, on an inline example.
- [ ] Review by the owner: the owner reads each case and checks the expected facts, and which of them are required, against the text. The owner records, per file, "reviewed" and the date in the completion evidence.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests in `apps/mcp-server/evals/` for the scorer, with a stub function; a validation test of the data; the owner's review. The run through `remember`, in replay, is FL-069.

**Completion evidence.** The commit, the passing `pnpm check` output, the number of cases per kind, and the owner's review record.

### FL-039: Scenario runner

| | |
|---|---|
| Status | Pending |
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
- [ ] `pnpm check` exits 0 with no API key set, and its output contains the report with the four metrics and one line per scenario.
- [ ] By hand, once, by the owner in the session: with `ANTHROPIC_API_KEY` set in the environment and nowhere else, the owner runs `pnpm run record:scenarios` from `apps/mcp-server`. It ends with exit code 0. The owner reads the diff of the new recordings for secrets and records the model identifier. Until this step is done nothing of this item is committed, and the item is not `Completed`.
- [ ] Nine scenarios pass: restatement, multi-valued predicate, unrelated fact about the same subject, older fact arriving late, a known name mentioned under a different entity type, a date in the text, no date in the text, a plan, and retraction.
- [ ] Unit test "an entities expectation counts the entities with a name of any type" passes, on an inline scenario.
- [ ] The succession and correction scenarios are run and reported as failing, with the stale value named. Staleness rate, false invalidation rate, missed invalidation rate and historical accuracy are recorded as the baseline before self-correction.
- [ ] False invalidation rate is 0 on the nine passing scenarios.
- [ ] Unit test "a listed scenario that passes fails the check" passes, on an inline scenario.
- [ ] Unit test "an ask reads memory through listFacts with both dates" passes: with a store wrapper that fails on `searchFactsByVector` and `searchFactsByKeyword`, a scenario still runs to the end.
- [ ] Unit tests of the four metric functions pass, each against a hand-computed value written in the test.
- [ ] Unit test "fails with the file and the predicate when a scenario names a predicate the domain does not have" passes.
- [ ] With one recording removed in a local run, `pnpm check` exits non-zero and names the missing recording. The output is recorded and the file restored.
- [ ] Two runs of `pnpm test` in a row print the same report, byte for byte.
- [ ] `git grep -n "API_KEY" -- apps/mcp-server/evals` shows no line that holds a key's value. The owner reads the diff of the recordings before the push and records that it was done.

**Validation.** Eval: the eleven scenarios in replay, inside `pnpm check`. Unit tests of the metric functions and the gating list. One live recording run by the owner, by hand.

**Completion evidence.** The commit, the passing `pnpm check` output with the report, the four baseline numbers, the model the recordings were made with, and the output of the run with a recording removed.

### FL-066: Performance benchmark and budgets

| | |
|---|---|
| Status | Pending |
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
- [ ] `pnpm bench` builds both namespaces and prints a table with: `recall` at the 50th and 95th percentile for 10,000 and for 100,000 facts; `record_fact` excluding embedding at the 50th and 95th percentile; server start; and the `remember` row.
- [ ] The output names the machine, as in functional requirement 8.
- [ ] With every budget met, `pnpm bench` exits 0. With the `recall` budget for 10,000 facts lowered to 1 ms in a local run, it exits non-zero and names that budget. The output is recorded and the budget restored.
- [ ] Unit tests pass with these names: "gives the 95th percentile of a list of durations", "reports a value above its budget and its tolerance as missed", "warns and does not fail for a value above its budget within its tolerance", "does not budget the remember row".
- [ ] A test named "builds the same namespace from the same seed" builds 100 facts twice and compares the fact identifiers and the first vector.
- [ ] The eval job of FL-002, started by hand, shows the benchmark with its table. Its address is recorded. The workflow file shows that the job runs by hand and on a schedule and not on a push.
- [ ] The first run is recorded in this work item: the table, the machine, and for each budget "met", "met after a change" with the change named, or "revised" with the owner's approval and the new number in REQ-35.
- [ ] `pnpm check` still exits 0 and does not run the benchmark.

**Validation.** The benchmark command, run locally and in the eval job. Unit tests of the percentile and budget functions on every check.

**Completion evidence.** The commit, the address of the workflow run, the table of the first run with the machine it ran on, and the record of each budget's outcome. Q-09 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) is updated with the timings on a file database.

### FL-074: Token and tool-call comparison with and without Factloom

| | |
|---|---|
| Status | Pending |
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
- [ ] The task set and its checks are committed in a commit that precedes the commit of the first results.
- [ ] Unit tests of the report's arithmetic (totals, differences, medians) pass under `pnpm check`.
- [ ] The owner runs the runner once per configuration and commits the raw usage output and the generated report. The report names the agent, the model, the date and the number of tasks.
- [ ] The report has, for each task and in total, input tokens, output tokens, tool calls and pass or fail, with and without Factloom.
- [ ] The root `README.md` states the measured result in one or two sentences that match the report, including when the result is no saving or a cost.
- [ ] `pnpm check` still exits 0 and does not start the runner.

**Validation.** Unit tests for the report arithmetic on every check. The comparison itself is a manual run by the owner, because it needs a signed-in agent and spends tokens.

**Completion evidence.** The commit of the task set, the commit of the raw output and report, and the sentence added to `README.md`.
