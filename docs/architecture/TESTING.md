# Testing strategy

How Factloom is tested, and how its claims about time and correctness are measured. Conventions for writing individual tests are in [`.claude/rules/testing.md`](../../.claude/rules/testing.md); this document is the plan.

Terms in bold are defined in [`GLOSSARY.md`](../../GLOSSARY.md). The reasoning behind the evaluation approach is in the [evaluation research](../research/technical/evaluation.md).

## Four kinds of test

| Kind | What it proves | Uses a database | Uses an LLM | Runs |
|---|---|---|---|---|
| Unit | A use case or a pure function behaves as specified | No. A fake store | No. A fake client | On every check |
| Contract | A storage adapter behaves as `MemoryStore` promises | Yes | No | On every check |
| Smoke | The MCP server starts and answers over stdio | Yes | No | On every check |
| Eval | Memory ends in the right state after a sequence of inputs | Yes | Recorded responses | On every check. Live runs by hand |

One command, `pnpm check`, runs the format check, lint, type check and every test above except live eval runs. It needs no network, no API key and no embedding model: it uses the fake embedder and replayed LLM responses. A second command, `pnpm eval`, runs what needs the real embedding model: the embedder's own tests, the retrieval eval and the performance benchmark. It runs on demand and in a separate continuous integration job, not on every check.

### Continuous integration

Planned as a phase 1 work item; not yet built. `pnpm check` runs on Linux and on macOS arm64 on every push. Before anything is published, a job installs the packed server on a clean machine and starts it, which is requirement REQ-CA-08 of the [competitive analysis](../research/evaluations/competitive-analysis.md). The first run of the server downloads the embedding model, so that job needs network access and takes longer than later starts.

## Unit tests

Use cases and fact operations take their dependencies as arguments, so a unit test passes fakes.

- **`createInMemoryStore()`** is a complete `MemoryStore` held in arrays. It is a real implementation of the interface, not a mock: tests assert on what the store contains afterwards, not on which methods were called. It exists so that `graph-rag` can be tested without importing `@factloom/storage`. Its keyword and vector ranking is naive, so tests that use it assert on which facts are returned, not on their exact order.
- **`createScriptedLlm(responses)`** returns the given objects in order and fails the test if it is called more often than expected. A test that must make no LLM call passes a client that fails on any call.
- **`createFakeEmbedder()`** maps text to a small deterministic vector.
- **`createTestDeps(options)`** builds the dependencies of an operation from the three helpers above, with a fixed clock and a counting identifier generator, so every timestamp and identifier in a test is predictable.

The four helpers are ordinary exports of `@factloom/core`, from its single `index.ts`. There is no separate entry for tests. They import no test framework, so `core` never imports one in its source.

Pure functions get direct tests with no fakes: rank fusion, name normalisation, timestamp parsing, building a change set for a succession or a correction.

## Contract tests

One suite, `describeMemoryStoreContract(createStore)`, defines what any `MemoryStore` must do. It lives in `@factloom/storage`, which is where a test framework is already a development dependency, and that package runs it against:

- the in-memory store from `@factloom/core`, so it cannot drift from the real adapter;
- the SQLite adapter.

The suite moves to a shared place when a second adapter, Postgres, exists.

The suite covers, as a minimum:

- every row of the time table in [`spikes/fact-schema`](../../spikes/fact-schema/README.md): now, as of a date, known at a date, both, and the boundary instant;
- each retrieval lane returning no fact outside the time filter;
- a commit applying all of its changes or none;
- one audit entry per change, sharing an operation identifier;
- each refusal, with its error code: invalidating a missing fact (`not_found`), invalidating twice (`already_invalidated`), attaching a source to a fact that is no longer live (`already_invalidated`), a fact with no source (`invalid_input`), a vector of the wrong size (`embedding_model_mismatch`), a second entity with the same normalised name (`already_exists`);
- attaching a source to a live fact, which writes no fact row and one audit entry;
- the single-value rule, which fails the commit with `conflict`: a second open-ended value, an older fact arriving late that overlaps an ended fact, a fact dated in the future next to an open-ended one, and an unknown start;
- the single-value rule not refusing what it should allow: periods that only touch, a multi-valued predicate, and a change set that invalidates a fact and records its replacement together;
- two processes on one file: two stores opened on the same database file each try to record a different open-ended value for the same subject and single-valued predicate. Exactly one commit succeeds and the other returns `conflict`. This case runs only for an adapter that keeps its data in a file, so not for the in-memory store;
- no operation reducing the number of fact rows;
- nothing read or linked across namespaces.

The SQLite adapter has a few tests of its own for what the interface does not describe: migrations apply in order, an edited migration is refused, the triggers reject a direct `UPDATE` or `DELETE`, and the connection settings in [`SCHEMA.md`](SCHEMA.md) are in force.

## Smoke test

Starts the MCP server as a child process on a temporary database, with no API key, and over stdio: lists the tools, records a fact with `record_fact`, restarts the process, recalls the fact, and checks that `remember` answers `llm_failed`. This is the test behind "runs from one SQLite file with no other service, and data persists across restarts".

Two projects studied in the research did not start on a fresh install because a dependency had moved ([evaluations](../research/evaluations/competitive-analysis.md)). The smoke test runs against exact pinned versions for that reason.

## Eval set

Unit and contract tests show the code does what it says. The eval set shows that memory ends up *right* after a realistic sequence of events. No public benchmark tests as-of and known-at questions or supersession links, so Factloom has its own.

### Layer A: time semantics, phase 0 and 1

About 30 cases with facts inserted directly and no LLM. These are the contract tests above, written from the scenarios below. They exist first because phase 1 can be judged with them alone.

### Layer B: timeline scenarios, phase 2

A scenario is one file: a list of dated inputs, then assertions about the resulting memory.

```yaml
name: test framework switched
steps:
  - at: 2026-01-10T00:00:00.000Z
    remember: We use Jest for unit tests.
  - at: 2026-04-02T00:00:00.000Z
    remember: We switched the unit tests from Jest to Vitest last week.
expect:
  - ask: { subject: repository, predicate: uses_test_framework }
    returns: [Vitest]
    must_not_return: [Jest]
  - ask: { subject: repository, predicate: uses_test_framework, as_of: 2026-02-01 }
    returns: [Jest]
  - ask: { subject: repository, predicate: uses_test_framework, known_at: 2026-02-01 }
    returns: [Jest]
  - history: { subject: repository, predicate: uses_test_framework }
    superseded: [{ from: Jest, kind: succession }]
```

Inputs go through the same use cases the MCP server calls. Assertions do not go through `recall`, which takes a free-text question and ranks its answers. An `ask` reads memory with `MemoryStore.listFacts` for the subject and predicate, with the as-of and known-at dates as its time filter. A `history` reads with the `getFactHistory` use case, starting from a fact that `listFacts` returned. Values are normalised and compared exactly. There is no natural-language answer and no LLM judge.

The scenario files, the extraction cases, the recordings and the runner live in `apps/mcp-server/evals/`. The app is the composition root, and so the one place that may import the storage adapter, the use cases and the LLM and embedding implementations together.

Start with the eleven scenarios below and add one whenever a bug is found. A restatement is handled by a deterministic rule from phase 1, so its scenario can run before phase 2. The first ones cover, deliberately:

| Case | What must happen |
|---|---|
| Succession | The old fact ends; the new one is current; asking as of an earlier date returns the old one |
| Correction | The wrong fact is invalidated; asking as of any date returns the right one; asking what was known earlier returns the wrong one |
| Restatement | One fact, with the second source attached |
| Multi-valued predicate | Both facts stay current |
| Unrelated fact about the same subject | Nothing is invalidated. This is the case another system got wrong in the research runs |
| Older fact arriving late | It is recorded as an ended fact and does not replace the current one. If its valid period overlaps a live fact for a single-valued predicate, it is not recorded |
| A known name mentioned under a different entity type | The existing entity is reused; no second entity is created |
| A date in the text ("on 15 March") | `valid_from` is that date, not the date of recording |
| No date in the text | `valid_from` is unknown, so the fact is returned for any earlier as-of date |
| A plan ("we will migrate in March") | Not recorded as a current fact |
| Retraction | The fact is invalidated with no replacement and is not recalled |

The scenario texts are written in the style of coding-agent notes and commit messages. The [software development research](../research/industries/software-development.md) lists eight realistic ones to start from.

### Layer C: extraction cases, phase 1

One input text and the facts expected from it: subject, predicate, object and dates. About 20 to start. They guard the extraction prompt.

### Retrieval eval, phase 1

A separate eval, because it measures something else: whether `recall` finds the right facts for a free-text question. Each case is a question and the facts that should be returned, and the measure is recall at a fixed number of results. This is where the lane weights of rank fusion are set ([ADR 0017](adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md)). It uses the real embedder and no LLM.

### Keeping it deterministic

LLM calls in layers B and C go through a recording wrapper around `LlmClient`.

- The first run stores each response under a key derived from the request.
- Every later run replays the stored response and fails if one is missing.
- Changing a prompt or a model changes the key, which forces a deliberate re-record and puts the changed results in the diff.

This separates two questions. Replayed runs answer "given these model outputs, does the pipeline do the right thing?" on every check. A live run, by hand, answers "is the model good enough?" and is repeated a few times because the answer varies.

### What is measured

| Metric | Meaning | Target on the scenario set |
|---|---|---|
| Staleness rate | Share of "now" questions that return a fact that should have been superseded | 0 |
| False invalidation rate | Share of facts that should be live but were invalidated | 0 |
| Missed invalidation rate | Share of facts that should have been invalidated but are live | Reported |
| Historical accuracy | Share of as-of and known-at questions answered correctly | 1 on layer A |
| Extraction precision and recall | Against the expected facts in layer C | Reported |

Targets of 0 and 1 apply where the outcome does not depend on a model. Where it does, the number is reported and tracked, because nobody, including the projects studied, has published what is achievable.

## Not planned

- **An LLM-judge harness.** The assertions above do not need one.
- **Public benchmark runs** before phase 2 is working. The knowledge-update and temporal-reasoning parts of LongMemEval are the first candidates afterwards.
- **Comparisons against other memory products.** The vendors disagree about each other's scores.
- **Coverage targets.** The contract suite and the scenario set are the measure.
