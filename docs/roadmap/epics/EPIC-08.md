# EPIC-08: Self-correction

| | |
|---|---|
| Status | Pending |
| Phases | 2 |
| Packages | `packages/maintenance` (new), `@factloom/core`, `@factloom/storage`, `@factloom/graph-rag`, `apps/mcp-server` |
| Requirements | REQ-16, REQ-17, REQ-18, REQ-19, REQ-24 (absorbing REQ-CA-02, REQ-CA-03, REQ-CA-16) |

Terms in bold are defined in [`GLOSSARY.md`](../../../GLOSSARY.md). Where another document disagrees with [`INTERFACES.md`](../../architecture/INTERFACES.md), `INTERFACES.md` wins.

## Outcome

When new information conflicts with a stored fact, Factloom resolves the **conflict** at write time: the earlier fact is ended or invalidated and linked to the fact that replaced it, or the change is stored as a proposal for a person, according to the domain's **correction policy**. **Feedback** on a recalled fact is recorded and acted on. The content of a source can be purged, leaving a record that it existed. Every one of these changes goes through a fact operation in `@factloom/core`, and so has audit entries.

## Scope

- The `maintenance` package for product 2, and the rule that it imports `@factloom/core` only.
- A conflict judge that gives one of four verdicts for each conflict candidate: duplicate, succession, correction, unrelated.
- Automatic correction inside `remember` for a domain whose correction policy is `automatic`.
- Stored proposals, with approve and reject operations and a read of pending proposals, for a domain whose correction policy is `human_approval`, and a command that a person runs to list, approve and reject them. It is not an MCP tool, so an agent cannot approve its own proposal.
- The phase 2 fact operations of `INTERFACES.md`: `reviseValidTime`, `adjustConfidence`, `recordFeedback`, `purgeContent`, each with its `Change` kind, `Operation` name, `AuditAction` values, reason codes and migration.
- The `give_feedback` MCP tool, which is the sixth tool, and the follow-up that acts on feedback.
- The design of purge, proven by a spike before it is built, and a command that a person runs to purge. It is not an MCP tool, so an agent cannot purge.

## Out of scope

- Scheduled jobs: **verification**, **entity merge**, anchor repair and archiving. [EPIC-09](EPIC-09.md).
- The scenario runner and the scenario data that measure this epic. [EPIC-07](EPIC-07.md), FL-027 and FL-039.
- A user interface for approving proposals, and an HTTP route for it. [EPIC-10](EPIC-10.md) and [EPIC-11](EPIC-11.md).
- Per-fact access control and the approval flows of regulated domains. [EPIC-11](EPIC-11.md) and [EPIC-12](EPIC-12.md).
- A natural language inference model, graph-wide inconsistency detection, weighting of sources, and learned predicate cardinality. The [contradiction detection research](../../research/technical/contradiction-detection.md) lists each under "Do not build yet". No work item covers them.
- A refinement verdict. Decision D-12 in [`DECISIONS.md`](../../architecture/DECISIONS.md) fixes four verdicts until the eval set shows a need.
- The rule that a later automatic decision does not override a human one. It is the second half of REQ-CA-16, which the [competitive analysis](../../research/evaluations/competitive-analysis.md) defers until an adapter requires human approval, after phase 3. No work item in phases 0 to 3 covers it.

## Boundaries and constraints

- **Product 2 changes memory only through fact operations in `@factloom/core`** ([`INTERFACES.md`](../../architecture/INTERFACES.md), "Fact operations"; `.claude/rules/architecture.md`, "Writes go through one door"). Nothing in `maintenance` builds a `ChangeSet`, calls `MemoryStore.commit`, or contains SQL.
- **`commit` stays the only way to change memory** ([ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md)). A new operation adds a `Change` kind; it does not add a second write method.
- **A fact row changes only by being invalidated once** ([ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md)). A confidence change is a row in a side table. Purge is the one exception and has its own narrowly defined change ([ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md)).
- **Conflict candidates come from subject and predicate, without an LLM, and are bounded in number** ([ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md), REQ-CA-03).
- **The audit log holds no free text.** A change is explained by a reason code and a source ([`SCHEMA.md`](../../architecture/SCHEMA.md), rule 6).
- **The lists of operations, actions, target kinds, triggers and reason codes are closed lists in the core schema**, not `CHECK` constraints ([`SCHEMA.md`](../../architecture/SCHEMA.md), notes on the columns). A work item that adds a value adds it there.
- **Schema changes are new numbered migrations**, never edits ([`SCHEMA.md`](../../architecture/SCHEMA.md), "Migrations"; `.claude/rules/data.md`).
- **Every storage behaviour is a case in the storage contract suite**, run against the in-memory store and the SQLite adapter ([`TESTING.md`](../../architecture/TESTING.md)).
- **Names marked "proposed" in this file are not in `INTERFACES.md`.** The work item that uses one settles the name and adds it to `INTERFACES.md` and `SCHEMA.md`.

## Dependencies

- [EPIC-01](EPIC-01.md): the workspace and the boundary lint that the new package joins (FL-001).
- [EPIC-02](EPIC-02.md): the phase 1 fact operations that corrections call: `endFact`, `invalidateFact`, `findConflictCandidates` (FL-010, FL-011).
- [EPIC-03](EPIC-03.md): the SQLite adapter, its migration runner and the contract suite that every new change kind extends (FL-015).
- [EPIC-04](EPIC-04.md): the LLM client (FL-019), the secret check (FL-022) that a feedback comment passes, and the `remember` use case that FL-042 changes.
- [EPIC-06](EPIC-06.md): the server, its configuration and entry point (FL-034), which the two commands of this epic share; the tool translations (FL-058) that the `give_feedback` tool reuses; the five-tool surface (FL-036) to which it is added; and the `remember` tool (FL-035), whose output FL-042 changes.
- [EPIC-07](EPIC-07.md): the scenario data (FL-027), the record-and-replay wrapper (FL-028) and the scenario runner (FL-039) that set the bar for FL-041 and FL-042.

## Deliverables

- `packages/maintenance`, with its boundary rules enforced.
- The conflict judge and its eval.
- `remember` with automatic correction, and the scenario numbers that show it.
- Proposal storage with `approveProposedChange` and `rejectProposedChange` (proposed names), and a command in `apps/mcp-server` that a person runs to list, approve and reject proposals.
- `reviseValidTime`, `adjustConfidence`, `recordFeedback` and `purgeContent` in `@factloom/core`, with their migrations and contract cases.
- The `give_feedback` tool, and the follow-up in `maintenance` that acts on feedback.
- The completed purge design in the decision records, with the spike that proves it.
- The purge migration, and a command in `apps/mcp-server` that a person runs to purge.

## Success criteria

- `pnpm check` passes, and it includes the scenario set in replay.
- On the scenario set in replay, the scenario runner from FL-039 reports a staleness rate of 0 and a false invalidation rate of 0. The missed invalidation rate is reported.
- The scenario "unrelated fact about the same subject" ends with no fact invalidated and with no conflict detection call made.
- A lint run fails when `packages/maintenance` imports `@factloom/storage` or `@factloom/graph-rag`.
- Every operation added in this epic has cases in the storage contract suite that pass against both stores.
- After `purgeContent`, no read method of either store, and no query over any table or index of the SQLite database, returns the purged text. Freed database pages are cleared only if FL-047 settles how.
- A person can list pending proposals and approve or reject one with a command of `apps/mcp-server`, and an approved proposal changes memory with the person as its trigger (FL-070).
- A search of `packages/maintenance` for `commit(` and for SQL keywords in string literals finds nothing outside tests.

## Work items

| ID | Title | Phase | Depends on | Status |
|---|---|---|---|---|
| FL-040 | Create the maintenance package and its boundary rules | 2 | FL-001 | Completed |
| FL-041 | Conflict judge | 2 | FL-040, FL-011, FL-019, FL-027, FL-028 | Under Review |
| FL-042 | Automatic correction inside remember | 2 | FL-035, FL-041, FL-039 | Under Review |
| FL-043 | Proposed changes: storage and operations | 2 | FL-042 | Under Review |
| FL-070 | Human-approval policy in remember, with a command to list, approve and reject | 2 | FL-043, FL-042, FL-034 | Under Review |
| FL-044 | reviseValidTime operation | 2 | FL-010 | Completed |
| FL-045 | Confidence history and adjustConfidence | 2 | FL-015, FL-016, FL-017 | Completed |
| FL-046 | Feedback operation and migration | 2 | FL-015, FL-022 | Completed |
| FL-059 | give_feedback tool | 2 | FL-046, FL-036, FL-058 | Completed |
| FL-060 | Acting on feedback | 2 | FL-046, FL-045, FL-042 | Pending |
| FL-047 | Purge design, proven by a spike | 2 | FL-015 | Completed |
| FL-061 | Purge operation | 2 | FL-047, FL-016, FL-017 | Completed |
| FL-072 | Purge command | 2 | FL-061, FL-034 | Completed |

### FL-040: Create the maintenance package and its boundary rules

| | |
|---|---|
| Status | Completed |
| Phase | 2 |
| Depends on | FL-001 |
| Requirements | REQ-24, REQ-28 |
| Components | `packages/maintenance`, root lint configuration, `SYSTEM-BOUNDARIES.md` |

**Objective.** Add the package that will hold product 2, and make its import rules fail automatically when broken.

**Background.** [`ARCHITECTURE.md`](../../architecture/ARCHITECTURE.md) says `packages/maintenance` is added when its phase starts. Product 2 may change memory only through fact operations in `@factloom/core`. The surest way to hold that rule is that the package cannot import the storage adapter at all. [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md) describes the three mechanisms that enforce a boundary.

**Outcome.** The next engineer has a package to put the conflict judge in. An import of `@factloom/storage` or `@factloom/graph-rag` from it fails the check.

**Scope.**
- The package, set up the same way FL-001 sets up the others, with one public entry.
- Its row in the import table of `SYSTEM-BOUNDARIES.md`, its public API section, and the updated diagram.
- The lint rule for the package, and the rule that `@factloom/graph-rag` and `@factloom/storage` do not import it.
- The package's row in `ARCHITECTURE.md`, "Packages".

**Non-goals.**
- Any product 2 behaviour. FL-041 adds the first.
- A command that runs maintenance. FL-048.
- A new decision record for the package count, unless [ADR 0001](../../architecture/adr/0001-typescript-pnpm-monorepo-with-four-packages.md) is found to forbid a fifth package. In that case a new record supersedes it.

**Functional requirements.**
1. `packages/maintenance` exists as a private workspace package named `@factloom/maintenance`.
2. It may import `@factloom/core` and `zod`, and nothing else from the workspace.
3. `apps/mcp-server` may import it. `@factloom/core`, `@factloom/graph-rag` and `@factloom/storage` may not.
4. `pnpm check` covers the package: format check, lint, type check and tests.

**Technical requirements.**
1. The package's `package.json` declares only the dependencies the table allows, and exports only its `src/index.ts`.
2. The lint rule forbids, inside the package, imports of `@factloom/storage`, `@factloom/graph-rag`, any database, LLM, embedding or MCP library, and deep imports into another package.
3. The package holds one real test, so the test runner finds the package. `.claude/rules/engineering-principles.md` forbids empty placeholder files, so if FL-001 used a placeholder test, this item follows what FL-001 did and FL-041 replaces it.

**Constraints.**
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md), "Import rules" and "How the rules are enforced".
- [ADR 0003](../../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md).

**Acceptance criteria.**
- [x] `pnpm check` passes with the new package present.
- [x] Adding `import '@factloom/storage'` to a source file of the package makes `pnpm check` fail at the lint step. `pnpm check` stops at the first failure (FL-001), so the type check is shown separately: with the same import and the dependency not declared in the package's `package.json`, the type check stage run on its own also fails. The import is then removed.
- [x] Adding `import '@factloom/graph-rag'` to a source file of the package makes `pnpm check` fail. The import is then removed.
- [x] Adding `import '@factloom/maintenance'` to a source file of `@factloom/graph-rag` makes `pnpm check` fail. The import is then removed.
- [x] `SYSTEM-BOUNDARIES.md` lists the package in the import table and in "Public API of each package".

**Validation.** `pnpm check`, run four times: once clean and once with each forbidden import.

**Completion evidence.** The commit, and the failing output of each of the three forbidden-import runs.

**Recorded evidence.** Completed on 2026-11-16 on Linux x64 with Node.js v22.23.4 and pnpm 12.18.0, in four commits: `build: add maintenance package`, `build: add import rules for the maintenance package`, `docs: add the maintenance package to the system boundaries` and `docs: add the maintenance package to the architecture`. Each failing proof below was added, run and removed; none was committed.

The package follows FL-001: its `package.json` declares `@factloom/core` only and exports only `src/index.ts`, and its one test checks a placeholder export, `maintenanceBuiltOn`, which FL-041 replaces. [ADR 0001](../../architecture/adr/0001-typescript-pnpm-monorepo-with-four-packages.md) says each later package "is created when its phase starts", so no new decision record was needed.

`pnpm check` with the package present:

```text
$ pnpm run check:format && pnpm run check:lint && pnpm run check:types && pnpm run test
$ biome format .
Checked 243 files in 47ms. No fixes applied.
$ biome lint .
Checked 243 files in 79ms. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 RUN  v5.1.0 <repo>
 Test Files  70 passed (70)
      Tests  770 passed (770)
exit code: 0
```

The one info is `lint/complexity/useIndexOf` in `packages/storage/src/change-sequence-generator.ts`, present before this item.

Forbidden imports. Each stops the check at the lint stage and names the rule; for the three the item names, the type check run on its own also fails, because the dependency is not declared:

```text
added to packages/maintenance/src/index.ts: import '@factloom/storage';
$ biome lint .
packages/maintenance/src/index.ts:1:8 lint/style/noRestrictedImports
  × maintenance must not import @factloom/storage or @factloom/graph-rag, and imports other packages by name only. It changes memory only through the fact operations in core.
Found 1 error.
exit code: 1
$ pnpm run check:types
packages/maintenance/src/index.ts(1,8): error TS2882: Cannot find module or type declarations for side-effect import of '@factloom/storage'.
exit code: 1

added to packages/maintenance/src/index.ts: import '@factloom/graph-rag';
$ biome lint .
packages/maintenance/src/index.ts:1:8 lint/style/noRestrictedImports
  × maintenance must not import @factloom/storage or @factloom/graph-rag, and imports other packages by name only. It changes memory only through the fact operations in core.
Found 1 error.
exit code: 1
$ pnpm run check:types
packages/maintenance/src/index.ts(1,8): error TS2882: Cannot find module or type declarations for side-effect import of '@factloom/graph-rag'.
exit code: 1

added to packages/graph-rag/src/index.ts: import '@factloom/maintenance';
$ biome lint .
packages/graph-rag/src/index.ts:1:8 lint/style/noRestrictedImports
  × graph-rag must not import @factloom/storage or @factloom/maintenance, and imports other packages by name only. It reaches storage through the MemoryStore interface in core.
Found 1 error.
exit code: 1
$ pnpm run check:types
packages/graph-rag/src/index.ts(1,8): error TS2882: Cannot find module or type declarations for side-effect import of '@factloom/maintenance'.
exit code: 1
```

Three further proofs, beyond the item: `import '@factloom/maintenance'` in `packages/storage/src/index.ts`, `import 'better-sqlite3'` and the deep import `import '@factloom/core/src/index.ts'` in `packages/maintenance/src/index.ts`. Each failed the lint stage with exit code 1, naming the storage rule, the rule against a database, LLM, embedding or MCP library, and the maintenance rule respectively. `core` already forbids every other `@factloom` package, so it needed no change.

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the last of the four commits: https://github.com/Johnmark-Tech/factloom/actions/runs/43977632964.

Differences from the item:

- `zod` is allowed by the import table but not declared, as FL-001 declared none in `graph-rag`'s scaffold; the first work item that uses it declares it.
- `apps/mcp-server` does not declare the package yet. The import table allows it; the first work item that imports it from the app declares it.
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md) also gains a row in "What crosses each boundary".

Not run: a forbidden import with its dependency declared in the package's `package.json`. The lint rule does not read `package.json`, and FL-001 ran that case for `core`.

### FL-041: Conflict judge

| | |
|---|---|
| Status | Under Review |
| Phase | 2 |
| Depends on | FL-040, FL-011, FL-019, FL-027, FL-028 |
| Requirements | REQ-16 (REQ-CA-03) |
| Components | `packages/maintenance`, `@factloom/core` (one type), `apps/mcp-server` (evals) |

**Objective.** Decide, for a new fact and each stored fact it could conflict with, which of four things is the case: duplicate, succession, correction or unrelated. Use rules where a rule is enough, and an LLM only for the rest.

**Background.** In phase 1, `remember` skips any fact that conflicts with a stored one. `findConflictCandidates` (FL-011) lists the candidates and does not judge. The [contradiction detection research](../../research/technical/contradiction-detection.md) found that the systems studied use an LLM prompt for this step and that none has published how often it is right. It also found the cost controls worth copying: skip the LLM on exact matches, batch all candidates of one fact into one call, give the LLM integer indexes, and decide dates and direction in code. The four verdicts are decision D-12 in [`DECISIONS.md`](../../architecture/DECISIONS.md). Question Q-30 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) is the accuracy of this verdict.

**Outcome.** A function in `maintenance` that takes a new fact and its candidates and returns one verdict per candidate, with the moment of change for a succession. Its error rates on a reviewed set of cases are known and recorded.

**Scope.**
- The judge function and its prompt.
- The type of the judge in `@factloom/core`, so that `@factloom/graph-rag` can receive a judge as a dependency in FL-042 without importing `maintenance`.
- Deterministic rules that run before any LLM call.
- A set of judge cases as reviewed data, and an eval that reports rates in replay.

**Non-goals.**
- Acting on a verdict. FL-042.
- Selecting candidates. FL-011 does it.
- A fifth verdict for refinement, a confidence number on the verdict, and a free-text reason. D-12 fixes four verdicts, and nothing reads the other two.
- Choosing candidates by embedding similarity. [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md) leaves it until the eval set shows conflicts being missed.
- A table that stores verdicts. The reason code of the resulting change records the verdict (FL-042).

**Functional requirements.**
1. Input: the new fact (subject, predicate, object, statement, valid period), the text it was extracted from, the time the source was observed, the predicate's cardinality, and the candidates as returned by `findConflictCandidates`.
2. Output: for each candidate, one verdict from `duplicate`, `succession`, `correction`, `unrelated`. A `succession` verdict carries the moment of change.
3. Deterministic rules, applied in this order, with no LLM call:
   1. No candidates: the result is empty.
   2. A candidate whose object equals the new fact's object after normalisation is a `duplicate`. This is the phase 1 **restatement** rule.
   3. For a **multi-valued** predicate, a candidate with a different object is `unrelated`.
4. Only what remains goes to the LLM: candidates of a **single-valued predicate** whose object differs and whose valid period overlaps the new fact's. All remaining candidates of one new fact go in one call.
5. The moment of change is computed in code, not asked of the LLM: the new fact's `validFrom` when it is known, otherwise the time the source was observed.
6. The instructions tell the LLM to answer `correction` only when the text says the stored fact was never true, `succession` only when the text says the value changed, and `duplicate` when the two objects name the same value in different words.
7. If the LLM call fails or its answer does not match the schema, the judge returns `llm_failed`. It does not guess a verdict.

**Technical requirements.**
1. The judge calls `LlmClient.generateObject` with `task: 'conflict_detection'`. The stable part of the prompt is in `instructions` and the fact and candidates are in `input`.
2. Candidates are presented to the LLM by integer index. An answer that names an index outside the range, or that omits a candidate, is `llm_failed`.
3. The number of candidates passed to `findConflictCandidates` as `limit` is one named constant. It starts at 10, the number used in the experiments of the Mem0 paper (research, finding 10), and is recorded in `INTERFACES.md`.
4. The judge's function type is exported from `@factloom/core`. The implementation is exported from `@factloom/maintenance`. A scripted judge for tests needs no helper: it is a function.
5. Judge cases are data files in `apps/mcp-server/evals/`, beside the scenario files of FL-027 and written with the same loader approach: the new fact, the source text, the candidates, and the expected verdict for each. There is at least one case for each of the eleven scenarios of FL-027 that involves a second fact about the same subject, built from that scenario's texts, and at least four cases where the expected verdict is `unrelated` or `duplicate` and the wording invites a wrong `correction`. Expected verdicts are reviewed by hand.
6. The eval lives in `apps/mcp-server/evals/`, which may import `@factloom/maintenance`. It runs every case through the judge with the LLM replayed by the wrapper from FL-028, and prints a table of expected verdict against given verdict, with two rates: the share of candidates expected `duplicate` or `unrelated` that received `succession` or `correction`, and the share of candidates expected `succession` or `correction` that received anything else.

**Constraints.**
- [ADR 0013](../../architecture/adr/0013-claude-behind-a-one-method-interface.md): the judge sees only `LlmClient`.
- [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md): the conflict key.
- `.claude/rules/testing.md`, "Evals": responses are replayed, and a missing recording fails the run.
- The model for the `conflict_detection` task is chosen in the composition root's task map (FL-019). No model name is written in `maintenance`.

**Acceptance criteria.**
- [x] A unit test for each deterministic rule passes with an LLM client that fails if called: no candidates; same object; multi-valued predicate with a different object.
- [x] A unit test shows the moment of change is the new fact's `validFrom` when given, and the source's observed time when not, with a scripted LLM.
- [x] A unit test shows one LLM call is made for a new fact with three remaining candidates.
- [x] A unit test shows an out-of-range index and a missing candidate each give `llm_failed`.
- [ ] By hand, once, by the owner in the session: with `ANTHROPIC_API_KEY` set in the environment and nowhere else, the owner runs the judge eval in record mode from `apps/mcp-server` (`pnpm run record:judge`, which wraps the Anthropic client of FL-019 with the wrapper of FL-028 in record mode), reads the diff of the new recordings for secrets, and records the model identifier. A replayed run fails while a recording is missing, so the code and the recordings are committed together after this step, and the item is not `Completed` before it.
- [x] The judge eval runs inside `pnpm check` in replay and fails when a recording is missing.
- [x] The eval output shows the verdict table and both rates. The rates are recorded as numbers; this item sets no target for them, because no published figure exists to set one against. FL-042 sets the bar on the scenario set.
- [x] Every judge case whose expected verdict is reached by a deterministic rule gets that verdict.

**Validation.** Unit tests with scripted and failing LLM clients. The judge eval in replay. One live run by hand: the owner runs the eval with recording on and an API key set, and records the model identifier from the task map and the two rates.

**Completion evidence.** The commit; the eval table and the two rates from the replayed run; the model identifier the recordings were made with; the candidate limit recorded in `INTERFACES.md`.

**Recorded evidence.** Done on 2026-11-16 and 2026-11-17 on Linux x64 with Node.js v22.23.4. The recording step, which the item gives to the owner, was run by the agent in the session with the owner's approval, using the key in `OWNER_ANTHROPIC_API_KEY`. The item is `Under Review` until the owner confirms that step.

Commits, in order: `feat(core): add the conflict judge type` (with its section in [`INTERFACES.md`](../../architecture/INTERFACES.md) and its row in [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md)), `feat(maintenance): add the conflict judge` (the judge, its prompt and its unit tests), `test(mcp-server): add the judge cases and their eval`, `test(mcp-server): add the judge recordings and run the cases in replay`, and `docs: record the first conflict judge results in Q-30`. Each passed `pnpm check` on its own.

The judge. `judgeConflicts(deps, input)` in `@factloom/maintenance` has the type `ConflictJudge` from `@factloom/core`. Rules first, with no LLM call: no candidates give no verdicts; the same object is `duplicate`; under a multi-valued predicate another object is `unrelated`. Only the rest go to the LLM, in one call with `task: 'conflict_detection'`, numbered from 1. A `succession` carries the new fact's `validFrom`, or the time the source was observed when it has none.

Unit tests, in `packages/maintenance/src/judge-conflicts.test.ts`, 14 in all. The three rules pass with an LLM client that throws if called. The moment of change is tested both ways with a scripted LLM. One call is made for three remaining candidates: the scripted LLM throws on a second. An index out of range, a candidate left out, an index named twice and an answer outside the schema each give `llm_failed`. Each rule was broken by hand once and a test failed: the duplicate rule (3 tests), the multi-valued rule (1), the overlap rule (2), the range check (1), the check for an index named twice (1), the check for a candidate left out (1), and the moment of change (1). The test for an index named twice at first passed with its check removed, because the missing-candidate check caught the same answer; it now names every candidate as well as one twice, and fails without its own check. In the eval, counting only `succession` as a change failed 2 of its 6 tests.

The judge cases. Sixteen files in `apps/mcp-server/evals/judge-cases/`, read by `judge-case.ts` with the loader approach of the extraction cases. Seven are built from the texts of the FL-027 scenarios that give a second fact about the same subject: correction, multi-valued predicate, older fact arriving late, plan, restatement, succession, unrelated fact. The other four never reach the judge: "a date in the text" and "no date in the text" have one text, "a known name under a different entity type" gives a fact about another subject, and "retraction" is a `changeFact` report, not a text. Six cases expect only `duplicate` or `unrelated` and have wording that invites a change ("Correction:", "Actually", "To be precise", "tried ... did not switch", a plan to move). A test checks both counts. The expected verdicts were reviewed by hand by the agent.

The recording run. `pnpm run record:judge` ran once from `apps/mcp-server`, with `ANTHROPIC_API_KEY` set for that command only, and exited 0. The model, from the task map, is `claude-haiku-5-5`. There were 12 calls, every stop reason `end_turn`, with 2,879 input tokens, 1,308 output, 883 written to the cache by the first call and 9,713 read from it; the second call read 883. The 12 recordings were read for secrets: each holds only `task`, `model`, `instructions`, `input` and `response`, and none holds a key, a header, a token or a path of the machine.

`pnpm check`, under `unshare -rn` with no network and no API key, and with `CLAUDECODE` and `AI_AGENT` unset so that Vitest prints the output of passing tests (FL-069), exited 0. Two runs printed the same judge report, byte for byte. The report's table and rates:

```text
Judge cases in replay, model claude-haiku-5-5:
expected \ given   duplicate  succession  correction   unrelated  llm_failed
duplicate              4           0           0           0           0
succession             0           4           0           0           0
correction             0           0           2           0           0
unrelated              0           0           0           6           0

Changes given where none was expected: 0 of 10 (0.000).
Changes expected and not given: 0 of 6 (0.000).
 Test Files  74 passed (74)
      Tests  799 passed (799)
```

Every one of the 16 candidates got its expected verdict. Four cases are decided by the rules alone, and a test with an LLM that always fails shows that each of them gets its expected verdicts.

With one recording moved aside, the replay test failed:

```text
Error: No recording for the key 196649b7f300c5a417fa4693e0e7431e71e2a5b173ad37176f4f0f0ce5389eca. Expected the file <repo>/apps/mcp-server/evals/recordings/judge/196649b7f300c5a417fa4693e0e7431e71e2a5b173ad37176f4f0f0ce5389eca.json. Record it with: pnpm --filter @factloom/mcp-server run record:judge
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the commit that adds the recordings: https://github.com/Johnmark-Tech/factloom/actions/runs/43985315695.

Differences from the item:

- The candidate limit is `JUDGE_CANDIDATE_LIMIT`, 10, in `@factloom/core` beside the judge type, so that `graph-rag` can use it in FL-042 without importing `maintenance`. It is recorded in `INTERFACES.md`. Phase 1's `remember` still reads up to 50 candidates for its own two rules, a constant private to `graph-rag`; FL-042 decides how the two meet.
- Values are compared after `normaliseEntityName` (trim, collapse white space, lower case), as the item's "after normalisation" says. Phase 1's restatement rule compares values exactly, so the judge also calls "PNPM " and "pnpm" a duplicate.
- One rule beyond the item: a single-valued candidate whose valid period does not overlap the new fact's is `unrelated`, without the LLM. `findConflictCandidates` returns only overlapping candidates, so it matters only to a caller that passes others.
- An answer that names a candidate twice is also `llm_failed`.
- The input carries `objectEntityName`, the name of the new fact's object entity, because the prompt names values and a new fact holds only an entity identifier.
- The record command and the replay test are in `apps/mcp-server/src/`, beside those of FL-069, because they need the Anthropic client and its task map, and the boundary lint keeps `evals/` from importing `src/`. The cases, their loader and the eval runner are in `apps/mcp-server/evals/`.

Not run: Sonnet 5.5, the second model Q-30 asks about, and more than one recording run, so nothing is known of the verdicts' variance.

For the owner's review:

- Confirm the recording step, which the item gives to the owner: the model, the token counts, and the diff of the 12 recordings.
- Review the expected verdicts of the 16 cases. Two are judgement calls: the Render period that overlaps Fly.io (`unrelated`, so FL-042 skips it, as the scenario expects), and Playwright for end-to-end tests beside Jest for unit tests under the one single-valued `uses_test_framework` (`unrelated`).

The blind second labelling, 2026-11-20. With the owner's approval, a fresh agent that had not seen the expected verdicts was given each case's text, new fact and stored facts, under neutral identifiers, with the four verdicts defined as in the glossary. It gave the expected verdict for 15 of the 16 stored facts, and was unsure of three:

| Case | Expected | Second labeller |
|---|---|---|
| A plan: a move to Kubernetes that has not happened | `unrelated` | `succession`, unsure: "the change has not happened and the new fact should not take effect yet" |
| Older fact arriving late: a Render deployment overlaps the Fly.io period | `unrelated` | `unrelated`, unsure: "both may hold, but it may be a conflict to flag" |
| Unrelated despite the wording: Yarn was tried and not adopted | `unrelated` | `unrelated`, unsure: "the Yarn fact is a misextraction; the new fact should be dropped" |

In the first and the third, the second labeller's reason is that the new fact is wrong, which none of the four verdicts says: `unrelated` is the one that leaves the stored fact as it is, so the expected verdicts stand. Whether the judge should be able to reject the new fact is a question for FL-042, which acts on the verdicts. These three are what the owner reviews of the expected verdicts.

### FL-042: Automatic correction inside remember

| | |
|---|---|
| Status | Under Review |
| Phase | 2 |
| Depends on | FL-035, FL-041, FL-039 |
| Requirements | REQ-16, REQ-17, REQ-24 (REQ-CA-02) |
| Components | `@factloom/graph-rag` (`remember`), `@factloom/core` (reason codes), `apps/mcp-server` (wiring, `remember` tool output) |

**Objective.** For a domain whose correction policy is `automatic`, make `remember` resolve a conflict with a stored fact by ending or invalidating that fact, instead of skipping the new one.

**Background.** [`ARCHITECTURE.md`](../../architecture/ARCHITECTURE.md), "Remember", says phase 2 replaces the deterministic sorting in step 4 with conflict handling, which then calls the operations an agent already reaches through `changeFact`: `endFact` for a **succession** and `invalidateFact` for a **correction**. [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md) says the same of the `remember` tool. The targets are in [`TESTING.md`](../../architecture/TESTING.md), "What is measured". One system studied invalidated an unrelated fact because its rule was too broad ([ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md)); the scenario "unrelated fact about the same subject" exists to catch that here.

**Outcome.** An agent that says "we switched from Jest to Vitest last week" gets a memory in which Jest is an **ended fact**, Vitest is the **current fact**, and the two are linked, with no second tool call.

**Scope.**
- `remember` takes a judge as a dependency and applies its verdicts.
- Two reason codes for changes decided by the judge.
- The result of `remember`, and the output of the `remember` tool, say which stored fact each recorded fact took the place of.
- The composition root passes the judge from `maintenance`.
- The scenario set passing at the stated bar, with recordings for the judge's calls.
- A new ADR for the change to "one commit per use case call", and the sentences it changes in other documents.

**Non-goals.**
- The `human_approval` policy: FL-043 and FL-070. In this item a domain with that policy keeps the phase 1 behaviour: the conflicting fact is skipped.
- Changing `recordStructuredFacts` or `changeFact`. They keep returning `conflict`.
- Resolving a conflict between two facts from the same text. They stay skipped with `conflicts_within_text`.
- Recording a late-arriving older fact that overlaps a live fact. [`TESTING.md`](../../architecture/TESTING.md) says it is not recorded. Question Q-58 stays open.
- Ending a fact of a multi-valued predicate because new text implies it stopped. An agent does that with `invalidate_fact`.

**Functional requirements.**
1. `remember` calls the judge for each extracted fact that has candidates, after entity resolution.
2. Verdicts are applied in code:

   | Verdict | What `remember` does |
   |---|---|
   | `duplicate` | Attaches the source to the stored fact. Outcome `restated` |
   | `succession` | Calls `endFact` on the stored fact with `validTo` set to the moment of change and the new fact as successor |
   | `correction` | Calls `invalidateFact` on the stored fact with the new fact as replacement |
   | `unrelated`, for a single-valued predicate with an overlapping period | Does not record the new fact. It is returned in `skipped` with `conflicts_with_stored_fact` |
   | `unrelated`, otherwise | Records the new fact |

3. A new fact is left as skipped, and the judge is not asked to end anything, when a succession could not be written: the moment of change is not after the stored fact's `validFrom`.
4. If the judge returns `llm_failed`, the fact is skipped as in phase 1 and the rest of the text is still recorded. A failure to judge never invalidates anything.
5. If more than one candidate of one new fact receives `succession` or `correction`, the new fact is skipped. One new fact supersedes at most one stored fact in this item.
6. Facts that need no correction are recorded by one `recordFacts` call, as in phase 1. Each succession or correction is its own commit and is attempted after that call succeeds. If such a commit fails with `conflict` or `already_invalidated`, because another process changed memory in between, the fact is returned in `skipped`.
7. The result names, for each fact recorded by a succession or a correction, the stored fact it took the place of and which of the two it was. The proposed shape is a field on `RememberedFact`; the item fixes it in `INTERFACES.md` and in the `remember` tool's output schema in `MCP-TOOLS.md`.
8. Every change made this way carries the trigger given to `remember` and the reason code `judged_ended` for a succession or `judged_wrong` for a correction (proposed names, parallel to `reported_ended` and `reported_wrong`).

**Technical requirements.**
1. The judge is an optional member of `RememberDeps`, typed by the type FL-041 put in `@factloom/core`. `@factloom/graph-rag` does not import `@factloom/maintenance`.
2. Corrections are applied only when the judge is present and `domain.correctionPolicy` is `automatic`.
3. `endFact` and `invalidateFact` each take a new source, so the text of one `remember` call is recorded as one source per commit, each with the same content hash. The item states this in `INTERFACES.md`, because purge (FL-047, FL-061) must cover every one of them.
4. The scenario set runs through `remember` with the judge wired in, a fixed clock and replayed LLM responses, using the runner from FL-039. The judge's calls need recordings, which only the owner can make; as in FL-039, the code and the new recordings are committed together after the owner has run `pnpm run record:scenarios` in the session.
5. Requirement 6 changes a rule that other documents state: a `remember` call can now make more than one commit, and so can be partly applied, with new facts recorded and a succession skipped. A new ADR records the decision, why each succession or correction is its own commit, and what a caller sees when one fails. The item changes, in the same commit, the sentences that state the old rule: the boundary "each call of a use case makes at most one commit" in [EPIC-04](EPIC-04.md); "One call to `recordFacts` writes everything" in [`INTERFACES.md`](../../architecture/INTERFACES.md), "Use cases", for `remember`; the one-source-per-call description of `remember` in [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md); and the test name "writes everything in one commit" of FL-023, which becomes "writes everything but the corrections in one commit". [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md) is not edited: one `commit` still writes everything of one operation.

**Constraints.**
- [`INTERFACES.md`](../../architecture/INTERFACES.md), "Use cases": a handler calls exactly one use case, and `remember` remains that use case.
- The single-value rule is still enforced by the store inside each commit ([ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md)).
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): a succession and a correction are different operations on different time axes.

**Acceptance criteria.**
- [x] The scenario runner, in replay, reports staleness rate 0 and false invalidation rate 0 over the whole scenario set, and prints the missed invalidation rate.
- [x] The scenario "succession" passes: the earlier fact is ended at the moment of change, the later one is current, asking as of an earlier date returns the earlier one, and fact history shows a succession.
- [x] The scenario "correction" passes: asking as of any date returns the right fact, and asking what was known before the correction returns the wrong one.
- [x] The scenario "unrelated fact about the same subject" passes with no fact invalidated, and with an LLM client that fails on any call whose task is `conflict_detection`.
- [x] The scenario "multi-valued predicate" passes with both facts current and no `conflict_detection` call.
- [x] A unit test shows that a judge returning `llm_failed` leaves the stored fact live and returns the new fact in `skipped`.
- [x] A unit test shows that with `correctionPolicy: 'human_approval'` no stored fact is changed.
- [x] A unit test shows the audit entries of a succession made by `remember` carry `judged_ended`, and those of a correction carry `judged_wrong`.
- [x] A unit test shows that when the commit of a succession fails with `conflict`, the facts of the first commit stay recorded and the new fact is returned in `skipped`.
- [x] A test of the `remember` tool (FL-035) shows that its output validates against its updated output schema, and the MCP smoke test still passes.
- [x] The new ADR exists and is listed in [`DECISIONS.md`](../../architecture/DECISIONS.md), and the diff of the commit changes each of the four sentences listed in technical requirement 5.

**Validation.** Unit tests of `remember` with a scripted judge and the in-memory store. The scenario set in replay inside `pnpm check`. One live run by hand: the owner runs the scenario set three times against the real API and records the three metrics for each run.

**Completion evidence.** The commit with the code and the new recordings; the scenario runner's output in replay showing the two zeros and the missed invalidation rate; the three live-run results; the new ADR and the updated sections of `INTERFACES.md`, `MCP-TOOLS.md` and EPIC-04.

**Recorded evidence.** Done on 2026-11-20 on Linux x64 with Node.js v22.23.4, with the owner's approval to go ahead before FL-041 and FL-039, on which it depends, finish their review. Every acceptance criterion is met. The item is `Under Review` because those two are, and because the recording run, which technical requirement 4 gives to the owner, was made by the agent with the owner's key and is the owner's to confirm.

Commits, in order:

1. `docs: add ADR 0022, remember commits each correction on its own, and change the sentences of the old rule`;
2. `feat(core): add the reason codes judged_ended and judged_wrong`;
3. `feat(graph-rag): let remember end or invalidate a stored fact on the conflict judge's verdict`;
4. `feat(mcp-server): pass the conflict judge to remember and return supersedes in its output`;
5. `test(mcp-server): run the timeline scenarios with the conflict judge, recorded again with the owner's key`.

Built:

- **The decision.** [ADR 0022](../../architecture/adr/0022-remember-commits-each-correction-on-its-own.md), listed in `DECISIONS.md`. Its commit changes the boundary in EPIC-04, the description of `remember` in `INTERFACES.md` ("writes everything but the corrections", with the one source per commit that purge covers by content hash), the `remember` section of `MCP-TOOLS.md`, and the test name of FL-023, now "writes everything but the corrections in one commit".
- **The reason codes.** `judged_ended` and `judged_wrong` in `core`, `INTERFACES.md` and the parity test.
- **`remember`.** `RememberDeps` gains an optional `judge`. A fact that conflicts with stored facts goes to the judge when it is present and the policy is `automatic`; `resolveConflict` turns the verdicts into a skip, a restatement, or a supersession. The facts that need no correction are recorded by one `recordFacts` call; then each succession is one `endFact` call, with `validTo` at the moment of change and the new fact as successor, and each correction one `invalidateFact` call, with the new fact as replacement. Each has its own source with the call's text, the trigger given to `remember`, and `judged_ended` or `judged_wrong`. A commit that fails with `conflict` or `already_invalidated` leaves its fact in `skipped`, and the first commit stands.
- **The result.** `RememberedFact` gains `supersedes`, `{ factId, kind }` or null, and the tool output `supersedes`, `{ fact_id, kind }` or null, in its output schema and in `MCP-TOOLS.md`. `record_fact` returns it as null.
- **The wiring.** The composition root passes `judgeConflicts` from `@factloom/maintenance` through the same Anthropic client. `graph-rag` imports no `maintenance`.
- **The scenarios.** The runner of FL-039 takes the judge; `createScenarioLlm` builds the extraction client and the judge of a scenario from its recordings, each under its own task's model. `SCENARIOS_FAILING_UNTIL_FL_042` is now empty. The two scenarios whose conflicts the rules before the LLM decide, "multi-valued predicate" and "unrelated fact about the same subject", run with a judge whose LLM throws on a `conflict_detection` call.

The recording run. `pnpm run record:scenarios` ran from `apps/mcp-server` with `ANTHROPIC_API_KEY` set for that command only, from `OWNER_ANTHROPIC_API_KEY`, and exited 0: 23 calls to `claude-haiku-5-5`, 20 for extraction and 3 for `conflict_detection`, every stop reason `end_turn`; 1,842 input tokens, 3,312 output, 3,140 written to the cache and 44,649 read from it. The judge was called by the succession, correction and late-arriving Render facts. It wrote 3 new recordings and wrote 9 of the 20 extraction recordings again with the same keys: their facts are the same, field for field, and only the wording of a statement or a confidence differs. The 23 recordings hold only `task`, `model`, `instructions`, `input` and `response`, and none matches a key, token, password or machine path pattern.

The scenario runner in replay, inside `pnpm check`:

```text
Timeline scenarios in replay, model claude-haiku-5-5:
PASS  Correction: the database port was recorded wrongly
PASS  A date in the text: the move to pnpm is dated
PASS  A known name mentioned under a different entity type: a convention that is also a decision
PASS  Multi-valued predicate: two conventions at once
PASS  No date in the text: a test framework with an unknown start
PASS  Older fact arriving late: earlier deployment targets
PASS  A plan: an intended move to another deployment target
PASS  Restatement: the package manager is stated twice
PASS  Retraction: a convention that was never followed
PASS  Succession: the test framework was switched
PASS  Unrelated fact about the same subject: a package manager does not replace a test framework

Staleness rate: 0 of 13 (0.000).
False invalidation rate: 0 of 13 (0.000).
Missed invalidation rate: 0 of 2 (0.000).
Historical accuracy: 10 of 10 (1.000).
```

Against the baseline of FL-039, staleness went from 2 of 13 to 0, missed invalidation from 2 of 2 to 0, and historical accuracy from 9 of 10 to 10 of 10; false invalidation stayed 0.

The live runs. The scenario set was run three times against the real API: the recording run and two more in record mode, after which the committed recordings were restored. All three printed staleness 0 of 13, false invalidation 0 of 13, missed invalidation 0 of 2, and historical accuracy 10 of 10, each with 23 calls of which 3 were `conflict_detection`.

`pnpm check`, under `unshare -rn` with no network and no API key, exited 0:

```text
 Test Files  117 passed (117)
      Tests  1158 passed (1158)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the fifth commit: https://github.com/Enriquez-Johnmark/factloom/actions/runs/44761476219.

With the judge's recording `succession/50400f97c004d1d9b3cca5cfe788ac89e7d912f6d8837c4ec05eb8ee41a8c6dc.json` moved aside, the replay test exited 1 and named the file and the record command; the file was restored, byte for byte. Two replayed runs printed the same report, byte for byte.

Unit tests of `remember` with a scripted judge and the in-memory store: a succession ends the stored fact at the moment of change with the new one as successor; its changes carry `judged_ended`; a correction invalidates with the new fact as replacement and carries `judged_wrong`; a failed judge leaves the stored fact live and skips the new one; under `human_approval` nothing changes and the judge is not asked; `unrelated` with an overlap skips; `duplicate` restates; a succession whose moment is not after the stored start skips; and a succession commit that fails with `conflict` leaves the first commit's facts recorded and the new fact skipped. The `remember` tool returns `supersedes`, valid against its output schema, and the stdio smoke test passes.

Rules broken by hand, each then restored:

| Break | Test that failed |
|---|---|
| A failed judge taken as a correction | "leaves the stored fact live and skips the new fact when the judge fails" |
| The policy not read | "changes no stored fact under the correction policy human_approval" |
| A succession marked `reported_ended` | "marks the changes of a succession it made with judged_ended" |
| A failed succession commit fails the call | "keeps the facts of the first commit and skips the new fact" |
| `supersedes` always null in the tool output | the `remember` tool test of `supersedes` |
| No judge given to the scenarios | succession, correction, and the report's two zeros |
| A scenario that calls the judge put on the no-call list | that scenario, and the report |

Differences from the item:

- **The judge is asked only about facts that conflict.** Functional requirement 1 asks for every fact with candidates. The judge's rules before the LLM decide the others the way phase 1 already did, a same object as `duplicate` and the rest as `unrelated`, so asking it would change nothing and could only cost a call.
- **A successor with no start begins at the moment of change.** Without it, the new fact would overlap the ended one and the store would refuse the commit.
- **One stored fact gives way only when it is the only one in the way.** With two conflicting stored facts, a change is not applied even when one of them is judged a succession, because the other would still overlap. Requirement 5 skips only when two are judged a change.
- **`duplicate` on a conflicting stored fact restates it,** as the table of requirement 2 says, even though the objects differ as stored.
- **`MCP-TOOLS.md` had no sentence stating one source per call.** The rule was implied, so a paragraph stating the new one was added to the `remember` section.
- **The recordings and the live runs were made by the agent**, with the owner's key set for each command, as for FL-039.


### FL-043: Proposed changes: storage and operations

| | |
|---|---|
| Status | Under Review |
| Phase | 2 |
| Depends on | FL-042 |
| Requirements | REQ-17 (REQ-CA-16) |
| Components | `@factloom/core` (operations, in-memory store), `@factloom/storage` (migration, adapter, contract suite) |

**Objective.** Store a succession or a correction as a proposal instead of making it, and let a caller approve or reject it, through operations in `@factloom/core` and storage in both stores.

**Background.** `Domain.correctionPolicy` has had the value `human_approval` since phase 1, with nothing behind it. The [research on other domains](../../research/industries/other-industries.md) lists a human approval step as required for legal, healthcare and other regulated domains. The software development domain uses `automatic`, so nothing in phases 2 and 3 depends on this item at run time. It is built now, and kept minimal, because it is the foundation those later domains stand on: a stored proposal, an approve and a reject operation, and a read of pending proposals. [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md) says how a proposal is held: as the operation's input, plain data, which becomes a change set when it is approved, so its recorded time is the time of approval.

The item was split to fit one session. It keeps the storage and the three operations. Calling `proposeChange` from `remember` under the `human_approval` policy, and the command a person runs to list, approve and reject, are FL-070.

**Outcome.** A caller can store a proposal, list pending proposals, approve one, which makes the change, or reject one. The operations are called from tests in this item, from `remember` and a command in FL-070, and from the HTTP API and document flows of later phases.

**Scope.**
- A stored proposal: one table and its migration.
- Three operations in `@factloom/core` (proposed names): `proposeChange`, `approveProposedChange`, `rejectProposedChange`.
- One read: pending proposals of a namespace.

**Non-goals.**
- `remember` storing a proposal, and the command that lists, approves and rejects: FL-070.
- The rule that a later automatic decision does not override a human one. It is the second half of REQ-CA-16, which the [competitive analysis](../../research/evaluations/competitive-analysis.md) defers until an adapter requires human approval, after phase 3. In this item a change that a person rejected can be proposed again when the same text is remembered again, and nothing treats a fact a person changed differently from any other.
- Any user interface, MCP tool or HTTP route. An agent must not approve its own proposal, so no MCP tool is planned. A person uses the command of FL-070; a user interface arrives with [EPIC-10](EPIC-10.md) and [EPIC-11](EPIC-11.md).
- Who may approve. There is no access control before the regulated domains ([ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md)).
- Proposals for anything but a succession or a correction. Merges and archiving in phase 3 report instead of proposing.
- Expiry, reminders, assignment, comments, or editing a proposal before approval.

**Functional requirements.**
1. A proposal records: its identifier, the namespace, and the input of the operation it would run: the stored fact it would change, whether it is a succession or a correction, the moment of change for a succession, the new fact and the source. It also records the time it was proposed, and its state: `pending`, `approved` or `rejected`, with the time of the decision.
2. `proposeChange` stores a proposal and changes no fact.
3. `approveProposedChange` applies the stored input, by building the change set of `endFact` or `invalidateFact` at that moment, and marks the proposal approved, in one commit. The recorded time of the facts it writes is therefore the time of approval, not the time of the proposal, so that a known-at question never shows a belief Factloom did not yet hold.
4. If the stored fact is no longer live at approval, the result is `already_invalidated` and the proposal stays pending. If the change would break the single-value rule, the result is `conflict` and the proposal stays pending.
5. `rejectProposedChange` marks the proposal rejected and changes no fact.
6. A proposal is decided once. Approving or rejecting a decided proposal returns `already_exists`.
7. The read returns the pending proposals of a namespace, oldest first, with the stored fact each refers to.

**Technical requirements.**
1. Proposals are written through `MemoryStore.commit`, by new `Change` kinds (proposed: `record_proposal`, `decide_proposal`), each with an audit entry. Proposed `AuditAction` values: `proposal.recorded`, `proposal.approved`, `proposal.rejected`. `AuditEntry.targetKind` gains `proposal`.
2. What the proposal stores is the input of the operation, not a built `ChangeSet` with its timestamps, as [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md) states. No new decision record is needed for this.
3. The new fact's statement and value, and the source's content, are content. They are stored where purge (FL-061) can reach them: the source is recorded as a source row when the proposal is stored, and the columns that hold the new fact are classified in the schema inventory test of FL-061 by whichever of the two items is built second.
4. `approveProposedChange` and `rejectProposedChange` require the trigger `person`. Any other trigger is `invalid_input`.
5. The migration adds one table. It is append-only except for the one decision, enforced by a trigger in the style of `fact_changes_only_by_invalidation`.
6. `MemoryStore` gains one read method for pending proposals, in both stores.

**Constraints.**
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md): no write without an audit entry.
- [`SCHEMA.md`](../../architecture/SCHEMA.md), rule 6: no free text in the audit log.
- [`SCHEMA.md`](../../architecture/SCHEMA.md), rule 7: a proposal belongs to one namespace and refers only to facts in it.

**Acceptance criteria.**
- [x] Contract suite cases pass against both stores: a recorded proposal is returned by the read; an approved or rejected one is not; a proposal for a fact in another namespace is `not_found`; deciding twice is `already_exists`.
- [x] A unit test shows that `proposeChange` stores one pending proposal and leaves the stored fact live and current.
- [x] A unit test with a fixed clock shows that approving a succession proposal ends the stored fact and records the successor, that both new rows have the approval time as `createdAt`, and that a read with a known-at date between proposal and approval returns the stored fact unchanged.
- [x] A unit test shows the proposal is marked approved and the facts are changed in one commit: with a store that fails the commit, neither happens.
- [x] A unit test shows approval with trigger `agent` is `invalid_input`.
- [x] A unit test shows that rejecting a proposal changes no fact, and that the proposal is no longer returned by the read of pending proposals.
- [x] A unit test shows that approving a proposal whose stored fact has been invalidated since returns `already_invalidated` and leaves the proposal pending.
- [x] A SQLite adapter test shows a direct `UPDATE` of a decided proposal and a `DELETE` of any proposal are refused by triggers.

- [x] `pnpm check` exits 0.

**Validation.** Contract suite against both stores. Unit tests of the three operations. SQLite adapter tests for the triggers. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the updated `INTERFACES.md` and `SCHEMA.md`.

**Recorded evidence.** Done on 2026-11-25 on Linux x64 with Node.js v22.23.4, with the owner's approval to go ahead while FL-042, on which it depends, is under review. Every acceptance criterion is met. The item is `Under Review` because FL-042 is.

Commits, in order:

1. `feat(storage): add the proposed change migration`;
2. `test(storage): expect the ninth migration when a new file is opened`;
3. `feat(core): add record_proposal, decide_proposal and the read of pending proposals to both stores`;
4. `feat(core): add proposeChange, approveProposedChange and rejectProposedChange`;
5. `docs: add Q-85, purge does not yet reach a proposal's new fact`.

The first commit does not pass `pnpm check` on its own: the test of a new file's migrations still listed eight. It was committed because the check's failure was not read before the commit; the second commit fixes it. Neither was pushed before the second, and history was not rewritten.

Built:

- **The table.** `proposed_change`, migration `0009_add_proposed_change.sql`: the stored fact, the kind, `changed_at` for a succession, `new_fact` as JSON, the source, the reason code, `proposed_at`, `state` and `decided_at`. CHECK constraints tie `changed_at` to a succession and `decided_at` to a decision. Triggers refuse every delete and every update but deciding a pending proposal once, in the style of `entity_merge_changes_only_by_undo`. A partial index serves the pending read.
- **The types.** `ProposedChange` and `FactDraftSchema` in `core`, with the operation `proposal`, the actions `proposal.recorded`, `proposal.approved` and `proposal.rejected`, and the target kind `proposal`, in the code, `INTERFACES.md` and the parity test.
- **The changes.** `record_proposal` stores a pending proposal whose stored fact and source are in the namespace; `decide_proposal` decides a pending one once, at the change set's `occurredAt`, not before its `proposedAt`. Both stores apply them with the same refusals.
- **The read.** `MemoryStore.listPendingProposals`: pending proposals of a namespace, oldest first, each with its stored fact.
- **The operations.** `proposeChange` refuses a stored fact that is not live and a succession that would end it before it began, then commits the source and the proposal. `approveProposedChange` requires the trigger `person` and builds the change set of `endFact` or `invalidateFact` from the stored input at the time of approval, with the proposal's source, which is not recorded again, and the decision in the same commit. `rejectProposedChange` requires `person` and commits the decision. To build without committing, `endFact` and `invalidateFact` were each split into a plan step and a commit step, drawing identifiers in the same order as before; every earlier test of both still passes.
- **Purge.** The source is a source row; the eleven columns of `proposed_change` are classified in the inventory test of FL-061, `new_fact` as content.

Contract cases, against both stores:

- **P1:** a recorded proposal is returned pending, oldest first, with its stored fact, and changes no fact.
- **P2:** an approved and a rejected proposal are no longer returned, and each has its decision in the audit log.
- **P3:** deciding a decided proposal returns `already_exists`.
- **P4:** deciding a proposal that does not exist returns `not_found`.
- **P5:** a proposal for a fact that does not exist returns `not_found`.
- **P6:** a decision before the proposal's time is `invalid_input`.
- **N2b:** a proposal for a fact of the other namespace returns `not_found`, and neither namespace's read returns it.

Unit tests, with the in-memory store and a fixed clock:

- `proposeChange` stores one pending proposal and leaves the stored fact live and current; it refuses a succession before the stored fact began.
- Approving a succession ends the stored fact and records the successor, both with the approval time as `createdAt`, and a read with a known-at date between proposal and approval returns the stored fact unchanged.
- With a store that fails only a commit writing a fact, approval leaves the facts as they were and the proposal pending.
- Approval with the trigger `agent` is `invalid_input`.
- Rejecting changes no fact and the proposal is no longer pending; rejecting again is `already_exists`, and an unknown proposal `not_found`.
- Approving after the stored fact was invalidated returns `already_invalidated` and leaves the proposal pending.
- Approving a correction invalidates the stored fact, and the replacement is explained by the proposal's source, with trigger `person` and the proposal's reason code.

SQLite adapter tests, in `proposed-change-migration.test.ts`: a `DELETE` of a pending or a decided proposal, an `UPDATE` of its stored fact, an `UPDATE` that changes `new_fact` along with the decision, and a second decision are refused by the triggers; a succession with no moment of change, a decision with no time and a correction with a moment are refused by CHECK constraints; and the migration applies to a database the earlier ones created.

Rules broken by hand, each then restored:

| Break | Test that failed |
|---|---|
| SQLite decides a decided proposal again | P3, against the SQLite store |
| The in-memory read returns decided proposals | P2, against the in-memory store |
| Any trigger may decide | "refuses an approval whose trigger is agent with invalid_input" |
| The decision committed on its own, before the facts | "marks the proposal approved and changes the facts in one commit" |
| The ended copy recorded at the proposal's time | "ends the stored fact and records the successor, both recorded at the time of approval" |

`pnpm check`:

```text
      Tests  1184 passed (1184)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the third commit, so the migration and its triggers ran on Apple Silicon: https://github.com/Enriquez-Johnmark/factloom/actions/runs/45607435136. It passed again at the fourth: https://github.com/Enriquez-Johnmark/factloom/actions/runs/45608030058.

Differences from the item:

- **A rejection carries the reason code `requested`**, the code for a change a person asked for; the item names none.
- **A proposal stores its reason code**, so that an approved change is recorded with the reason it was proposed for, such as `judged_ended` or `judged_wrong` from FL-070.
- **`proposeChange` refuses up front** a stored fact that is not live and a succession that could never be applied, which the item does not ask for.
- **A decided proposal is told from an unknown one by its audit entries**, because the one read the item adds returns only pending proposals.
- **Purge does not yet clear `new_fact`.** The column is classified as content, as technical requirement 3 asks, but `purgeContent` reaches only the proposal's source. Nothing records a proposal at run time before FL-070, so Q-85 in `OPEN-QUESTIONS.md` holds the question for FL-070, and FL-070's constraints name it.


### FL-070: Human-approval policy in remember, with a command to list, approve and reject

| | |
|---|---|
| Status | Under Review |
| Phase | 2 |
| Depends on | FL-043, FL-042, FL-034 |
| Requirements | REQ-17 (REQ-CA-16) |
| Components | `@factloom/graph-rag` (`remember`), `apps/mcp-server` (command, README) |

**Objective.** For a domain whose correction policy is `human_approval`, make `remember` store a proposal where it would otherwise correct, and give a person a command to list pending proposals and approve or reject one.

**Background.** This item is the second part of FL-043, which built the proposal storage and the operations `proposeChange`, `approveProposedChange` and `rejectProposedChange` (proposed names). REQ-17 asks that correction policy be set per domain: automatic, or proposed for human approval. FL-042 made `remember` correct automatically for an `automatic` domain. Without an entry point a person could not approve anything, so REQ-17 would hold only in tests. An agent must not approve its own proposal, so the entry point is not an MCP tool: it is a command of `apps/mcp-server` that a person runs, in the same way as the purge command (FL-072). The software development domain uses `automatic`, so the command finds proposals only in a namespace whose domain uses `human_approval`; this item's tests use a test domain.

**Outcome.** With a `human_approval` domain, `remember` leaves the stored fact untouched and stores a proposal. A person runs one command to see what waits, and another to approve or reject it. An approved proposal changes memory with the trigger `person`.

**Scope.**
- `remember` calling `proposeChange` where FL-042 calls `endFact` or `invalidateFact`.
- A third reason for a skipped fact (proposed: `proposal_stored`), in `INTERFACES.md` and in the `remember` tool's output schema in [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md).
- A command of `apps/mcp-server` with three forms: list pending proposals, approve one, reject one.
- A short section on the command in the app's README.

**Non-goals.**
- An MCP tool, a user interface or an HTTP route for approval. An agent must not approve its own proposal.
- The rule that a later automatic decision does not override a human one: deferred, as FL-043 states.
- Who may approve. The command runs with the access of whoever can open the database file.
- Proposals from feedback: FL-060 lowers confidence under `human_approval` instead.
- Changing the domain of the composition root. It stays the software development domain, with `automatic`.

**Functional requirements.**
1. With `correctionPolicy: 'human_approval'` and a judge present, `remember` calls `proposeChange` for each new fact that the judge would have used to end or invalidate a stored fact, with the verdict, the stored fact, the moment of change and the new fact. The stored fact is not changed. The new fact is returned in `skipped` with the reason `proposal_stored` and the proposal's identifier.
2. The command is started by an argument to the application's entry point. With no argument the application still serves MCP over stdio. It takes its database and namespace from the same configuration as the server (FL-034) and refuses to start without a namespace.
3. The list form prints each pending proposal, oldest first: its identifier, its kind (succession or correction), the time it was proposed, the stored fact's identifier and statement, and the new fact's statement. It changes nothing.
4. The approve form takes a proposal identifier and calls `approveProposedChange` with the trigger `person`. It prints the identifiers of the facts written. The reject form calls `rejectProposedChange` with the trigger `person`.
5. The command exits with 0 on success, and with a non-zero code and the error code on failure: `not_found`, `already_exists` for a proposal already decided, `already_invalidated` or `conflict` when the stored fact changed since.
6. Only the list form prints statements, because a person must see what they approve. No form prints the content of a source.

**Technical requirements.**
1. The command holds no rule about facts. It parses its arguments, calls one read or one operation, and prints the result. It is not registered as a tool, and `tools/list` does not change.
2. The entry point's handling of a command argument is one small function. If the purge command of FL-072 already exists, this item adds its forms to the same function; if not, it writes the function and FL-072 adds to it.
3. Nothing the command prints goes to standard output in server mode, because the command is a different mode and is not an MCP server ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md)).

**Constraints.**
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md): approval is one commit with its audit entries.
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md): the command works in the configured namespace only.
- Q-85 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md): before `remember` stores proposals, decide how purge reaches a proposal's new fact (FL-043).
- [Architecture rules](../../../.claude/rules/architecture.md): an entry point translates and calls one use case or operation.

**Acceptance criteria.**
- [x] A unit test shows that with a `human_approval` test domain, `remember` on a conflicting text leaves the stored fact live and current, stores one pending proposal, and returns the new fact in `skipped` with the reason `proposal_stored` and the proposal's identifier.
- [x] A unit test shows that with an `automatic` domain, `remember` behaves as in FL-042 and stores no proposal.
- [x] A test starts the command as a child process on a temporary database that holds one pending succession proposal, made with `proposeChange` in the test. The list form prints its identifier and exits 0. The approve form exits 0, and afterwards the stored fact is ended, the successor is current, and the audit entries of the approval carry the trigger `person`.
- [x] A test approves the same proposal a second time with the command and shows a non-zero exit code and `already_exists`.
- [x] A test rejects a pending proposal with the command and shows that no fact changed and the list form no longer prints it.
- [x] A test starts the command with no namespace and shows a non-zero exit code.
- [x] A test that lists the tools of the server built by the composition root finds no tool for approval.
- [x] `pnpm check` exits 0.

**Validation.** Unit tests of `remember` with a test domain whose policy is `human_approval`. Child-process tests of the command. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the README section; the updated `INTERFACES.md` and `MCP-TOOLS.md`.

**Recorded evidence.** Done on 2026-11-25 on Linux x64 with Node.js v22.23.4. Every acceptance criterion is met. The item is `Under Review` because FL-043 and FL-042, on which it depends, are.

Commits: `feat(storage): clear a proposal's new fact when its source is purged`; `docs: describe purge of a proposal's new fact and close Q-85`; `feat(graph-rag): store a proposal in remember under the policy human_approval`; `feat(mcp-server): add the proposals command to list, approve and reject proposed changes`.

Built:

- **Q-85, settled first, as the constraints ask.** Migration `0010_purge_proposed_change.sql` replaces the trigger of migration 9 so that a proposal's `new_fact` may change once more, to a statement of `[purged]`, once its source is purged. Purging a source now replaces the statement, and the value when the object is a value, of every proposal it explains, in both stores and the same commit, and `approveProposedChange` refuses a proposal whose source was purged. The purge test of FL-061 holds a proposal quoting the marker and finds the marker in no column; contract case P7 shows it for both stores. Q-85 is closed.
- **`remember`.** With a judge, a conflict now goes to the judge under either policy. Under `human_approval`, where FL-042 ends or invalidates, `remember` calls `proposeChange` with the verdict, the stored fact, the moment of change, the new fact and the text as source, with the reason code `judged_ended` or `judged_wrong`. The stored fact is not changed, and the new fact is returned in `skipped` with the reason `proposal_stored`. `SkippedFact` gains `proposalId`, null for the other reasons, and the tool output `proposal_id`, in `INTERFACES.md`, `MCP-TOOLS.md` and the output schema.
- **The command.** `factloom proposals list | approve <id> | reject <id>`, parsed in `read-command.ts` and run by `run-proposals-command.ts`, each form one read or one operation with the trigger `person`. `runPersonCommand` is the one function that routes a command argument, to purge or to proposals. The list prints the identifier, kind, proposal time, stored fact and both statements; no form prints a source's content. The app's README has a section and three rows in its table of modes.

Tests:

- `remember` under a `human_approval` test domain stores one pending proposal, leaves the stored fact live and current, and returns the new fact in `skipped` with `proposal_stored` and the proposal's identifier; under `automatic` it changes the fact as in FL-042 and stores no proposal.
- As a child process on a temporary database holding one pending succession proposal made with `proposeChange`: the list prints its identifier and exits 0; approving exits 0, the stored fact is ended, the successor is current, and the approval's audit entry carries `person`; approving again exits non-zero with `already_exists`; rejecting changes no fact and the list no longer prints it; with no namespace the command exits non-zero.
- The tools of the composition root's server include none whose name speaks of approving, rejecting or proposals.
- The trigger `agent` in the command, broken by hand and restored, failed the three child-process tests that decide.

`pnpm check`:

```text
      Tests  1194 passed (1194)
```

Differences from the item:

- **The child-process tests run the test entry `serve-with-fake-embedder.ts`, not `main.ts`.** Approving records a fact, which needs its vector, and the local model is not in the cache during `pnpm check`. The test entry now routes a command argument through the same `runPersonCommand` as `main.ts`.
- **The judge is asked under `human_approval` too.** FL-042 asked it only under `automatic`; a proposal needs the verdict.
- **Q-85 was settled in this item by building purge for proposals**, not only deciding it, so that `remember` never stores text purge cannot reach.


### FL-044: reviseValidTime operation

| | |
|---|---|
| Status | Completed |
| Phase | 2 |
| Depends on | FL-010 |
| Requirements | REQ-02, REQ-06, REQ-15, REQ-24 |
| Components | `@factloom/core` (operation), `@factloom/storage` (contract suite case) |

**Objective.** Change the valid period of one or more facts in one commit, so that the date of a succession can be moved.

**Background.** `endFact` changes one fact. Moving the date of a succession means changing the end of one fact and the start of the next together, and doing them one at a time would pass through a state that breaks the single-value rule. [`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 2", gives the signature and behaviour. [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md) lists it as a consequence, and the [fact schema spike](../../../spikes/fact-schema/README.md) checked that replacing both neighbours leaves no overlap and no gap.

**Outcome.** Product 2, and later a person, can correct when something changed without retracting what changed.

**Scope.**
- The operation `reviseValidTime` in `@factloom/core`, with the signature in `INTERFACES.md`.
- One reason code for a period found to be wrong (proposed: `period_corrected`).
- One case in the storage contract suite.

**Non-goals.**
- An MCP tool or a use case that calls it. No phase 2 or 3 work item needs one; `invalidate_fact` covers what an agent reports.
- Changing anything but `validFrom` and `validTo`.
- A new `Change` kind or migration. The operation is built from `record_fact` and `invalidate_fact`, and its `Operation` name is the existing `revision`. `INTERFACES.md` says each phase 2 operation adds a kind and a name; this one does not need to, and the item corrects that sentence.

**Functional requirements.**
1. Each fact in `revisions` is invalidated and superseded by a copy that carries the new valid period, in one commit.
2. Each copy keeps the original's subject, predicate, object, statement and confidence, and carries the original's sources plus the source given with the call.
3. The single-value rule is checked once, on the result. Two neighbouring facts whose periods are swapped across a boundary succeed, although either revision alone would overlap the other fact.
4. Errors are those of `endFact`: `invalid_input` for an empty list, a fact listed twice, or a period whose start is not before its end; `not_found`; `already_invalidated`, with the superseding fact; `conflict` when a revised period overlaps a live fact that is not part of the same call; `embedding_failed` and `storage_failed`.
5. Any failure leaves memory as it was.
6. The result lists the identifiers of the copies, in the order of the input.

**Technical requirements.**
1. Each copy's embedding is `{ copyFromFactId }`. The embedder is not called.
2. The commit writes one audit entry for the source, and two for each revision: `fact.recorded` and `fact.invalidated`, all sharing one operation identifier.
3. The operation is one exported function in one file, with a doc comment, added to the public API list in `SYSTEM-BOUNDARIES.md`.

**Constraints.**
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md).
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md): changes apply in order, and the rule is checked after all of them.

**Acceptance criteria.**
- [x] A unit test moves the date of a succession by revising both neighbours in one call. Afterwards, with fixed as-of dates on each side of the old and the new boundary, each date returns exactly one fact, and no date returns two.
- [x] The same test, asked with a known-at date before the revision, returns the old periods.
- [x] A unit test shows a revision that overlaps a third live fact returns `conflict` with that fact in `relatedFactIds`, and that no row was written.
- [x] Unit tests cover each refusal in functional requirement 4, asserting the error code.
- [x] A unit test passes with an embedder that fails if called.
- [x] A unit test shows `2n + 1` audit entries for `n` revisions, sharing one operation identifier, with operation `revision`.
- [x] A contract suite case passes against both stores: a change set that invalidates two neighbouring facts and records their copies with a moved boundary commits, and the same change set with only one of the two pairs fails with `conflict`.

**Validation.** Unit tests with `createTestDeps` and the in-memory store. The contract suite against both stores. `pnpm check`.

**Completion evidence.** The commit and the passing check output.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in two commits: `feat(core): add the reviseValidTime operation` (the operation, the reason code `period_corrected`, and the changes to [`INTERFACES.md`](../../architecture/INTERFACES.md), [`SCHEMA.md`](../../architecture/SCHEMA.md) and [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md)), and `test(storage): add a contract case for a moved boundary between neighbouring facts`.

`reviseValidTime` is in `packages/core/src/operations/revise-valid-time.ts`. It refuses an empty list, a fact listed twice and a period that does not end after it starts. It then reads each fact as live, and builds one change set with operation `revision`: the source, then for each revision a `record_fact` of the copy followed by the `invalidate_fact` of the original that links to it. Each copy keeps the original's sources and gains the new one, has `{ copyFromFactId }` as its embedding, and is held to the single-value rule when the domain marks its predicate single-valued. The store checks the rule once, on the result.

Unit tests, in `revise-valid-time.test.ts`, 14 in all:

- **Moving a succession.** The date is moved from 15 March to 1 March by revising both neighbours in one call. Afterwards each of 28 February, 1 March, 10 March, 15 March and 20 March returns exactly one value. With a known-at date before the revision, 10 March still returns PostgreSQL 14.
- **The rule.** Revising only the successor across the boundary returns `conflict` naming the ended fact. A revision that overlaps a third live fact, PostgreSQL 13, returns `conflict` with that fact and writes no row.
- **The copies.** Each copy keeps its object, statement and confidence, and has the original's sources plus the new one. The copies are listed in the order of the input, and each original links to its copy.
- **No embedding.** The revision passes with an embedder that throws if called.
- **Audit.** Two revisions write 5 audit entries under one operation identifier, with operation `revision` and reason code `period_corrected`.
- **Refusals.** An empty list, a fact listed twice and an empty period each give `invalid_input`; a missing fact `not_found`; a fact already revised `already_invalidated` with its copy. A list whose second fact is missing changes nothing.

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| No check for an empty list | 1 |
| No check for a fact listed twice | 1 |
| The given period not applied | 4 |
| The original's sources dropped from the copy | 1 |
| No link from the original to its copy | 2 |
| Operation `succession` instead of `revision` | 1 |
| The in-memory store skips the single-value rule for a revision | Only contract case A6 |

Removing the operation's own check of an empty period failed no test: the store's schema refuses the copy with `invalid_input` as well, so the outcome is the same. The check stays because it refuses before any read and names the fact.

Contract case A6, in the group "single-value rule and namespaces", passes against the in-memory store and SQLite. It starts from the fixture's succession, PostgreSQL 14 until 15 March and PostgreSQL 16 from then. The change set that revises only PostgreSQL 16 to start on 1 March fails with `conflict` naming the ended fact, and writes nothing. The change set that revises both commits, and on 10 March only the revised PostgreSQL 16 is true. The counts of registered cases rise to 17 and 18.

`pnpm check`:

```text
$ biome format .
Checked 283 files. No fixes applied.
$ biome lint .
Checked 283 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  75 passed (75)
      Tests  815 passed (815)
```

The one info is the `useIndexOf` note in `packages/storage/src/change-sequence-generator.ts`, present before this item.

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the second commit: https://github.com/Johnmark-Tech/factloom/actions/runs/43986654382.

Differences from the item:

- `INTERFACES.md` said that `reviseValidTime` needs no `Change` kind, `Operation` name, action or reason code. It now says that it adds only the reason code `period_corrected`, and that it is made of `record_fact` and `invalidate_fact` changes under the existing `revision` operation.
- The input type of one revision is exported as `ValidTimeRevision`, beside `ReviseValidTimeInput`.
- `embedding_failed` is not tested: the operation computes no vector, so it can come only from the store copying a vector that is missing, which contract case C5 covers.

### FL-045: Confidence history and adjustConfidence

| | |
|---|---|
| Status | Completed |
| Phase | 2 |
| Depends on | FL-015, FL-016, FL-017 |
| Requirements | REQ-01, REQ-18, REQ-24 |
| Components | `@factloom/core` (operation, schemas, in-memory store), `@factloom/storage` (migration, adapter, contract suite) |

**Objective.** Record a new **confidence** for a fact without copying the fact, and make every read return the confidence that held at its known-at date.

**Background.** `fact.confidence` is the confidence at recording and can never change ([`SCHEMA.md`](../../architecture/SCHEMA.md), notes on the columns). [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md) decides that a confidence change is not a revision: a copy per adjustment would change the fact's identifier and its recorded date every time. `SCHEMA.md`, "Planned additions", describes the `fact_confidence` table. [`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 2", gives the signature. Confidence changes on feedback or on a failed verification, never on a timer.

**Outcome.** The follow-up on feedback (FL-060) and the phase 3 verification jobs have an operation that lowers or raises a fact's confidence. A reader always sees the latest confidence recorded at or before the date it asks about.

**Scope.**
- The migration that adds `fact_confidence`.
- A `Change` kind (proposed: `adjust_confidence`), an `AuditAction` (proposed: `fact.confidence_adjusted`) and an `Operation` name (proposed: `confidence_adjustment`).
- The operation `adjustConfidence`.
- Reads in both stores returning confidence as of the known-at date.

**Non-goals.**
- Deciding when confidence changes. FL-060 for feedback; FL-051 for verification.
- Decay of confidence over time. The [research on decay](../../research/technical/memory-decay-and-consolidation.md) advises against it.
- Using confidence in rank fusion. Score and confidence stay separate ([`GLOSSARY.md`](../../../GLOSSARY.md), "Score").

**Functional requirements.**
1. `adjustConfidence` appends one row: the fact, the new confidence, and the time. The fact row, its identifier and its `created_at` do not change.
2. It returns the fact's identifier and the confidence that held before the call.
3. Errors: `invalid_input` for a confidence outside 0 to 1; `not_found`; `already_invalidated`; `storage_failed`.
4. Every read that returns a fact returns, as `confidence`, the latest value recorded at or before the read's known-at date, or the fact's confidence at recording if there is none. This applies to `listFacts` with a time filter and to both search lanes.
5. `getFact`, and `listFacts` with `time: 'all'`, have no known-at date and return the latest confidence.
6. Two adjustments with the same timestamp are ordered by insertion; the later insertion wins.

**Technical requirements.**
1. The table is append-only. Triggers refuse every update and delete, in the style of the first migration.
2. A row belongs to the namespace of its fact. A commit refuses an adjustment to a fact outside the change set's namespace with `not_found`.
3. The audit entry's `detail` holds the previous and the new confidence. Both are numbers, which the audit schema allows.
4. The `Operation` comment in `INTERFACES.md` names four additions for phases 2 and 3 and none of them is a confidence adjustment. The item adds the fifth name there and in `SCHEMA.md`.
5. The migration carries a comment saying what the Postgres version will do differently, as `.claude/rules/data.md` requires.
6. The in-memory store implements the same behaviour, so the contract suite runs against both.

**Constraints.**
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): the fact row is untouched.
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md): the adjustment is a change in a commit, with one audit entry.
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "Migrations": a new numbered file; the first migration is not edited.

**Acceptance criteria.**
- [x] Contract suite cases pass against both stores, with a fixed clock: a fact recorded at confidence 0.9 and adjusted to 0.4 later is returned with 0.9 for a known-at date before the adjustment and 0.4 for one after; `getFact` returns 0.4; each search lane returns 0.4 with the default time filter.
- [x] A contract case shows the fact's identifier, `createdAt` and row count are unchanged by an adjustment.
- [x] Contract cases cover the refusals: confidence 1.5 is `invalid_input`; a missing fact is `not_found`; an invalidated fact is `already_invalidated`; a fact in another namespace is `not_found`.
- [x] A contract case shows one audit entry per adjustment, with action `fact.confidence_adjusted` and the two numbers in `detail`.
- [x] A SQLite adapter test shows a direct `UPDATE` or `DELETE` on `fact_confidence` is refused.
- [x] A SQLite adapter test opens a database created by the earlier migrations only, applies the new one, and reads an existing fact with its confidence at recording.

**Validation.** The contract suite against both stores. SQLite adapter tests for the triggers and the migration. A unit test of the operation with the in-memory store. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the migration file's name and hash as recorded by the migration runner in the test.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in three commits: `feat(storage): add the fact_confidence migration`, `feat(core): add the adjust_confidence change to both stores`, and `feat(core): add the adjustConfidence operation`.

The names proposed in the item are kept: the `Change` kind `adjust_confidence`, the action `fact.confidence_adjusted`, and the operation `confidence_adjustment`. They are in `INTERFACES.md`, `SCHEMA.md` and the parity test of `core`. `SCHEMA.md` gains a section, "Added by later migrations", because its "Tables" block is held by a test to the first migration exactly; the row of "Planned additions" for `fact_confidence` is removed.

The migration is `packages/storage/migrations/0002_add_fact_confidence.sql`, recorded by the migration runner in the test as `0002_add_fact_confidence.sql`, sha256 `e3ae562615f546ceb27a5b0bab7a77874c0ce02bf79c1e344c8212712d56cfff`. It holds the table, an index on `(fact_id, adjusted_at)`, two triggers that refuse update and delete, and a comment on what Postgres will do differently.

Reads. In SQLite the confidence of a row is one expression, in `packages/storage/src/confidence-columns.ts`: the latest `fact_confidence` row of the fact, ordered by `adjusted_at` and then `rowid` descending, with or without `adjusted_at <= @knownAt`, or else `fact.confidence`. `listFacts` with a time filter and both search lanes use the known-at form; `getFact` and `listFacts` with `live` or `all` use the latest. The in-memory store applies the same rule in `confidenceAt`.

Contract cases, against both stores:

- **Q1** recorded at 0.9 on 2026-06-01 and adjusted to 0.4 on 2026-07-01: 0.9 known at 2026-06-15, 0.4 known at 2026-07-01 and now.
- **Q2** `getFact`, and `listFacts` with `live` and `all`, return 0.4.
- **Q3** the keyword lane and the vector lane each return 0.4, as of now and known at now.
- **Q4** the identifier, `createdAt` and the list of fact rows are unchanged.
- **Q5** one audit entry, `fact.confidence_adjusted`, with `{ previousConfidence: 0.9, confidence: 0.4 }`.
- **Q6** two adjustments at the same time: the later one wins, and the second entry's previous confidence is the first's.
- **Q7 to Q9** 1.5 is `invalid_input`, a missing fact `not_found`, an invalidated fact `already_invalidated` with its successor.
- **N6** a fact of the other namespace is `not_found`.

The registered counts rise to 52 in the first group, and to 18 and 19 in the second.

SQLite adapter tests, in `fact-confidence-migration.test.ts`. A direct `UPDATE` or `DELETE` on `fact_confidence` is refused with the triggers' messages. A database is created with a directory holding only `0001_initial.sql`, and a fact at 0.9 is written to it with SQL. Opening it with `openSqliteMemoryStore` applies the second migration, and `getFact` returns 0.9.

`adjustConfidence` refuses a confidence outside 0 to 1 and a fact that is not live, and returns `{ factId, previousConfidence }`. Six unit tests cover it.

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| SQLite reads ignore the known-at date | Q1 |
| SQLite orders adjustments at the same time by first insertion | Q6 |
| SQLite adjusts a fact without checking that it is live | Q8, Q9, N6 |
| The in-memory store ignores the known-at date | Q1 |
| The in-memory store orders adjustments at the same time by first insertion | Q6 |
| The in-memory store adjusts an invalidated fact | Q9 |
| `adjustConfidence` returns the new confidence as the previous one | 2 |
| `adjustConfidence` commits under the operation `revision` | 1 |

Removing the range check of `adjustConfidence` failed no test: the change schema refuses the value with `invalid_input` as well. The check stays because it refuses before any read.

`pnpm check`:

```text
$ biome format .
Checked 287 files. No fixes applied.
$ biome lint .
Checked 287 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  77 passed (77)
      Tests  843 passed (843)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the third commit, so the migration and the new SQL ran on Apple Silicon: https://github.com/Johnmark-Tech/factloom/actions/runs/43991184737.

Differences from the item:

- `listFacts` with `live`, like `all`, has no known-at date and returns the latest confidence. The item names only `getFact` and `all`.
- The table has no namespace column: fact identifiers are unique across namespaces, and the commit refuses a fact outside the change set's namespace, as technical requirement 2 asks.
- The audit entry's detail calls the two numbers `previousConfidence` and `confidence`.

### FL-046: Feedback operation and migration

| | |
|---|---|
| Status | Completed |
| Phase | 2 |
| Depends on | FL-015, FL-022 |
| Requirements | REQ-18, REQ-24 |
| Components | `@factloom/core` (operation, in-memory store), `@factloom/storage` (migration, adapter, contract suite), `@factloom/graph-rag` (use case) |

**Objective.** Record that an agent or a person found a recalled fact right, wrong or out of date, without changing any fact.

**Background.** [`INTERFACES.md`](../../architecture/INTERFACES.md) defines `recordFeedback`, which records a signal and decides nothing, and says product 2 then calls `invalidateFact`, `endFact` or `adjustConfidence` under the domain's correction policy. [`SCHEMA.md`](../../architecture/SCHEMA.md), "Planned additions", describes the `feedback` table. [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md) lists a feedback tool as phase 2. The [research on decay](../../research/technical/memory-decay-and-consolidation.md) calls explicit feedback the only signal that reflects truth and not popularity.

The original item was split in three. This one records feedback. The MCP tool is FL-059, and acting on feedback is FL-060. What was said with the feedback is stored as the content of a source, so it passes the secret check of FL-022 first. That check is internal to `@factloom/graph-rag`, and `core` may not import it, so this item also adds the thin use case that runs the check and then calls the operation, as `changeFact` does for its explanation.

**Outcome.** A caller can put on record that a fact was found right, wrong or out of date, with what was said. Nothing about the fact changes yet. FL-059 exposes this to an agent, and FL-060 acts on it.

**Scope.**
- The migration that adds `feedback`.
- A `Change` kind (proposed: `record_feedback`), the `Operation` name `feedback`, an `AuditAction` (proposed: `feedback.recorded`), a reason code (proposed: `feedback_given`), and the audit target kind `feedback`.
- The operation `recordFeedback` in `@factloom/core`, in both stores.
- A use case in `@factloom/graph-rag` (proposed: `giveFeedback`) that checks the comment for secrets and calls `recordFeedback`.

**Non-goals.**
- The MCP tool: FL-059.
- Acting on feedback: FL-060. In this item the result of `giveFeedback` always says that nothing followed.
- Using an LLM to read the comment.
- Counting several signals, or weighing one reporter against another.
- A read of feedback through MCP.

**Functional requirements.**
1. `recordFeedback` writes one feedback row: the fact, the signal (`right`, `wrong` or `outdated`), the trigger, the time, and the source that holds what was said, if anything was. It changes no fact. Errors: `invalid_input`, `not_found`, `storage_failed`. It does not refuse a fact that is no longer live, because a fact recalled with a past known-at date can be one.
2. The source, when given, is recorded in the same commit as the feedback row, with an identifier and a content hash as in `recordFacts`.
3. `giveFeedback` takes the namespace, the fact identifier, the signal, an optional comment and the trigger. It runs the secret check of FL-022 on the comment. On a match it returns that `invalid_input`, which names the kind of secret and never the value, and nothing is stored.
4. Otherwise `giveFeedback` calls `recordFeedback` once, with the comment as the content of a source of kind `agent_note` and `now` as its observed time, or with no source when there is no comment.
5. The result of `giveFeedback` is the feedback identifier and `followUp`, one of `confidence_raised`, `confidence_lowered`, `retracted`, `ended`, `none`. In this item it is always `none`. The shape is fixed here so that FL-059 and FL-060 do not depend on each other.

**Technical requirements.**
1. `feedback` is append-only, with triggers that refuse update and delete. A row belongs to the namespace of its fact, and a commit refuses feedback on a fact outside the change set's namespace with `not_found`.
2. The signature of `recordFeedback` is the one in `INTERFACES.md`. The use case and its types are settled here and added to `INTERFACES.md`, "Use cases", and to the public API of `@factloom/graph-rag` in [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md).
3. The audit entry's `detail` holds identifiers only. The signal is a fixed word stored in the feedback row.
4. The in-memory store implements the same behaviour, so the contract suite runs against both stores.
5. The migration carries a comment saying what the Postgres version will do differently, as `.claude/rules/data.md` requires.

**Constraints.**
- [`SCHEMA.md`](../../architecture/SCHEMA.md), rule 6: the comment is a source, not text in the audit log or in the feedback row.
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md): feedback is a change in a commit, with one audit entry.
- [ADR 0019](../../architecture/adr/0019-writes-containing-a-secret-are-refused.md): a write that contains a recognisable secret is refused.
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "Migrations": a new numbered file.

**Acceptance criteria.**
- [x] Contract suite cases pass against both stores: a feedback row is recorded with one audit entry whose action is `feedback.recorded`; a missing fact is `not_found`; a fact in another namespace is `not_found`; feedback on an invalidated fact is recorded; no fact row changes.
- [x] A contract case shows feedback with a source records the source and the feedback in one commit, with one operation identifier.
- [x] Unit tests of `giveFeedback` with the in-memory store pass with these names: "records feedback with the comment as the content of a source", "records feedback with no source when there is no comment", "refuses a comment that contains a secret and stores nothing", "returns not_found for a fact in another namespace", "says that nothing followed".
- [x] A unit test asserts that no audit entry written by the call contains the comment.
- [x] A SQLite adapter test shows a direct `UPDATE` or `DELETE` on `feedback` is refused.
- [x] A SQLite adapter test opens a database created by the earlier migrations only, applies the new one, and records feedback on an existing fact.
- [x] `pnpm check` exits 0.

**Validation.** Contract suite against both stores. Unit tests of the operation and the use case. SQLite adapter tests for the triggers and the migration. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the updated `INTERFACES.md`, `SCHEMA.md` and `SYSTEM-BOUNDARIES.md`.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in four commits: `feat(storage): add the feedback migration`, `feat(core): add the record_feedback change to both stores`, `feat(core): add the recordFeedback operation`, and `feat(graph-rag): add the giveFeedback use case`.

The proposed names are kept: the `Change` kind `record_feedback`, the operation `feedback`, the action `feedback.recorded`, the reason code `feedback_given` and the target kind `feedback`. The row is a new core schema, `FeedbackSchema` with `FeedbackSignalSchema`, in `packages/core/src/feedback.ts`, and the `Feedback` type is in `INTERFACES.md` and the parity test. The audit entry's `detail` is `{ factId }`.

The migration is `0003_add_feedback.sql`, sha256 `04f3ad5dd10ca9d9e1b06dbb4a8fa7a4062cfa79a28ed02b6ed58a54f8cbcf90`. It holds the table, an index on `(namespace, fact_id, recorded_at)`, two triggers that refuse update and delete, and a comment on Postgres. Unlike `fact_confidence`, the row has its own identifier and a `namespace` column, because a feedback row is a thing of its own that an audit entry names.

Contract cases, against both stores:

- **G1** one audit entry, `feedback.recorded`, with `{ factId }`, and no fact or fixture audit entry changes.
- **G2** a source and feedback in one change set share one operation identifier and name the source.
- **G3** feedback on an invalidated fact is recorded.
- **G4 to G6** a missing fact and a missing source are `not_found`; a repeated identifier is `already_exists`.
- **N7** a fact of the other namespace is `not_found`.

Registered counts rise to 58 in the first group, and to 19 and 20 in the second.

SQLite adapter tests, in `feedback-migration.test.ts`. A direct `UPDATE` or `DELETE` on `feedback` is refused. A database is made with only the first two migrations and a fact; opening it applies the third, and a commit records feedback on that fact.

Unit tests:

- **`recordFeedback`, 5 tests:** with a source, with none, on a fact no longer live, no fact changes, a missing fact.
- **`giveFeedback`, 6 tests,** under the five names the item gives and "writes no audit entry that contains the comment". The secret is a GitHub token assembled from fragments, so that the scan of tracked files of FL-022 does not find it.

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| SQLite refuses feedback on a fact that is not live | G3 |
| The in-memory store skips the check that the fact exists | G4, N7 |
| `giveFeedback` ignores the result of the secret check | "refuses a comment that contains a secret and stores nothing" |

`pnpm check`:

```text
$ biome format .
Checked 293 files. No fixes applied.
$ biome lint .
Checked 293 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  80 passed (80)
      Tests  870 passed (870)
```

`INTERFACES.md` gains `Feedback`, the new `Change`, `Operation`, `ReasonCode`, action and target kind, `giveFeedback` with `FeedbackFollowUp` under "Use cases", and the detail of `feedback.recorded`. `SCHEMA.md` describes the table under "Added by later migrations", lists the new values in the notes on the columns, and drops the row from "Planned additions". `SYSTEM-BOUNDARIES.md` lists `recordFeedback` in `core` and `giveFeedback` in `graph-rag`.

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the fourth commit: https://github.com/Johnmark-Tech/factloom/actions/runs/43992326872.

Differences from the item:

- A blank comment is treated as no comment, so no empty source is stored.
- The feedback row records the trigger given to the call, which is also the change set's trigger.
- When the operation commit was made, `pnpm check` ran with the use case's new files present in the working tree but not yet exported; the use case was committed and checked next.

### FL-059: give_feedback tool

| | |
|---|---|
| Status | Completed |
| Phase | 2 |
| Depends on | FL-046, FL-036, FL-058 |
| Requirements | REQ-18, REQ-10 |
| Components | `apps/mcp-server` (tool, instructions, tests) |

**Objective.** Add the sixth MCP tool, `give_feedback`, so that an agent can pass on that a recalled fact was found right, wrong or out of date.

**Background.** [ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md) fixes five tools as the phase 1 surface and says phase 2 adds one, `give_feedback`, when feedback has something to act on it. [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Not in phase 1", lists a feedback tool for phase 2. The use case behind it is `giveFeedback` (FL-046). The tool reuses the translation of an error from the `recall` tool (FL-058), and joins the five-tool surface that FL-036 fixes in its test. The smoke test (FL-037) and the clean-install job (FL-003) also list the tools. They are phase 1 items and are normally built before this one; if either is not built yet, it is written with the six names when it is built.

**Outcome.** An agent that is told "that's not right" about a recalled fact can pass the signal on with one tool call. `tools/list` returns six tools.

**Scope.**
- The tool definition and handler.
- The server's `instructions` string, which now mentions the tool.
- The section for the tool in `MCP-TOOLS.md`, with its rows in the error and annotation tables.
- The tests that fix the tool list: the test of the tool surface (FL-036), and, where they exist, the smoke test (FL-037) and the clean-install job (FL-003), now expect six names.

**Non-goals.**
- Acting on the feedback: FL-060. The tool returns whatever `followUp` the use case gives.
- A new decision record for the number of tools. ADR 0016 already provides for the sixth.
- A read of feedback through MCP.
- A tool to approve a proposal or to purge. An agent must not do either.

**Functional requirements.**
1. The tool `give_feedback`:

   | Input | Type | Required | Meaning |
   |---|---|---|---|
   | `fact_id` | string | Yes | The fact, as returned by `recall` |
   | `signal` | `"right"`, `"wrong"` or `"outdated"` | Yes | What the reporter found |
   | `comment` | string, 1 to 1,000 characters | No | What was said. Stored as the content of a source of kind `agent_note` |

   Output: `{ feedback_id, follow_up }`, where `follow_up` is one of `confidence_raised`, `confidence_lowered`, `retracted`, `ended`, `none`.
2. The handler calls `giveFeedback` with the configured namespace and the trigger `agent`, and nothing else.
3. Errors are `invalid_input`, `not_found` and `storage_failed`, translated as in FL-058. A comment that contains a recognisable secret is `invalid_input`, and the text names the kind of secret and not the value.
4. Annotations: not read-only, not destructive, not idempotent, not open-world.
5. The tool's description tells the agent to use `invalidate_fact` when it knows the replacement or the date, and `give_feedback` when it only knows the fact was found wrong, right or out of date.
6. `tools/list` returns `recall`, `remember`, `record_fact`, `invalidate_fact`, `get_fact_history`, `give_feedback`, in that order.

**Technical requirements.**
1. The tool is one file with one handler that calls one use case.
2. The `instructions` string stays within the limit that FL-034 tests.
3. Every input field has a description, and the tool declares an output schema.

**Constraints.**
- [ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md): five tools in phase 1, a sixth in phase 2; a handler only translates.
- [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "What a handler does".

**Acceptance criteria.**
- [x] Tests of the tool, with a server built from the in-memory store and a client connected in process, pass with these names: "records feedback and returns its identifier", "stores the comment as the content of a source", "returns not_found for an unknown fact", "returns invalid_input for an unknown signal", "refuses a comment that contains a secret".
- [x] A test asserts that after the call `listAuditEntries` for the returned feedback identifier holds one entry with action `feedback.recorded` and trigger `agent`.
- [x] A test named "lists the six tools in order with their annotations" asserts the six names in order, the annotation values, an output schema on each, and a description on every input field.
- [x] The MCP smoke test (FL-037) lists six tools, calls `give_feedback` with `wrong` on a recorded fact, and gets a result with a `feedback_id` and a `follow_up` from the list in functional requirement 1. If FL-037 is not built yet, the item is `Blocked` on FL-037 for this criterion.
- [x] A test named "the instructions fit the limit" still passes.
- [x] `MCP-TOOLS.md` describes the tool, and the tool table there has six rows.
- [x] `pnpm check` exits 0.

**Validation.** Unit tests with fakes and an in-process client. The MCP smoke test. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the updated `MCP-TOOLS.md`.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in two commits: `feat(mcp-server): add the give_feedback tool` and `docs: describe the give_feedback tool in MCP-TOOLS.md`.

The tool is `apps/mcp-server/src/give-feedback-tool.ts`: one handler that calls `giveFeedback` with the configured namespace and the trigger `agent`, and translates the `Result` with `toToolError` and `toToolSuccess`. It is the sixth entry of `FACTLOOM_TOOLS`. Its annotations are not read-only, not destructive, not idempotent and not open-world. Its description sends the agent to `invalidate_fact` when it knows the replacement or the date. The server's instructions gain one sentence on it; the test "the instructions fit the limit" still passes.

Tests, in `give-feedback-tool.test.ts`, with the in-memory store and an in-process client, under the five names the item gives:

- **"records feedback and returns its identifier"** also asserts that `listAuditEntries` for the returned identifier holds one entry with action `feedback.recorded` and trigger `agent`.
- **"returns invalid_input for an unknown signal"** is refused by the SDK before the handler runs, with its own message, `Input validation error: Invalid arguments for tool give_feedback: signal: Invalid option: ...`, as `MCP-TOOLS.md`, "Errors", says of input that fails a tool's schema. The test asserts that message.
- **"refuses a comment that contains a secret"** asserts `invalid_input:` and that the text does not contain the token.

Tests that list the tools now expect six names:

- **"lists the six tools in order with their annotations"** (renamed from five): the six names and annotations, an output schema on each, a description on every input field.
- **The stdio smoke test of FL-037**, `serve-with-fake-embedder.test.ts`: it lists the six tools, and in its second session calls `give_feedback` with `wrong` on the recorded fact, and the result has a `feedback_id` and a `follow_up` from the list.
- **`main.test.ts`**: the six tools.

FL-003, the clean-install job, is not built yet; it is written with the six names when it is built.

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| Trigger `person` instead of `agent` | "records feedback and returns its identifier" |
| `idempotentHint: true` | "lists the six tools in order with their annotations" |
| The tool left out of `FACTLOOM_TOOLS` | the five tool tests and the list test |

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the second commit, including the stdio smoke test with the sixth tool: https://github.com/Johnmark-Tech/factloom/actions/runs/43992743928.

`MCP-TOOLS.md` has six rows in the tool table, a section for `give_feedback`, its row in the annotation table, its name in the rows of `not_found` and of the key table and in "Secrets", and no longer lists a feedback tool under "Not in phase 1".

`pnpm check`:

```text
$ biome format .
Checked 295 files. No fixes applied.
$ biome lint .
Checked 295 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  81 passed (81)
      Tests  875 passed (875)
```

### FL-060: Acting on feedback

| | |
|---|---|
| Status | Pending |
| Phase | 2 |
| Depends on | FL-046, FL-045, FL-042 |
| Requirements | REQ-18, REQ-24 |
| Components | `packages/maintenance` (follow-up), `@factloom/core` (one type, reason codes), `@factloom/graph-rag` (`giveFeedback`), `apps/mcp-server` (wiring) |

**Objective.** Turn recorded feedback into a change: a higher or lower confidence, a retraction, or an ended fact, according to the domain's correction policy.

**Background.** [`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 2": `recordFeedback` decides nothing, and product 2 then calls `invalidateFact`, `endFact` or `adjustConfidence` under the domain's correction policy. FL-046 records feedback and fixed the result shape of `giveFeedback`, with `followUp` always `none`. FL-045 supplies `adjustConfidence`. FL-042 set the pattern used here: a function of product 2 reaches a use case as an optional dependency whose type is in `@factloom/core`, and the composition root passes the implementation from `@factloom/maintenance`.

**Outcome.** After feedback is given, the fact's confidence or liveness reflects it, and the audit log shows both the feedback and what followed, with the trigger `feedback`.

**Scope.**
- A follow-up function in `maintenance` that applies the table below.
- Its function type in `@factloom/core`, and an optional member for it on the dependencies of `giveFeedback`.
- Reason codes for the follow-up changes.
- The composition root passing the follow-up from `maintenance`.

**Non-goals.**
- The tool: FL-059. Nothing in this item changes a tool definition.
- Storing a proposal from feedback under `human_approval`. This item lowers confidence in that case; proposing from feedback waits for the first domain that uses the policy ([EPIC-11](EPIC-11.md)).
- Using an LLM to read the comment. The follow-up is a fixed table.
- Counting several signals before acting, or weighing one reporter against another.

**Functional requirements.**
1. When a follow-up is given to `giveFeedback`, it is called after `recordFeedback` has succeeded, and makes a second commit:

   | Signal | Policy `automatic` | Policy `human_approval` |
   |---|---|---|
   | `right` | `adjustConfidence` upward by a fixed step, to at most 1 | The same |
   | `wrong` | `invalidateFact` with no replacement: a **retraction** | `adjustConfidence` downward by a fixed step, to at least 0 |
   | `outdated` | `endFact` with `validTo` at the time of the feedback and no successor | `adjustConfidence` downward by a fixed step |

2. If the fact is not live, the feedback is recorded and there is no follow-up.
3. Follow-up changes carry the trigger `feedback`, and a reason code that names the signal (proposed: `feedback_right`, `feedback_wrong`, `feedback_outdated`). The feedback row itself carries the trigger of whoever gave it.
4. `invalidateFact` and `endFact` each take a source. The follow-up gives them a source of kind `feedback` with no content. What was said is the content of the source that FL-046 recorded.
5. The result's `followUp` says what was done: `confidence_raised`, `confidence_lowered`, `retracted`, `ended` or `none`.
6. If the follow-up fails after the feedback is recorded, the result is the error, and the feedback stays on record.
7. Without a follow-up among its dependencies, `giveFeedback` behaves as in FL-046.

**Technical requirements.**
1. The follow-up's function type is exported from `@factloom/core`. The implementation is exported from `@factloom/maintenance`. `@factloom/graph-rag` does not import `@factloom/maintenance`.
2. The confidence steps are two named constants. Their values are chosen in this item and recorded in `INTERFACES.md`; no source gives evidence for a particular value.
3. The follow-up reads the correction policy from the domain it is given. It builds no `ChangeSet` and calls no store method that writes.
4. The composition root adds the follow-up to the dependencies it builds for the use cases, in the function that tests can call without starting a server.

**Constraints.**
- Product 2 acts only through fact operations in `@factloom/core`.
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): a confidence change is a row in the confidence history, not a copy of the fact.
- [`SCHEMA.md`](../../architecture/SCHEMA.md), rule 6: no free text in the audit log.

**Acceptance criteria.**
- [ ] Unit tests of `giveFeedback` with the follow-up from `maintenance` and the in-memory store cover all six cells of the table, asserting the result's `followUp`, the fact's state afterwards, and the trigger and reason code of the follow-up's audit entries.
- [ ] A unit test shows `right` at confidence 1 leaves confidence at 1, and `wrong` under `human_approval` at confidence 0 leaves it at 0.
- [ ] A unit test shows feedback on a fact that is not live gives `followUp: none`.
- [ ] A unit test shows that when the follow-up's commit fails, the result is the error and the feedback is still on record.
- [ ] A unit test, with a fixed clock, shows that after `wrong` under policy `automatic` the fact is absent from `listFacts` for now and present for a known-at date before the feedback.
- [ ] A test in `apps/mcp-server` calls the function that builds the use case dependencies, calls `giveFeedback` with them and `wrong` on a recorded fact, and finds the fact retracted with an audit entry whose trigger is `feedback`. This shows the follow-up is wired in.
- [ ] A search of `packages/maintenance` for `commit(` finds nothing outside tests.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests of the follow-up and of `giveFeedback` with it. The wiring test in the app. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the two step values and the reason codes recorded in `INTERFACES.md`.

### FL-047: Purge design, proven by a spike

| | |
|---|---|
| Status | Completed |
| Phase | 2 |
| Depends on | FL-015 |
| Requirements | REQ-19 |
| Components | decision records, `spikes/` |

**Objective.** Complete the design of **purge** in the decision records, and prove with a throwaway spike that the content of a source and of the facts that depended on it cannot be read afterwards.

**Background.** [ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md) decides that purge is the single exception to keeping everything, for legal erasure and for a secret stored by mistake. It specifies the operation in outline and lists what a design review found the phase 2 design must cover. It also lists two questions as not decided. [`INTERFACES.md`](../../architecture/INTERFACES.md) gives the signature of `purgeContent`. [`SCHEMA.md`](../../architecture/SCHEMA.md), "Planned additions", names `fact.purged_at`, `source.purged_at` and a narrowly permitted change in two triggers. The part that could not be added later, an audit log with no free text, has been in place since the first migration.

The original item was split in two. This one decides, and shows on a real database that what was decided works. FL-061 builds the migration and the operation from the completed record, and FL-072 the command.

**Outcome.** ADR 0012 answers every question the phase 2 design must cover, and a spike under `spikes/` shows, on a database built from the project's migrations, that after the designed steps the purged text is found nowhere. FL-061 can be implemented from the record without a further decision.

**Scope.**
- The design, recorded by completing ADR 0012's section "What the phase 2 design must cover".
- A throwaway spike in `spikes/` that applies the designed steps with hand-written SQL and searches for the purged text.
- The names the implementation will use: the `Change` kind (proposed: `purge_content`), the `Operation` name `purge`, `AuditAction` values (proposed: `source.purged`, `fact.purged`) and reason codes (proposed: `erasure_requested`, `secret_stored`), written into `INTERFACES.md` and `SCHEMA.md` as planned.

**Non-goals.**
- The migration, the operation `purgeContent` and the contract cases: FL-061. A way to invoke a purge: FL-072. The spike is not the implementation and no code is moved from it.
- An MCP tool for purge. An agent must not be able to remove content.
- Purging by anything but a source identifier: by subject, by date range, by person.
- A legal determination that a purge satisfies any regulation. Question Q-64 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) needs professional advice.
- Removing rows. The row, its identifiers, its timestamps and its audit entries stay.
- Backups and copies of the database file made outside Factloom.

**Functional requirements.**

The decision record must answer each of these, and the answers become the requirements of FL-061:

1. Which facts a purge covers. `INTERFACES.md` says "every fact that has no other source". ADR 0012 says every copy of a purged fact, because a **revision** copies the statement into a new row that also carries a later source. The design defines "copy" and states the rule that satisfies both.
2. Which other sources a purge covers: every source that explained a change to those facts, and the other source rows that hold the same text. Since FL-042, one `remember` call can record its text as several source rows with one content hash.
3. Whether the purge of an explaining source spreads to facts that came only from that source, or leaves them as **orphaned facts**.
4. What the marker value is for `statement`, `object_value`, `content` and `locator`, given that `object_value` cannot be `NULL` ([ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md)).
5. What happens to a live purged fact: whether it is also invalidated, and how each read method and each retrieval lane treats it.
6. The exact condition under which the triggers on `fact` and `source` permit the change, so that nothing else passes.
7. What happens to the name of an entity that is itself the sensitive value. ADR 0012 lists this as not decided.
8. Whether a purge clears freed pages of the database file and the write-ahead log, and how. ADR 0012 lists this as not decided. No research document covers it, so the answer is checked against the SQLite documentation and run in the spike, with the source cited.
9. How the removal of a keyword entry obtains the old text that an external-content FTS5 index needs.
10. How a person invokes a purge and finds the identifier of the source to purge, given that no MCP tool may do it. The plan, which FL-072 builds, is a command of `apps/mcp-server`.

The spike:

11. The spike creates a database with the migrations that exist when it is written, and builds this memory with hand-written SQL: a fact recorded from a source whose text contains a marker string; the fact ended, so a copy exists; the copy corrected, with an explanation that quotes the string; a second, unrelated fact from another source.
12. It applies the designed steps: the replaced triggers, the marker values, the removal of the keyword and vector entries, and whatever the design decides for freed pages.
13. It then searches for the marker string in every column of every table, in the keyword index, and in the bytes of the database file and its write-ahead log, and prints one line per place searched with "found" or "not found".
14. It also shows that the unrelated fact and its source are unchanged, that no row was removed, and that an `UPDATE` of content that does not meet the design's condition is still refused.

**Technical requirements.**
1. The design is recorded by completing ADR 0012's section "What the phase 2 design must cover". [`DECISIONS.md`](../../architecture/DECISIONS.md) says a decision is changed only by a new record, so if the design changes anything ADR 0012 decided, that part goes in a new record that supersedes it.
2. The spike lives in its own folder under `spikes/`, outside the workspace, with its own `npm ci`, a README that records the command, the output and the versions of SQLite, `better-sqlite3` and `sqlite-vec`, and the date. It follows the form of [`spikes/fact-schema`](../../../spikes/fact-schema/README.md).
3. The spike uses the DDL of the project's migrations unchanged, plus the statements the design adds. If the design cannot be made to work on that DDL, the design is changed, not the spike's schema.
4. Every answer in the decision record is labelled confirmed, likely or unverified, and cites the SQLite documentation page with its access date or the spike's output ([engineering principles](../../../.claude/rules/engineering-principles.md), "Accuracy").

**Constraints.**
- [ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md).
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): purge is the one further change a fact row may undergo.
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md): purge will be a change in a commit.
- `CLAUDE.md`: `spikes/` holds throwaway scripts that verify a claim. They are not the implementation.

**Acceptance criteria.**
- [x] The decision record answers design questions 1 to 10, and each answer cites its source or the spike.
- [x] Running the spike from its folder, with the command its README gives, prints "not found" for the marker string in every table, in the keyword index and in the vector entries, and ends with a line that says the spike passed.
- [x] For the bytes of the database file and the write-ahead log, the spike prints "not found" if the design decides that freed pages are cleared. If the design decides they are not cleared, the spike prints what it found, and the decision record says so in a section titled "What purge does not remove".
- [x] The spike prints that the unrelated fact and its source are unchanged, and that the counts of fact rows, source rows and audit rows are the same before and after.
- [x] The spike prints that an `UPDATE` of `statement`, `object_value`, `content` or `locator` outside the design's condition was refused.
- [x] The spike's README records the output of that run, and `DECISIONS.md` lists any new record.
- [x] `pnpm check` exits 0: the spike is outside the workspace and changes nothing in it.

**Validation.** The spike, run by hand from its folder. Review of the decision record against design questions 1 to 10.

**Completion evidence.** The completed ADR 0012, or the record that supersedes part of it; the spike's README with its output; the commit.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in four commits: `test: add the purge spike for FL-047`, `docs: complete the purge design in ADR 0012`, `docs: add Q-84 on erasing an entity name`, and `docs: record the planned purge names in INTERFACES.md and SCHEMA.md`.

The design is a new section of [ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md), "The phase 2 design (FL-047)", which answers questions 1 to 10, and a section "What purge does not remove". Nothing ADR 0012 decided was changed, so no new record supersedes it and `DECISIONS.md` lists none. In particular, `object_value` and `content` get the marker `[purged]`, not `NULL`, and the locator is cleared, as the record already said. The two open questions of the record are answered. Question 7 leaves entity names out of `purgeContent`, and Q-84 in `OPEN-QUESTIONS.md` keeps the rest open.

The spike is `spikes/purge`, run with `cd spikes/purge && npm ci && node check.mjs`, outside the workspace. It builds a database file from the project's migrations `0001` to `0003`, read unchanged, plus the draft `0004_purge.sql`, then records the memory of functional requirement 11 with hand-written SQL. It adds two things the item did not list:

- a second source row with the same text and hash, which question 2 covers;
- feedback whose comment quotes the marker, from FL-046.

It purges the first source five times, on fresh files, varying the handling of freed pages. The README holds the full output. In run D, the design:

- the marker is "not found" in each of the 14 tables, in the keyword index (`MATCH`), in the vector entries, and in the bytes of the database file and of the write-ahead log, read with the connection open and again after it closed;
- the unrelated fact, its source and its vector are unchanged;
- 8 of 8 updates and deletes outside the design's condition are refused;
- the run ends "The spike passed: run D, the design, leaves the marker nowhere." and exits 0.

What the other runs showed, which shaped the design:

| Run | Finding |
|---|---|
| A, the purge transaction only, FTS5 `secure-delete` off | The term stays in the index's shadow table `fact_fts_data`, readable with SQL, though `MATCH` finds nothing. The old text is in the write-ahead log while the connection is open, and in the database file after it closes |
| B, with `PRAGMA secure_delete` and FTS5 `secure-delete` | The tables are clean, but the old text is still in the log and then the file |
| C, with `VACUUM` and `wal_checkpoint(TRUNCATE)`, FTS5 `secure-delete` off | The term is still in `fact_fts_data` and in the file: it is live index data, which `VACUUM` keeps |
| E, the design and `PRAGMA secure_delete` | The same as D, so the pragma is not part of the design |

Sources cited in the record, each with its access date and label:

- `https://www.sqlite.org/lang_vacuum.html`, read verbatim, confirmed;
- the FTS5 page for the `delete` command and the `secure-delete` option, likely: it was read only as a summary by a fetch tool, and the spike's result confirms the behaviour;
- the pragma page for `wal_checkpoint(TRUNCATE)`, likely, for the same reason; the spike confirms it with a 0-byte log;
- `https://www.sqlite.org/wal.html`, for a reader blocking a checkpoint.

`INTERFACES.md` and `SCHEMA.md` now name the planned change kind `purge_content`, the operation `purge`, the actions `source.purged` and `fact.purged`, the reason codes `erasure_requested` and `secret_stored`, and `purgedAt`. The result of `purgeContent` becomes `{ purgedSourceIds, purgedFactIds }`, because a purge covers more than the one source named.

`pnpm check` exits 0 with 81 test files and 875 tests, unchanged: the spike is outside the workspace.

Differences from the item:

- The counts of fact and source rows are the same before and after: 4 and 6. Audit rows rise from 10 to 17, because the purge writes its own 7 entries, one per change, as ADR 0009 requires; none is removed. The criterion's "the same" is read as "none removed".
- The spike ran on Linux only. The CI job that runs the spikes on macOS arm64 does not list this one; nothing in it is specific to a platform beyond the native modules the other spikes already ran there.
- The spike checks the rows and lanes. How `getFact`, `listFacts` and `recall` show a purged fact is FL-061's, in contract cases.

### FL-061: Purge operation

| | |
|---|---|
| Status | Completed |
| Phase | 2 |
| Depends on | FL-047, FL-016, FL-017 |
| Requirements | REQ-19, REQ-24 |
| Components | `@factloom/core` (operation, in-memory store), `@factloom/storage` (migration, adapter, contract suite) |

**Objective.** Build `purgeContent` from the completed design, so that the content of a source, and of every fact the design covers, can no longer be read through any read method or any query of the database, while the record that it existed stays.

**Background.** FL-047 completed the design in [ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md) and proved it with a spike. [`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 2", gives the signature of `purgeContent`. [`SCHEMA.md`](../../architecture/SCHEMA.md), "Planned additions", names `fact.purged_at`, `source.purged_at` and a narrowly permitted change in two triggers. A purge removes the keyword and vector entries of the facts it covers, so it changes what both retrieval lanes return (FL-016, FL-017).

The item was split to fit one session. It keeps the migration, the operation and its tests. The command that a person runs to purge is FL-072. This item claims only what FL-047's design establishes: content unreadable through every read method and every query of the database, and freed pages of the file cleared only if FL-047 settled how.

**Outcome.** A caller of `purgeContent` removes the content of a source and of the facts the design covers. Tests prove it is gone from every read method, table and index. The audit log still shows that the source and its facts existed, and when and why they were purged.

**Scope.**
- The migration: the two columns and the replaced triggers.
- The `Change` kind, the `Operation` name `purge`, the `AuditAction` values and the reason codes that FL-047 named.
- The operation `purgeContent` in `@factloom/core`, in both stores.
- Tests that search every place content could be read.

**Non-goals.**
- The command that a person runs: FL-072.
- An MCP tool for purge. An agent must not be able to remove content.
- A claim beyond the design of FL-047, for example about freed pages if FL-047 did not settle how to clear them.
- Changing the design. A point the design left open, found while implementing, goes back to the decision record first.
- Purging by anything but a source identifier: by subject, by date range, by person.
- Recording which person ran the purge. An audit entry carries the trigger `person` and no identity of a person; that is an open decision of [EPIC-11](EPIC-11.md).
- A legal determination that a purge satisfies any regulation. Question Q-64 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) needs professional advice.
- Removing rows. The row, its identifiers, its timestamps and its audit entries stay.
- Backups and copies of the database file made outside Factloom.

**Functional requirements.**
1. `purgeContent` replaces the content fields of the source and of every fact and source the design covers with the marker, sets `purged_at` on each, and removes the keyword entry and the vector entry of each covered fact, in one commit.
2. It writes one audit entry for each source and each fact purged, with the trigger and reason code of the call.
3. It returns the purged source and the purged facts. Errors: `not_found`, `storage_failed`. Purging a source that is already purged succeeds and changes nothing.
4. Every identifier, timestamp, supersession link, source link and audit entry is as it was before the purge.
5. A purged fact is treated by each read method and each retrieval lane as the design decides.

**Technical requirements.**
1. The migration replaces `fact_changes_only_by_invalidation`, `source_never_updated` and the keyword index trigger only as far as the design's condition requires. `.claude/rules/data.md` forbids weakening these triggers; purge is its stated exception.
2. A schema inventory test lists every text and binary column of every table in the migrated database and fails if a column is not classified, in one list in the test, as "content, covered by purge" or "not content". A later migration that adds a column must then make that decision. This is what keeps purge complete when other phase 2 items and phase 3 add tables, in whichever order they are built.
3. The in-memory store implements purge, so the contract suite runs against both stores.
4. The migration carries a comment on what the Postgres version will do differently.

**Constraints.**
- [ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md), as completed by FL-047.
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): purge is the one further change a fact row may undergo.
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md): purge is a change in a commit.
- [`TESTING.md`](../../architecture/TESTING.md): "no operation reducing the number of fact rows" still holds.

**Acceptance criteria.**
- [x] A contract suite case, against both stores, builds this memory: a fact recorded from a source whose text contains a marker string; the fact ended, so a copy exists; the copy corrected, with an explanation that quotes the string; a second, unrelated fact from another source. After `purgeContent` on the first source, every `MemoryStore` read method is called for every identifier involved, and the string appears in no returned value.
- [x] The same case shows the keyword lane and the vector lane return none of the purged facts for a question made of the string.
- [x] The same case shows the unrelated fact and its source are unchanged, the number of fact rows, source rows and audit entries present before the purge has not fallen, and one audit entry with operation `purge` exists for each purged row.
- [x] A SQLite adapter test dumps every column of every table, including the keyword index and the embeddings, after the purge, and the string is not found.
- [x] If the design decided that freed pages are cleared, and how: a SQLite adapter test reads the database file and its write-ahead log as bytes after the purge and finds neither the string nor the purged statement. Otherwise that limit, as the decision record states it under "What purge does not remove", is repeated in the doc comment of `purgeContent`, and no test or document of this item claims more.
- [x] A SQLite adapter test shows that an `UPDATE` of `statement`, `object_value`, `content` or `locator` that does not meet the design's condition is still refused.
- [x] The schema inventory test passes, and fails when a text column is added to a table in a test migration without being classified.
- [x] A contract case shows purging an already purged source succeeds and writes no further audit entries, and purging a source in another namespace is `not_found`.
- [x] `pnpm check` exits 0.

**Validation.** The contract suite against both stores. SQLite adapter tests for the triggers, the full dump, the inventory and, if the design clears freed pages, the file bytes. `pnpm check`.

**Completion evidence.** The commit; the passing check output, including the dump test and the inventory test.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in five commits, each of which passed `pnpm check` on its own with the later ones stashed:

1. `feat(storage): add the purge migration`
2. `feat(core): add purge_content and the reads purge needs to both stores`
3. `feat(core): add the purgeContent operation`
4. `feat(graph-rag): leave purged facts out of the graph lane`
5. `feat(storage): add clearFreedPages and the SQLite tests of purge`

What was built, from ADR 0012 as FL-047 completed it:

- **The migration.** `0004_purge.sql`, sha256 `17e1e87aa1e9558877b4addd50b11b4cbface2140b6ede7eb16411e1d538d1a8`, is the spike's draft with a header and the comment on Postgres. It adds `purged_at` to `fact` and `source`, and replaces the two triggers with ones that permit one purge and nothing more. It adds the keyword-entry trigger, turns on FTS5 `secure-delete`, and guards vector deletes.
- **The core types.** `Fact` and `Source` gain `purgedAt`, and core exports `PURGED_MARKER`, `[purged]`. The new values are the change `purge_content`, the operation `purge`, the actions `fact.purged` and `source.purged`, and the reason codes `erasure_requested` and `secret_stored`. They are in `INTERFACES.md` and the parity test.
- **New store reads.** `MemoryStore` gains three reads that the purge set needs and that nothing else provided: `listFactsOfSources`, `findSourcesByContentHash` and `listFeedback`. Both stores implement them.
- **`purgeContent`.** It collects the purge set by the record's rule, from the target and the sources with the same hash. It invalidates and purges each covered fact, and purges each source in the set and each explaining source, in one commit. It returns `{ purgedSourceIds, purgedFactIds }`.
- **The graph lane.** `recall`'s graph lane leaves purged facts out.
- **`clearFreedPages`.** `clearFreedPages(path)` in `@factloom/storage` runs `VACUUM` and `wal_checkpoint(TRUNCATE)`, and says whether the checkpoint finished. FL-072's command calls it.

Contract cases, against both stores, in the first group:

- **U1** builds the memory of the first acceptance criterion with hand-written change sets. Before the purge, the marker is found in the reads; after `purgeContent` on the first source, `JSON.stringify` of every read method, called for every identifier involved, holds no trace of it. The reads are `getFact`, `listFacts` with each time and filter, `getSource`, `listAuditEntries`, `findEntities`, `listFactsOfSources`, `findSourcesByContentHash`, `listFeedback` and both lanes.
- **U2** with a known-at date before the purge, the keyword lane returns nothing for the marker, and the vector lane does not return the purged fact for its own vector.
- **U3**:
  - the unrelated facts and their source are unchanged, and no fact or source row is gone;
  - `k-1` and `k-1e` are purged, and so are `s-key` and the explaining sources `s-rotated` and `s-fix`;
  - there are five audit entries with operation `purge` and action `fact.purged` or `source.purged`, one per purged row.
- **U4** a second purge succeeds and writes no audit entry.
- **U5** another namespace is `not_found`.

The suite's header now says that the purge cases run `purgeContent`, because what they test is what it leaves readable. The count of the first group is 63.

SQLite adapter tests, in `purge-sqlite.test.ts`:

- **Dump.** After the purge, no column of any table, the FTS5 table and its shadow tables and `fact_embedding` included, holds the marker; before it, some did.
- **Bytes.** After the purge, closing the store and `clearFreedPages`, the checkpoint finished, and neither the database file nor the write-ahead log holds the marker or the purged statement.
- **Triggers.** Seven updates and deletes outside the condition are refused: of `statement`, `object_value`, `content`, `locator`, a second purge, a purge to `NULL`, and a vector delete.
- **Inventory.** Every text and binary column of the migrated schema is in one of two lists, "content, covered by purge" (9 columns) or "not content". Adding `source.summary TEXT` in a test makes the check report exactly `source.summary`.

Unit tests:

- **`purgeContent`, 6 tests:** the purge set with copies, the same text and explaining sources; the orphaned correction left; a fact another source states kept; a live fact invalidated, then purged; a second purge writing nothing; another namespace.
- **The graph lane, 1 test:** it leaves a purged fact out for a known-at date before the purge.

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| No FTS5 `secure-delete` in the migration | The dump and the bytes tests |
| No `VACUUM` in `clearFreedPages` | The bytes test |
| Explaining sources not purged | U1, U3, and the purge-set unit test |
| Copies not followed | U1, U3, and the purge-set unit test |
| SQLite keeps a purged fact's vector | U2 |
| The graph lane keeps purged facts | The graph lane test |

`pnpm check`:

```text
$ biome format .
Checked 299 files. No fixes applied.
$ biome lint .
Checked 299 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  83 passed (83)
      Tests  897 passed (897)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the fifth commit, so the migration, the FTS5 option and `VACUUM` ran on Apple Silicon: https://github.com/Johnmark-Tech/factloom/actions/runs/43995392839.

Differences from the item:

- **Three new read methods** on `MemoryStore`. The purge set cannot be found from the phase 1 reads. They are exercised by U1 and the purge tests, not by cases of their own.
- **A second purge of a row** inside one change set is refused by the store with `invalid_input`; the operation never sends one. Functional requirement 3, a second purge of a source succeeding, is met at the operation's level (U4).
- **Two existing tests changed their expectation**, not their subject. The first-migration test's update of a source is now refused by the new trigger, with its message. The schema test's rejected operation is now `deletion`, because `purge` is valid.
- **About 35 test fixtures and builders** gained `purgedAt: null`.

### FL-072: Purge command

| | |
|---|---|
| Status | Completed |
| Phase | 2 |
| Depends on | FL-061, FL-034 |
| Requirements | REQ-19 |
| Components | `apps/mcp-server` (command, README) |

**Objective.** Give a person a command to find the source to purge and to purge it, so that `purgeContent` has a way to be invoked that no agent can reach.

**Background.** This item is the second part of FL-061, which built `purgeContent` in both stores. A purge must not be reachable by an agent, so it is not an MCP tool ([ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md); design question 10 of FL-047). It still needs a way to be invoked: a command of `apps/mcp-server` that a person runs, with the configuration of the server (FL-034). The command for proposals (FL-070) is a second form of the same entry point.

**Outcome.** A person who finds a credential in memory, or receives an erasure request, runs one command to see the sources of a fact and another to purge one. The command never prints content.

**Scope.**
- A command of `apps/mcp-server` with two forms: list the sources of a fact, and purge a source.
- A short section on the command in the app's README, with a warning that a purge cannot be undone.

**Non-goals.**
- An MCP tool for purge. An agent must not be able to remove content.
- Purging by anything but a source identifier: by subject, by date range, by person.
- Recording which person ran the purge. An audit entry carries the trigger `person` and no identity of a person; that is an open decision of [EPIC-11](EPIC-11.md).
- Changing the operation or the design: FL-061 and FL-047.

**Functional requirements.**
1. The command is started by an argument to the application's entry point. With no argument the application still serves MCP over stdio. It takes its database and namespace from the same configuration as the server and refuses to start without a namespace.
2. With a fact identifier, the command prints the sources of that fact and of the facts linked to it by supersession: for each, its identifier, kind, locator and observed time, and not its content. It changes nothing.
3. With a source identifier and a reason, `erasure_requested` or `secret_stored`, the command calls `purgeContent` with the trigger `person` and prints the identifiers of the purged source and facts. Without a reason it refuses and changes nothing.
4. The command exits with 0 on success and with a non-zero code and the error code on failure. It never prints content.

**Technical requirements.**
1. The command holds no rule about facts. It parses its arguments, calls one read or one operation, and prints the result. It is not registered as a tool, and `tools/list` does not change.
2. The entry point's handling of a command argument is one small function. If FL-070 already wrote it, this item adds its forms to it; if not, this item writes it and FL-070 adds to it.
3. In server mode only protocol messages go to standard output ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md)). The command is a different mode and is not an MCP server.

**Constraints.**
- [ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md), as completed by FL-047.
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md): the command works in the configured namespace only.
- [Architecture rules](../../../.claude/rules/architecture.md): an entry point translates and calls one use case or operation.

**Acceptance criteria.**
- [x] A test starts the command as a child process on a temporary database that holds a fact with a marker string in its source, lists the fact's sources, purges the source with the reason `secret_stored`, and then finds the string in no line the command printed and in no table. The audit entries of the purge carry the trigger `person` and the reason code `secret_stored`.
- [x] A test starts the command with a source identifier and no reason and shows a non-zero exit code and an unchanged database.
- [x] A test starts the command with no namespace and shows a non-zero exit code.
- [x] A test that lists the tools of the server built by the composition root finds no tool for purge.
- [x] `pnpm check` exits 0.

**Validation.** Child-process tests of the command. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the README section.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in three commits: `feat(mcp-server): add the purge command`, `docs: describe the purge command in the README`, and `docs: record in ADR 0012 the purge command as built`.

The entry point:

- `readCommand` in `apps/mcp-server/src/read-command.ts` is the one small function that reads the arguments. FL-070 is not built yet, so this item wrote it.
- No argument serves MCP over stdio, as before.
- `purge sources <fact-id>` and `purge source <source-id> --reason erasure_requested|secret_stored` run the command. Anything else is refused with a usage line and exit code 2.

The command:

- `run-purge-command.ts` uses the server's configuration from `main.ts`, which refuses to start without a namespace.
- The listing prints, for each source of the fact and of the facts linked to it by supersession in either direction, its identifier, kind, locator and observed time, tab-separated, and never content.
- A purge calls `purgeContent` with the trigger `person` and the reason, prints the identifiers it purged, closes the store, runs `clearFreedPages`, and says whether the checkpoint finished.
- Output goes to standard output, because the command is not an MCP server.

Tests, in `purge-command.test.ts`. Three of them run `main.ts` as a child process on a temporary database whose fact and source hold a marker string:

- **The listing and the purge.** The listing prints exactly the one source line and exits 0. The purge with `secret_stored` exits 0, prints the purged identifiers and "Freed pages cleared.", and neither output holds the marker. No column of any table of the file holds it afterwards. The purge's audit entries carry the trigger `person` and the reason code `secret_stored`.
- **No reason.** A purge without a reason exits non-zero with `invalid_input:` and leaves the marker and no purge audit entry in the database.
- **No namespace.** With no namespace, the command exits non-zero and says `FACTLOOM_NAMESPACE is not set`.
- **No purge tool.** The tools of the server built by the composition root include no tool whose name holds "purge".

The test database is written with the local embedder's model name and size, so the command's store opens it; no model is loaded. To read the file directly, `apps/mcp-server` gains `better-sqlite3` and `@types/better-sqlite3` as development dependencies, at the workspace's catalog versions, with the reason in `pnpm-workspace.yaml`.

Rules broken by hand, each then restored:

| Break | Test that failed |
|---|---|
| A purge with no reason defaults to `secret_stored` | The no-reason test |
| The listing also prints the content | The listing and purge test |

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the third commit, including the child-process tests: https://github.com/Johnmark-Tech/factloom/actions/runs/43995854944.

The README has a section, "Removing content: purge", with the two commands. ADR 0012's answer to question 10 now describes the command as built; its earlier draft, a search by text and a `--yes` flag, did not match this item's requirements.

`pnpm check`:

```text
$ biome format .
Checked 302 files. No fixes applied.
$ biome lint .
Checked 302 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  84 passed (84)
      Tests  901 passed (901)
```
