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
- Stored proposals, with approve and reject operations and a read of pending proposals, for a domain whose correction policy is `human_approval`.
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
- [EPIC-06](EPIC-06.md): the server and the tool translations (FL-058) that the `give_feedback` tool reuses.
- [EPIC-07](EPIC-07.md): the scenario data (FL-027), the record-and-replay wrapper (FL-028) and the scenario runner (FL-039) that set the bar for FL-041 and FL-042.

## Deliverables

- `packages/maintenance`, with its boundary rules enforced.
- The conflict judge and its eval.
- `remember` with automatic correction, and the scenario numbers that show it.
- Proposal storage with `approveProposedChange` and `rejectProposedChange` (proposed names).
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
- After `purgeContent`, a test that reads every table and index finds none of the purged text.
- A search of `packages/maintenance` for `commit(` and for SQL keywords in string literals finds nothing outside tests.

## Work items

| ID | Title | Phase | Depends on | Status |
|---|---|---|---|---|
| FL-040 | Create the maintenance package and its boundary rules | 2 | FL-001 | Pending |
| FL-041 | Conflict judge | 2 | FL-040, FL-011, FL-019, FL-027, FL-028 | Pending |
| FL-042 | Automatic correction inside remember | 2 | FL-041, FL-039 | Pending |
| FL-043 | Proposed changes for human approval | 2 | FL-042 | Pending |
| FL-044 | reviseValidTime operation | 2 | FL-010 | Pending |
| FL-045 | Confidence history and adjustConfidence | 2 | FL-015 | Pending |
| FL-046 | Feedback operation and migration | 2 | FL-015, FL-022 | Pending |
| FL-059 | give_feedback tool | 2 | FL-046, FL-058 | Pending |
| FL-060 | Acting on feedback | 2 | FL-046, FL-045, FL-042 | Pending |
| FL-047 | Purge design, proven by a spike | 2 | FL-015 | Pending |
| FL-061 | Purge implementation and a command to invoke it | 2 | FL-047 | Pending |

### FL-040: Create the maintenance package and its boundary rules

| | |
|---|---|
| Status | Pending |
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
- [ ] `pnpm check` passes with the new package present.
- [ ] Adding `import '@factloom/storage'` to a source file of the package makes `pnpm check` fail at the lint step and at the type check step. The import is then removed.
- [ ] Adding `import '@factloom/graph-rag'` to a source file of the package makes `pnpm check` fail. The import is then removed.
- [ ] Adding `import '@factloom/maintenance'` to a source file of `@factloom/graph-rag` makes `pnpm check` fail. The import is then removed.
- [ ] `SYSTEM-BOUNDARIES.md` lists the package in the import table and in "Public API of each package".

**Validation.** `pnpm check`, run four times: once clean and once with each forbidden import.

**Completion evidence.** The commit, and the failing output of each of the three forbidden-import runs.

### FL-041: Conflict judge

| | |
|---|---|
| Status | Pending |
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
- [ ] A unit test for each deterministic rule passes with an LLM client that fails if called: no candidates; same object; multi-valued predicate with a different object.
- [ ] A unit test shows the moment of change is the new fact's `validFrom` when given, and the source's observed time when not, with a scripted LLM.
- [ ] A unit test shows one LLM call is made for a new fact with three remaining candidates.
- [ ] A unit test shows an out-of-range index and a missing candidate each give `llm_failed`.
- [ ] The judge eval runs inside `pnpm check` in replay and fails when a recording is missing.
- [ ] The eval output shows the verdict table and both rates. The rates are recorded as numbers; this item sets no target for them, because no published figure exists to set one against. FL-042 sets the bar on the scenario set.
- [ ] Every judge case whose expected verdict is reached by a deterministic rule gets that verdict.

**Validation.** Unit tests with scripted and failing LLM clients. The judge eval in replay. One live run by hand: the owner runs the eval with recording on and an API key set, and records the model identifier from the task map and the two rates.

**Completion evidence.** The commit; the eval table and the two rates from the replayed run; the model identifier the recordings were made with; the candidate limit recorded in `INTERFACES.md`.

### FL-042: Automatic correction inside remember

| | |
|---|---|
| Status | Pending |
| Phase | 2 |
| Depends on | FL-041, FL-039 |
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
- The scenario set passing at the stated bar.

**Non-goals.**
- The `human_approval` policy. FL-043. In this item a domain with that policy keeps the phase 1 behaviour: the conflicting fact is skipped.
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
4. The scenario set runs through `remember` with the judge wired in, a fixed clock and replayed LLM responses, using the runner from FL-039.

**Constraints.**
- [`INTERFACES.md`](../../architecture/INTERFACES.md), "Use cases": a handler calls exactly one use case, and `remember` remains that use case.
- The single-value rule is still enforced by the store inside each commit ([ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md)).
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): a succession and a correction are different operations on different time axes.

**Acceptance criteria.**
- [ ] The scenario runner, in replay, reports staleness rate 0 and false invalidation rate 0 over the whole scenario set, and prints the missed invalidation rate.
- [ ] The scenario "succession" passes: the earlier fact is ended at the moment of change, the later one is current, asking as of an earlier date returns the earlier one, and fact history shows a succession.
- [ ] The scenario "correction" passes: asking as of any date returns the right fact, and asking what was known before the correction returns the wrong one.
- [ ] The scenario "unrelated fact about the same subject" passes with no fact invalidated, and with an LLM client that fails on any call whose task is `conflict_detection`.
- [ ] The scenario "multi-valued predicate" passes with both facts current and no `conflict_detection` call.
- [ ] A unit test shows that a judge returning `llm_failed` leaves the stored fact live and returns the new fact in `skipped`.
- [ ] A unit test shows that with `correctionPolicy: 'human_approval'` no stored fact is changed.
- [ ] A unit test shows the audit entries of a succession made by `remember` carry `judged_ended`, and those of a correction carry `judged_wrong`.
- [ ] The MCP smoke test still passes, and the `remember` tool's output validates against its updated output schema.

**Validation.** Unit tests of `remember` with a scripted judge and the in-memory store. The scenario set in replay inside `pnpm check`. One live run by hand: the owner runs the scenario set three times against the real API and records the three metrics for each run.

**Completion evidence.** The commit; the scenario runner's output in replay showing the two zeros and the missed invalidation rate; the three live-run results; the updated sections of `INTERFACES.md` and `MCP-TOOLS.md`.

### FL-043: Proposed changes for human approval

| | |
|---|---|
| Status | Pending |
| Phase | 2 |
| Depends on | FL-042 |
| Requirements | REQ-17 (REQ-CA-16) |
| Components | `@factloom/core` (operations, in-memory store), `@factloom/storage` (migration, adapter, contract suite), `@factloom/graph-rag` (`remember`) |

**Objective.** For a domain whose correction policy is `human_approval`, store a correction as a proposal instead of making it, and let a person approve or reject it.

**Background.** `Domain.correctionPolicy` has had the value `human_approval` since phase 1, with nothing behind it. The [research on other domains](../../research/industries/other-industries.md) lists a human approval step as required for legal, healthcare and other regulated domains. The software development domain uses `automatic`, so nothing in phases 2 and 3 depends on this item at run time. It is built now, and kept minimal, because it is the foundation those later domains stand on: a stored proposal, an approve and a reject operation, and a read of pending proposals. [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md) says how a proposal is held: as the operation's input, plain data, which becomes a change set when it is approved, so its recorded time is the time of approval.

**Outcome.** With a `human_approval` domain, `remember` leaves the stored fact untouched and stores a proposal. A caller can list pending proposals, approve one, which makes the change, or reject one. There is no user interface: the operations are called from tests now, and from the HTTP API and document flows of later phases.

**Scope.**
- A stored proposal: one table and its migration.
- Three operations in `@factloom/core` (proposed names): `proposeChange`, `approveProposedChange`, `rejectProposedChange`.
- One read: pending proposals of a namespace.
- `remember` storing a proposal where FL-042 would have corrected.

**Non-goals.**
- The rule that a later automatic decision does not override a human one. It is the second half of REQ-CA-16, which the [competitive analysis](../../research/evaluations/competitive-analysis.md) defers until an adapter requires human approval, after phase 3. In this item a change that a person rejected can be proposed again when the same text is remembered again, and nothing treats a fact a person changed differently from any other.
- Any user interface, MCP tool or HTTP route. An agent must not approve its own proposal, so no MCP tool is planned. The interface arrives with [EPIC-10](EPIC-10.md) and [EPIC-11](EPIC-11.md).
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
8. With `correctionPolicy: 'human_approval'`, `remember` calls `proposeChange` where FL-042 calls `endFact` or `invalidateFact`. The new fact is returned in `skipped`, with a reason that says a proposal was stored and the proposal's identifier (proposed: a third value of `SkippedFact.reason`).

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
- [ ] Contract suite cases pass against both stores: a recorded proposal is returned by the read; an approved or rejected one is not; a proposal for a fact in another namespace is `not_found`; deciding twice is `already_exists`.
- [ ] A unit test shows that with a `human_approval` domain, `remember` on a conflicting text leaves the stored fact live and current, stores one pending proposal, and returns the new fact in `skipped`.
- [ ] A unit test with a fixed clock shows that approving a succession proposal ends the stored fact and records the successor, that both new rows have the approval time as `createdAt`, and that a read with a known-at date between proposal and approval returns the stored fact unchanged.
- [ ] A unit test shows the proposal is marked approved and the facts are changed in one commit: with a store that fails the commit, neither happens.
- [ ] A unit test shows approval with trigger `agent` is `invalid_input`.
- [ ] A unit test shows that rejecting a proposal changes no fact, and that the proposal is no longer returned by the read of pending proposals.
- [ ] A unit test shows that approving a proposal whose stored fact has been invalidated since returns `already_invalidated` and leaves the proposal pending.
- [ ] A SQLite adapter test shows a direct `UPDATE` of a decided proposal and a `DELETE` of any proposal are refused by triggers.

**Validation.** Contract suite against both stores. Unit tests of the three operations and of `remember` with a test domain whose policy is `human_approval`. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the updated `INTERFACES.md` and `SCHEMA.md`.

### FL-044: reviseValidTime operation

| | |
|---|---|
| Status | Pending |
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
- [ ] A unit test moves the date of a succession by revising both neighbours in one call. Afterwards, with fixed as-of dates on each side of the old and the new boundary, each date returns exactly one fact, and no date returns two.
- [ ] The same test, asked with a known-at date before the revision, returns the old periods.
- [ ] A unit test shows a revision that overlaps a third live fact returns `conflict` with that fact in `relatedFactIds`, and that no row was written.
- [ ] Unit tests cover each refusal in functional requirement 4, asserting the error code.
- [ ] A unit test passes with an embedder that fails if called.
- [ ] A unit test shows `2n + 1` audit entries for `n` revisions, sharing one operation identifier, with operation `revision`.
- [ ] A contract suite case passes against both stores: a change set that invalidates two neighbouring facts and records their copies with a moved boundary commits, and the same change set with only one of the two pairs fails with `conflict`.

**Validation.** Unit tests with `createTestDeps` and the in-memory store. The contract suite against both stores. `pnpm check`.

**Completion evidence.** The commit and the passing check output.

### FL-045: Confidence history and adjustConfidence

| | |
|---|---|
| Status | Pending |
| Phase | 2 |
| Depends on | FL-015 |
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
- [ ] Contract suite cases pass against both stores, with a fixed clock: a fact recorded at confidence 0.9 and adjusted to 0.4 later is returned with 0.9 for a known-at date before the adjustment and 0.4 for one after; `getFact` returns 0.4; each search lane returns 0.4 with the default time filter.
- [ ] A contract case shows the fact's identifier, `createdAt` and row count are unchanged by an adjustment.
- [ ] Contract cases cover the refusals: confidence 1.5 is `invalid_input`; a missing fact is `not_found`; an invalidated fact is `already_invalidated`; a fact in another namespace is `not_found`.
- [ ] A contract case shows one audit entry per adjustment, with action `fact.confidence_adjusted` and the two numbers in `detail`.
- [ ] A SQLite adapter test shows a direct `UPDATE` or `DELETE` on `fact_confidence` is refused.
- [ ] A SQLite adapter test opens a database created by the earlier migrations only, applies the new one, and reads an existing fact with its confidence at recording.

**Validation.** The contract suite against both stores. SQLite adapter tests for the triggers and the migration. A unit test of the operation with the in-memory store. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the migration file's name and hash as recorded by the migration runner in the test.

### FL-046: Feedback operation and migration

| | |
|---|---|
| Status | Pending |
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
- [ ] Contract suite cases pass against both stores: a feedback row is recorded with one audit entry whose action is `feedback.recorded`; a missing fact is `not_found`; a fact in another namespace is `not_found`; feedback on an invalidated fact is recorded; no fact row changes.
- [ ] A contract case shows feedback with a source records the source and the feedback in one commit, with one operation identifier.
- [ ] Unit tests of `giveFeedback` with the in-memory store pass with these names: "records feedback with the comment as the content of a source", "records feedback with no source when there is no comment", "refuses a comment that contains a secret and stores nothing", "returns not_found for a fact in another namespace", "says that nothing followed".
- [ ] A unit test asserts that no audit entry written by the call contains the comment.
- [ ] A SQLite adapter test shows a direct `UPDATE` or `DELETE` on `feedback` is refused.
- [ ] A SQLite adapter test opens a database created by the earlier migrations only, applies the new one, and records feedback on an existing fact.
- [ ] `pnpm check` exits 0.

**Validation.** Contract suite against both stores. Unit tests of the operation and the use case. SQLite adapter tests for the triggers and the migration. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the updated `INTERFACES.md`, `SCHEMA.md` and `SYSTEM-BOUNDARIES.md`.

### FL-059: give_feedback tool

| | |
|---|---|
| Status | Pending |
| Phase | 2 |
| Depends on | FL-046, FL-058 |
| Requirements | REQ-18, REQ-10 |
| Components | `apps/mcp-server` (tool, instructions, tests) |

**Objective.** Add the sixth MCP tool, `give_feedback`, so that an agent can pass on that a recalled fact was found right, wrong or out of date.

**Background.** [ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md) fixes five tools as the phase 1 surface and says phase 2 adds one, `give_feedback`, when feedback has something to act on it. [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Not in phase 1", lists a feedback tool for phase 2. The use case behind it is `giveFeedback` (FL-046). The tool reuses the translation of an error from the `recall` tool (FL-058).

**Outcome.** An agent that is told "that's not right" about a recalled fact can pass the signal on with one tool call. `tools/list` returns six tools.

**Scope.**
- The tool definition and handler.
- The server's `instructions` string, which now mentions the tool.
- The section for the tool in `MCP-TOOLS.md`, with its rows in the error and annotation tables.
- The tests that fix the tool list: the test of the tool surface, the smoke test (FL-037) and the clean-install job (FL-003) now expect six names.

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
- [ ] Tests of the tool, with a server built from the in-memory store and a client connected in process, pass with these names: "records feedback and returns its identifier", "stores the comment as the content of a source", "returns not_found for an unknown fact", "returns invalid_input for an unknown signal", "refuses a comment that contains a secret".
- [ ] A test asserts that after the call `listAuditEntries` for the returned feedback identifier holds one entry with action `feedback.recorded` and trigger `agent`.
- [ ] A test named "lists the six tools in order with their annotations" asserts the six names in order, the annotation values, an output schema on each, and a description on every input field.
- [ ] The MCP smoke test lists six tools, calls `give_feedback` with `wrong` on a recorded fact, and gets a result with a `feedback_id` and a `follow_up` from the list in functional requirement 1.
- [ ] A test named "the instructions fit the limit" still passes.
- [ ] `MCP-TOOLS.md` describes the tool, and the tool table there has six rows.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests with fakes and an in-process client. The MCP smoke test. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the updated `MCP-TOOLS.md`.

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
| Status | Pending |
| Phase | 2 |
| Depends on | FL-015 |
| Requirements | REQ-19 |
| Components | decision records, `spikes/` |

**Objective.** Complete the design of **purge** in the decision records, and prove with a throwaway spike that the content of a source and of the facts that depended on it cannot be read afterwards.

**Background.** [ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md) decides that purge is the single exception to keeping everything, for legal erasure and for a secret stored by mistake. It specifies the operation in outline and lists what a design review found the phase 2 design must cover. It also lists two questions as not decided. [`INTERFACES.md`](../../architecture/INTERFACES.md) gives the signature of `purgeContent`. [`SCHEMA.md`](../../architecture/SCHEMA.md), "Planned additions", names `fact.purged_at`, `source.purged_at` and a narrowly permitted change in two triggers. The part that could not be added later, an audit log with no free text, has been in place since the first migration.

The original item was split in two. This one decides, and shows on a real database that what was decided works. FL-061 builds the migration, the operation and the command from the completed record.

**Outcome.** ADR 0012 answers every question the phase 2 design must cover, and a spike under `spikes/` shows, on a database built from the project's migrations, that after the designed steps the purged text is found nowhere. FL-061 can be implemented from the record without a further decision.

**Scope.**
- The design, recorded by completing ADR 0012's section "What the phase 2 design must cover".
- A throwaway spike in `spikes/` that applies the designed steps with hand-written SQL and searches for the purged text.
- The names the implementation will use: the `Change` kind (proposed: `purge_content`), the `Operation` name `purge`, `AuditAction` values (proposed: `source.purged`, `fact.purged`) and reason codes (proposed: `erasure_requested`, `secret_stored`), written into `INTERFACES.md` and `SCHEMA.md` as planned.

**Non-goals.**
- The migration, the operation `purgeContent`, the contract cases and a way to invoke a purge: FL-061. The spike is not the implementation and no code is moved from it.
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
10. How a person invokes a purge and finds the identifier of the source to purge, given that no MCP tool may do it. The plan, which FL-061 builds, is a command of `apps/mcp-server`.

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
- [ ] The decision record answers design questions 1 to 10, and each answer cites its source or the spike.
- [ ] Running the spike from its folder, with the command its README gives, prints "not found" for the marker string in every table, in the keyword index and in the vector entries, and ends with a line that says the spike passed.
- [ ] For the bytes of the database file and the write-ahead log, the spike prints "not found" if the design decides that freed pages are cleared. If the design decides they are not cleared, the spike prints what it found, and the decision record says so in a section titled "What purge does not remove".
- [ ] The spike prints that the unrelated fact and its source are unchanged, and that the counts of fact rows, source rows and audit rows are the same before and after.
- [ ] The spike prints that an `UPDATE` of `statement`, `object_value`, `content` or `locator` outside the design's condition was refused.
- [ ] The spike's README records the output of that run, and `DECISIONS.md` lists any new record.
- [ ] `pnpm check` exits 0: the spike is outside the workspace and changes nothing in it.

**Validation.** The spike, run by hand from its folder. Review of the decision record against design questions 1 to 10.

**Completion evidence.** The completed ADR 0012, or the record that supersedes part of it; the spike's README with its output; the commit.

### FL-061: Purge implementation and a command to invoke it

| | |
|---|---|
| Status | Pending |
| Phase | 2 |
| Depends on | FL-047 |
| Requirements | REQ-19, REQ-24 |
| Components | `@factloom/core` (operation, in-memory store), `@factloom/storage` (migration, adapter, contract suite), `apps/mcp-server` (command) |

**Objective.** Build `purgeContent` from the completed design, so that the content of a source, and of every fact the design covers, can no longer be read from anywhere while the record that it existed stays, and give a person a command to run it.

**Background.** FL-047 completed the design in [ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md) and proved it with a spike. [`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 2", gives the signature of `purgeContent`. [`SCHEMA.md`](../../architecture/SCHEMA.md), "Planned additions", names `fact.purged_at`, `source.purged_at` and a narrowly permitted change in two triggers. A purge must not be reachable by an agent, so it is not an MCP tool. It still needs a way to be invoked: a command of `apps/mcp-server` that a person runs.

**Outcome.** A person who finds a credential in memory, or receives an erasure request, runs one command and the content is removed. Tests prove it is gone from every table and index. The audit log still shows that the source and its facts existed, and when and why they were purged.

**Scope.**
- The migration: the two columns and the replaced triggers.
- The `Change` kind, the `Operation` name `purge`, the `AuditAction` values and the reason codes that FL-047 named.
- The operation `purgeContent` in `@factloom/core`, in both stores.
- Tests that search every place content could be read.
- A command-line entry in `apps/mcp-server` that lists the sources of a fact and purges a source.

**Non-goals.**
- An MCP tool for purge. An agent must not be able to remove content.
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
6. The command is started by an argument to the application's entry point. With no argument the application still serves MCP over stdio. It takes its database and namespace from the same configuration as the server and refuses to start without a namespace.
7. With a fact identifier, the command prints the sources of that fact and of the facts linked to it by supersession: for each, its identifier, kind, locator and observed time, and not its content. It changes nothing.
8. With a source identifier and a reason, `erasure_requested` or `secret_stored`, the command calls `purgeContent` with the trigger `person` and prints the identifiers of the purged source and facts. Without a reason it refuses.
9. The command exits with 0 on success and with a non-zero code and the error code on failure. It never prints content.

**Technical requirements.**
1. The migration replaces `fact_changes_only_by_invalidation`, `source_never_updated` and the keyword index trigger only as far as the design's condition requires. `.claude/rules/data.md` forbids weakening these triggers; purge is its stated exception.
2. A schema inventory test lists every text and binary column of every table in the migrated database and fails if a column is not classified, in one list in the test, as "content, covered by purge" or "not content". A later migration that adds a column must then make that decision. This is what keeps purge complete when other phase 2 items and phase 3 add tables, in whichever order they are built.
3. The in-memory store implements purge, so the contract suite runs against both stores.
4. The migration carries a comment on what the Postgres version will do differently.
5. The command holds no rule about facts. It parses its arguments, calls one read or one operation, and prints the result. It is not registered as a tool, and `tools/list` does not change.
6. The app's README gains a short section on the command, with the two forms and a warning that a purge cannot be undone.

**Constraints.**
- [ADR 0012](../../architecture/adr/0012-purge-is-the-one-exception.md), as completed by FL-047.
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): purge is the one further change a fact row may undergo.
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md): purge is a change in a commit.
- [`TESTING.md`](../../architecture/TESTING.md): "no operation reducing the number of fact rows" still holds.
- [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md): only protocol messages go to standard output in server mode. The command is a different mode and is not an MCP server.

**Acceptance criteria.**
- [ ] A contract suite case, against both stores, builds this memory: a fact recorded from a source whose text contains a marker string; the fact ended, so a copy exists; the copy corrected, with an explanation that quotes the string; a second, unrelated fact from another source. After `purgeContent` on the first source, every `MemoryStore` read method is called for every identifier involved, and the string appears in no returned value.
- [ ] The same case shows the keyword lane and the vector lane return none of the purged facts for a question made of the string.
- [ ] The same case shows the unrelated fact and its source are unchanged, the number of fact rows, source rows and audit entries present before the purge has not fallen, and one audit entry with operation `purge` exists for each purged row.
- [ ] A SQLite adapter test dumps every column of every table, including the keyword index and the embeddings, after the purge, and the string is not found.
- [ ] If the design decided that freed pages are cleared: a SQLite adapter test reads the database file and its write-ahead log as bytes after the purge and finds neither the string nor the purged statement. If it decided they are not cleared, that limit is repeated in the doc comment of `purgeContent` and in the README section.
- [ ] A SQLite adapter test shows that an `UPDATE` of `statement`, `object_value`, `content` or `locator` that does not meet the design's condition is still refused.
- [ ] The schema inventory test passes, and fails when a text column is added to a table in a test migration without being classified.
- [ ] A contract case shows purging an already purged source succeeds and writes no further audit entries, and purging a source in another namespace is `not_found`.
- [ ] A test starts the command as a child process on a temporary database that holds a fact with a marker string in its source, lists the fact's sources, purges the source with the reason `secret_stored`, and then finds the string in no line the command printed and in no table. The audit entries of the purge carry the trigger `person` and the reason code `secret_stored`.
- [ ] A test starts the command with a source identifier and no reason and shows a non-zero exit code and an unchanged database.
- [ ] The MCP smoke test still passes, and `tools/list` holds no tool for purge.
- [ ] `pnpm check` exits 0.

**Validation.** The contract suite against both stores. SQLite adapter tests for the triggers, the full dump, the file bytes and the inventory. Child-process tests of the command. The MCP smoke test. `pnpm check`.

**Completion evidence.** The commit; the passing check output, including the dump test and the inventory test; the README section.
