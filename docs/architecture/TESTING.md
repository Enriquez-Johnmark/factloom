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

One command, `pnpm check`, runs the format check, lint, type check and every test above except live eval runs.

## Unit tests

Use cases and fact operations take their dependencies as arguments, so a unit test passes fakes.

- **`createInMemoryStore()`** is a complete `MemoryStore` held in arrays. It lives in `@factloom/core` and is exported for tests. It is a real implementation of the interface, not a mock: tests assert on what the store contains afterwards, not on which methods were called.
- **`createScriptedLlm(responses)`** returns the given objects in order and fails the test if it is called more often than expected. A test that must make no LLM call passes a client that fails on any call.
- **`createFakeEmbedder()`** maps text to a small deterministic vector.
- **A fixed clock and a counting identifier generator**, so every timestamp and identifier in a test is predictable.

Pure functions get direct tests with no fakes: rank fusion, name normalisation, timestamp parsing, building a change set for a succession or a correction.

## Contract tests

One suite, `describeMemoryStoreContract(createStore)`, defines what any `MemoryStore` must do. It is exported from `@factloom/core` and run against:

- the in-memory fake, so the fake cannot drift from the real adapters;
- the SQLite adapter, in `@factloom/storage`;
- the Postgres adapter, when it exists.

The suite covers, as a minimum:

- every row of the time table in [`spikes/fact-schema`](../../spikes/fact-schema/README.md): now, as of a date, known at a date, both, and the boundary instant;
- each retrieval lane returning no fact outside the time filter;
- a commit applying all of its changes or none;
- one audit entry per change, sharing an operation identifier;
- each refusal: invalidating a missing fact, invalidating twice, a fact with no source, a vector of the wrong size, a second entity with the same normalised name;
- no operation reducing the number of fact rows;
- nothing read or linked across namespaces.

The SQLite adapter has a few tests of its own for what the interface does not describe: migrations apply in order, an edited migration is refused, and the triggers reject a direct `UPDATE` or `DELETE`.

## Smoke test

Starts the MCP server as a child process on a temporary database, with a fake LLM, and over stdio: lists the tools, records a fact, restarts the process, and recalls the fact. This is the test behind "runs from one SQLite file with no other service, and data persists across restarts".

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

Assertions read memory through the same use cases the MCP server calls and compare normalised values exactly. There is no natural-language answer and no LLM judge.

Start with about ten scenarios and add one whenever a bug is found. The first ten cover, deliberately:

| Case | What must happen |
|---|---|
| Succession | The old fact ends; the new one is current; asking as of an earlier date returns the old one |
| Correction | The wrong fact is invalidated; asking as of any date returns the right one; asking what was known earlier returns the wrong one |
| Duplicate | One fact, with the second source attached |
| Multi-valued predicate | Both facts stay current |
| Unrelated fact about the same subject | Nothing is invalidated. This is the case another system got wrong in the research runs |
| Older fact arriving late | It is recorded as an ended fact and does not replace the current one |
| Same name, different entity type | Two entities, not one |
| A date in the text ("on 15 March") | `valid_from` is that date, not the date of recording |
| A plan ("we will migrate in March") | Not recorded as a current fact |
| Retraction | The fact is invalidated with no replacement and is not recalled |

The scenario texts are written in the style of coding-agent notes and commit messages. The [software development research](../research/industries/software-development.md) lists eight realistic ones to start from.

### Layer C: extraction cases, phase 1

One input text and the facts expected from it: subject, predicate, object and dates. About 20 to start. They guard the extraction prompt.

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
