# EPIC-09: Self-healing

| | |
|---|---|
| Status | Pending |
| Phases | 3 |
| Packages | `packages/maintenance`, `@factloom/core`, `@factloom/storage`, `@factloom/graph-rag`, `apps/mcp-server` |
| Requirements | REQ-20, REQ-21, REQ-22, REQ-23, REQ-24 (absorbing REQ-CA-05, REQ-CA-09) |

Terms in bold are defined in [`GLOSSARY.md`](../../../GLOSSARY.md). Where another document disagrees with [`INTERFACES.md`](../../architecture/INTERFACES.md), `INTERFACES.md` wins.

## Outcome

One command runs a maintenance pass over a namespace and reports what it did. The pass verifies anchored code facts against the repository with git and the file system and no LLM call, merges duplicate entities in a way that can be undone, repairs anchors to files that moved, and archives facts nobody has used. **Self-healing** needs no new information from an agent, and every change it makes goes through a fact operation in `@factloom/core` with the trigger `maintenance`.

## Scope

- The maintenance run: one command, run once, with a report. No daemon.
- The phase 3 fact operations of `INTERFACES.md`: `recordVerification`, `listStaleFacts`, `listOrphanedFacts`, `mergeEntities`, `undoEntityMerge`, each with its `Change` kind, `Operation` name, `AuditAction` values, reason codes and migration.
- **Verification** of anchored code facts: deterministic checks first, an LLM last. The deterministic checks cover what the owner asks of the software development domain, that referenced files and functions still exist: the file by its path, the function by a word search for its name.
- Detection of duplicate entities and their **entity merge**.
- Anchor repair after a file is moved or renamed.
- Usage tracking outside the read path, and archiving that is reversible and audited.

## Out of scope

- Resolving conflicts at write time and acting on feedback. [EPIC-08](EPIC-08.md).
- A syntax-aware symbol check: parsing with tree-sitter, the TypeScript compiler or a language server (the [verification ladder](../../research/industries/software-development.md), section E, rung 6). A function is checked by a word search for its name (FL-050). Parsing is considered only if text search proves too weak; see "Open decisions".
- A recency term in ranking, forgetting curves, summaries that replace facts, and removal of archived rows. The [research on decay](../../research/technical/memory-decay-and-consolidation.md) lists each under "Do not build yet". No work item covers them.
- Splitting an entity that was wrongly recorded as one, and merging across namespaces. No work item covers them. Two entities of different types can be merged ([`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 3").
- Verification of facts from documents. [EPIC-11](EPIC-11.md).
- Human approval of merges. Regulated domains need it ([research](../../research/industries/other-industries.md)); it belongs to [EPIC-12](EPIC-12.md). In this epic a domain with policy `human_approval` gets a report, not a change.

## Boundaries and constraints

- **Product 2 changes memory only through fact operations in `@factloom/core`** ([`INTERFACES.md`](../../architecture/INTERFACES.md), "Fact operations", phase 3).
- **Reads never write** ([`INTERFACES.md`](../../architecture/INTERFACES.md), "What a caller must know beyond the signatures"). `recall` does not update a counter or a timestamp. Usage counts are bookkeeping, not memory: the caller records them after the read, in a usage table outside `commit` and with no audit entry (FL-055).
- **Verification is recorded, not applied.** `recordVerification` writes the finding; what follows is a separate call, so the audit log shows both.
- **A failed deterministic check is not by itself a reason to invalidate.** A changed file means "verify again", a fact from another branch is out of scope, and a deleted file means "flag" ([software development research](../../research/industries/software-development.md), "Conflicts with settled decisions").
- **A merge is a row, not an edit**, and can be refused ([`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 3"; [`SCHEMA.md`](../../architecture/SCHEMA.md), rule 9).
- **Archiving is not invalidation.** An **archived fact** is still a **live fact** ([`GLOSSARY.md`](../../../GLOSSARY.md)).
- **Git and the file system are reached through an interface in `@factloom/core`**, implemented in the application, as the LLM and the embedder are ([ADR 0003](../../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md)).
- **Schema changes are new numbered migrations**, and every storage behaviour is a case in the storage contract suite ([`SCHEMA.md`](../../architecture/SCHEMA.md), [`TESTING.md`](../../architecture/TESTING.md)).
- **Names marked "proposed" in this file are not in `INTERFACES.md`.** The work item that uses one settles the name and adds it to `INTERFACES.md` and `SCHEMA.md`.

## Dependencies

- [EPIC-08](EPIC-08.md): the `maintenance` package (FL-040). Its confidence history (FL-045) and purge columns (FL-061) are read by FL-049.
- [EPIC-03](EPIC-03.md): the SQLite structural reads (FL-015), the migration runner and the contract suite.
- [EPIC-02](EPIC-02.md): `endFact` and `recordFacts`, which verification and anchor repair call.
- [EPIC-04](EPIC-04.md): the secret check (FL-022), which a file passes before FL-051 sends it to the LLM.
- [EPIC-05](EPIC-05.md): the `recall` use case (FL-031), whose results FL-055 counts.
- [EPIC-07](EPIC-07.md): the record-and-replay wrapper (FL-028) for the two steps that use an LLM.
- [EPIC-06](EPIC-06.md): the application that hosts the maintenance command and the `recall` tool that FL-055 and FL-065 extend.

## Deliverables

- The maintenance command and its report.
- `recordVerification`, `listStaleFacts`, `listOrphanedFacts`, `mergeEntities` and `undoEntityMerge` in `@factloom/core`, with migrations and contract cases.
- The deterministic verification job, with fixture repositories: path checks and the function check (FL-050), then the manifest version check with succession (FL-062).
- The LLM verification rung and its measured rates.
- The duplicate entity job, with a reviewed set of entity pairs and its over-merge count.
- The anchor repair job.
- Usage recording, the archiving job, and the operations that archive and unarchive.

## Success criteria

- `pnpm check` passes, and it includes the fixture repositories and the replayed evals of this epic.
- One maintenance run over a fixture repository, with an LLM client that fails if called, supersedes a fact whose manifest version changed and flags, without invalidating, a fact whose file was deleted.
- A merge and its undo leave every fact row unchanged, and reads before the merge and after the undo return the same facts.
- A test shows `recall` changes nothing in the store.
- Every change made by a maintenance run has an audit entry with trigger `maintenance`.
- The over-merge count on the entity pair set is reported, and is 0 for pairs decided without an LLM.
- A fact about a function whose name no longer appears in its anchored file is flagged for review, stays live, and no LLM call is made.

## Open decisions

| Decision | What is known |
|---|---|
| Whether a function or symbol is checked by parsing the file, with tree-sitter, the TypeScript compiler or a language server, and not by a word search | Not used. FL-050 checks a named function by a word search for its name in the anchored file. A word search cannot tell a definition from a mention in a comment, and it misses a function that was renamed. Parsing adds a dependency for each language and is considered only if text search proves too weak, measured by the facts FL-050 flags wrongly or fails to flag |

## Work items

| ID | Title | Phase | Depends on | Status |
|---|---|---|---|---|
| FL-048 | Maintenance run entry point | 3 | FL-040 | Pending |
| FL-049 | Verification records and the stale and orphaned lists | 3 | FL-015, FL-045, FL-061 | Pending |
| FL-050 | Deterministic verification: repository reader and path checks | 3 | FL-048, FL-049 | Pending |
| FL-062 | Deterministic verification: manifest version check and succession | 3 | FL-050 | Pending |
| FL-051 | LLM verification as the last rung | 3 | FL-062, FL-028, FL-022 | Pending |
| FL-052 | Entity merge with read resolution | 3 | FL-015 | Pending |
| FL-063 | Undo a merge and refuse a conflicting merge | 3 | FL-052 | Pending |
| FL-053 | Duplicate entity detection by name | 3 | FL-048, FL-052, FL-063 | Pending |
| FL-064 | Duplicate entity detection by similarity | 3 | FL-053, FL-028 | Pending |
| FL-054 | Anchor repair for moved and renamed files | 3 | FL-050 | Pending |
| FL-055 | Usage tracking | 3 | FL-031, FL-048, FL-058 | Pending |
| FL-065 | Archiving unused facts | 3 | FL-055, FL-058 | Pending |

### FL-048: Maintenance run entry point

| | |
|---|---|
| Status | Pending |
| Phase | 3 |
| Depends on | FL-040 |
| Requirements | REQ-20, REQ-21, REQ-24 |
| Components | `packages/maintenance` (run function), `apps/mcp-server` (command, wiring, registration guide) |

**Objective.** Provide one command that runs the maintenance jobs for a namespace once, reports what each did, and exits.

**Background.** [`ARCHITECTURE.md`](../../architecture/ARCHITECTURE.md), "Background, from phase 3", says product 2 works on a schedule. Factloom's first form is a stdio server that a host starts per session, so there is no long-lived process to schedule in. The [competitive analysis](../../research/evaluations/competitive-analysis.md) (advantage A5) expects the checks to be triggered at session start. The [software development research](../../research/industries/software-development.md) (findings 5.7 to 5.10) confirmed in documentation that Claude Code and Codex both have a session start hook that can run a command; neither was run.

**Outcome.** The jobs of FL-050, FL-053, FL-054 and FL-065, and the stages that FL-062, FL-051 and FL-064 add to them, have a place to be registered and a common report. A user can run maintenance by hand, from a scheduler, or from a session start hook.

**Scope.**
- A run function in `maintenance` that runs a list of jobs in order and collects their reports.
- A command in the existing application that builds the dependencies and calls it.
- The type of a job and of its report.
- A section in the registration guide on how to trigger the command.

**Non-goals.**
- A daemon, a timer inside the server, or a queue.
- Any job. Each later work item adds its own.
- A dry-run mode, a record of when the last run happened, and a minimum interval between runs. `listStaleFacts` already keeps recently verified facts out of the next run. Add these when a run is measured to be slow.
- A new application. The command is a further mode of `apps/mcp-server`, beside the server and the purge command of phase 2, so there is still one composition root.

**Functional requirements.**
1. The command takes its database and namespace from the same configuration as the server ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "Shape of the server") and refuses to start without a namespace.
2. Jobs run one after another in a fixed order. A job that fails does not stop the jobs after it.
3. Each job reports its name and four counts: items examined, items changed, items flagged for a person, and items that failed.
4. The command writes the whole report as one JSON document to standard output and everything else to standard error. It exits with 0 when no job failed and with a non-zero code otherwise.
5. A job that finds its work already done by another process, an operation returning `already_invalidated` or `already_exists`, counts the item as examined, not as failed. Two runs at the same time must not corrupt memory; the store's commit guarantees that, and this rule keeps the report honest.
6. With no jobs registered, the command reports an empty list and exits with 0.

**Technical requirements.**
1. A job is a named function that is already bound to its dependencies by the composition root and returns a `Result` holding its report. The run function knows nothing about what a job does.
2. The run function takes a clock, so the report's start and end times are fixed in tests.
3. The command is started by an argument to the application's existing entry point. The stdio server remains the default with no argument.
4. The registration guide gains a section with two ways to trigger a run: by hand, and from a session start hook in each host. The hook configuration is written from the hosts' current documentation, with the page and access date cited, not from the research summary.

**Constraints.**
- `.claude/rules/architecture.md`: only the composition root names concrete implementations; dependencies are passed as arguments.
- [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md): only protocol messages go to standard output in server mode. The maintenance mode is a different mode and is not an MCP server.
- Every change a job makes carries the trigger `maintenance`.

**Acceptance criteria.**
- [ ] A unit test runs three fake jobs, the second of which fails, and shows all three ran in order and the report holds three entries with the second marked failed.
- [ ] A test starts the command as a child process on a temporary database with no jobs and shows exit code 0 and a standard output that parses as the report schema.
- [ ] A test starts the command without a namespace and shows a non-zero exit code and a message on standard error.
- [ ] The MCP smoke test still passes: starting the application with no argument serves MCP over stdio.
- [ ] The owner adds the documented session start hook for Claude Code on the Mac, starts a session in a repository, and records the report that the run produced. The same is done for Codex. If a host's hook cannot be made to run the command, the guide says so and the reason is added to [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md).

**Validation.** Unit tests of the run function with fake jobs. Two child-process tests of the command. The MCP smoke test. The owner's two hook runs.

**Completion evidence.** The commit; the passing check output; the two reports from the owner's hook runs, or the recorded reason one could not be produced.

### FL-049: Verification records and the stale and orphaned lists

| | |
|---|---|
| Status | Pending |
| Phase | 3 |
| Depends on | FL-015, FL-045, FL-061 |
| Requirements | REQ-21, REQ-24 |
| Components | `@factloom/core` (operations, in-memory store), `@factloom/storage` (migration, adapter, contract suite) |

**Objective.** Record the outcome of verifying a fact, and list the facts that are due for verification and the facts whose source is gone.

**Background.** [`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 3", gives the three signatures and says that a verification is recorded, not applied. [`SCHEMA.md`](../../architecture/SCHEMA.md), "Planned additions", describes the `fact_verification` table: fact, outcome, method, time. A **stale fact** and an **orphaned fact** are defined in the glossary.

**Outcome.** The verification job of FL-050, and the rungs that FL-062 and FL-051 add to it, can ask which facts to check, and can record what they found without changing any fact.

**Scope.**
- The migration that adds `fact_verification`.
- A `Change` kind (proposed: `record_verification`), the `Operation` name `verification`, an `AuditAction` (proposed: `fact.verified`) and a reason code (proposed: `verification_due`).
- The operations `recordVerification`, `listStaleFacts` and `listOrphanedFacts`.
- Two read methods on `MemoryStore`, in both stores.

**Non-goals.**
- Performing a verification. FL-050, FL-062 and FL-051.
- Acting on an outcome.
- Detecting that a source's file changed. That is a check in FL-050; this item's lists use only what is stored.

**Functional requirements.**
1. `recordVerification` appends one row: the fact, the outcome (`confirmed`, `contradicted`, `source_missing`, `inconclusive`), the method (`deterministic` or `llm`), and the time. It changes no fact. Errors: `invalid_input`, `not_found`, `already_invalidated`, `storage_failed`.
2. `listStaleFacts` returns **current facts** not verified since the given date, least recently verified first. A fact counts as verified at its latest verification, or at its recording if it has none.
3. With `confidenceBelow` given, `listStaleFacts` also returns current facts whose confidence is below it, whenever they were verified. Confidence here is the latest value in the confidence history from FL-045.
4. `listOrphanedFacts` returns live facts whose every source has been purged, or whose latest verification found the source missing.
5. Both lists respect `limit`, return an empty list when nothing is due, and never return a fact from another namespace. Errors: `invalid_input`, `storage_failed`.

**Technical requirements.**
1. `fact_verification` is append-only, with triggers that refuse update and delete. A row belongs to the namespace of its fact.
2. The orphaned list reads `source.purged_at`, which FL-061 adds, and the stale list reads `fact_confidence`, which FL-045 adds. Both are dependencies of this item.
3. A fact that is revised gets a new identifier. Its copy has no verification rows and so counts as verified at its own recording. This is accepted, not worked around.
4. Each list is one indexed query in the SQLite adapter. The migration adds the index it needs.
5. The audit entry's `detail` holds nothing but identifiers: the outcome and the method are fixed words stored in the verification row.
6. The migration carries a comment on what the Postgres version will do differently.

**Constraints.**
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md): a verification is a change in a commit, with one audit entry.
- [`INTERFACES.md`](../../architecture/INTERFACES.md), "Errors from `commit`": read methods return only `invalid_input` and `storage_failed`.

**Acceptance criteria.**
- [ ] Contract suite cases pass against both stores, with a fixed clock: three current facts, one verified recently, one verified long ago and one never verified and recorded in between, are returned by `listStaleFacts` in the order "long ago, in between", and the recent one is not returned.
- [ ] A contract case shows an ended fact and an invalidated fact are not returned by `listStaleFacts`.
- [ ] A contract case shows `confidenceBelow` adds a recently verified fact whose confidence was adjusted below the threshold.
- [ ] A contract case shows `listOrphanedFacts` returns a fact whose latest verification is `source_missing`, stops returning it after a later `confirmed`, and returns a fact whose only source was purged.
- [ ] Contract cases cover the refusals of `recordVerification`: a missing fact is `not_found`, an invalidated fact is `already_invalidated`, an unknown outcome is `invalid_input`.
- [ ] A contract case shows one audit entry per verification, with operation `verification`, and no change to any fact row.
- [ ] A SQLite adapter test shows a direct `UPDATE` or `DELETE` on `fact_verification` is refused, and that the query plan of each list uses an index.

**Validation.** The contract suite against both stores. SQLite adapter tests for the triggers and the query plans. `pnpm check`.

**Completion evidence.** The commit and the passing check output.

### FL-050: Deterministic verification: repository reader and path checks

| | |
|---|---|
| Status | Pending |
| Phase | 3 |
| Depends on | FL-048, FL-049 |
| Requirements | REQ-21 (REQ-CA-09), REQ-24 |
| Components | `@factloom/core` (repository interface), `packages/maintenance` (job), `@factloom/graph-rag` (the domain's entity type and name check), `apps/mcp-server` (git implementation, wiring), fixture repositories |

**Objective.** Check that the files and functions that anchored code facts refer to still exist, using git and the file system only, and flag the facts whose file or function is gone, without any LLM call and without invalidating anything.

**Background.** This is the capability the [competitive analysis](../../research/evaluations/competitive-analysis.md) found in no system it ran or read (advantage A5, requirement REQ-CA-09), with the qualification stated there: the findings are "no such code found", not exhaustive searches, and hosted services were not examined. The checks come from the verification ladder in the [software development research](../../research/industries/software-development.md), section E, and each git command behind them was run in section 4 of that document. An **anchor** is a source's `locator` and `version`: a path and a commit.

The owner's requirement for the software development domain is that self-healing "checks that referenced files and functions still exist". This item covers both parts. A file is checked by its path. A function or symbol is checked by a word search for its name in the anchored file at the current version. The original item was split: the check of a value in a manifest, and the succession that follows from it, are FL-062.

**Outcome.** A maintenance run confirms the anchored facts whose file is unchanged. A fact whose file was deleted, or whose function is no longer named in its file, is flagged for a person and stays live. No API key is needed for any of it.

**Scope.**
- An interface in `@factloom/core` for reading a repository (proposed: `RepositoryReader`), with a git implementation in the application and a fake for tests.
- The verification job, registered in the maintenance run.
- Four rungs of the ladder: the anchor's commit is on the current branch; the path exists; the name of a function or symbol is still in the file; the file is unchanged since the anchor.
- An entity type for a function or symbol in the software development domain, which FL-018 does not have.
- Fixture repositories built by the tests.

**Non-goals.**
- A structured value check, and ending or superseding a fact. FL-062. In this item no fact is changed.
- An LLM rung. FL-051.
- Finding where a missing file went. FL-054.
- Parsing the file with tree-sitter, the TypeScript compiler or a language server. A word search needs no dependency and works for every language, and that is enough to answer "is this name still in this file". It cannot tell a definition from a mention and it does not follow a rename. Parsing is considered only if text search proves too weak, and is listed under "Open decisions" of this epic.
- Searching the whole repository for a name that left its file. The fact is flagged, and a person or an agent decides.
- Lockfiles, script entries, decision record status, and manifests of other ecosystems.
- Reading the working tree. Checks read the repository at `HEAD`, so uncommitted edits are not judged.
- Proposing a change under `human_approval`. The fact is flagged.
- Checking facts at recall time.

**Functional requirements.**
1. The job takes the facts from `listStaleFacts` and considers those with at least one source of kind `file` that has both a `locator` and a `version`. If a fact has several, the most recently observed is used. A fact with no anchor is skipped and counted as examined.
2. The rungs run in order and stop at the first that decides:

   | Rung | Check | Result |
   |---|---|---|
   | 1 | The anchor's commit is an ancestor of `HEAD` | If not: skipped. Nothing is recorded and nothing is changed, because a fact from another branch is out of scope |
   | 2 | The path exists at `HEAD` | If not: outcome `source_missing`. The fact is flagged and stays live |
   | 3 | The fact is about a named function or symbol, and that name is found as a whole word in the file's text at `HEAD` | If the name is not found: outcome `contradicted`. The fact is flagged for review and stays live. A fact that is not about a function or symbol passes this rung unchecked |
   | 4 | The file's content at `HEAD` is the same as at the anchor's commit | If the same: outcome `confirmed`. If it differs: `inconclusive` |

3. Every outcome is recorded with `recordVerification` and method `deterministic`.
4. No rung of this item changes a fact. A fact with outcome `source_missing` or `contradicted` is counted as flagged, whatever the domain's correction policy.
5. A flagged fact is reported by the run, with its identifier and the outcome. A fact with outcome `source_missing` also appears in `listOrphanedFacts`.
6. A fact is about a named function or symbol when its subject or its object is an entity of the domain's type for one. The name searched for is the entity's name. The search is for the whole word, with the case kept, so `parseDate` is not found in `parseDateInput`.
7. A name that is found in a comment or a string still counts as found. This is the stated limit of a word search.
8. If the repository cannot be read, for example the directory is not a git repository, the job fails as a whole, changes nothing, and the run reports the failure.

**Technical requirements.**
1. `maintenance` holds the ladder and names no entity type, no predicate, no file name and no git command. The name check is supplied by the composition root from the software development **domain**: a function that, given a fact with its entities, returns the names that must appear in its anchored file, or none. The word search itself is a pure function in `maintenance`, with its own unit tests.
2. The domain from FL-018 has no entity type for a function or symbol. This item adds one (proposed: `symbol`) and, because the six predicates of FL-018 are about repositories, dependencies and decisions, one multi-valued predicate that a fact about a symbol can use (proposed: `described_as`, with a value as its object). The domain's tests of FL-018, which assert the exact lists, are changed in the same commit.
3. The repository interface offers only what the four rungs need: whether a commit is an ancestor of `HEAD`, whether a path exists at a commit, the content identifier of a path at a commit, the text of a path at a commit, and the `HEAD` commit. It lives in `@factloom/core` because `maintenance` may import nothing else.
4. The git implementation runs git as a child process with arguments passed as a list, never through a shell, and uses the commands recorded as run in the research (checks 4.1, 4.6 and 4.7), re-checked against the git documentation with the page cited. The research ran the word match of check 4.4 with a search tool over a directory; here the match is made in code on the text of the one anchored file, so no further tool is needed.
5. The repository's location is configuration read by the composition root (proposed: `FACTLOOM_REPO`, default the working directory). It is added to the configuration table in `MCP-TOOLS.md`.
6. Fixture repositories are created by the test in a temporary directory, with fixed author and committer dates. No fixture repository is committed inside this repository.
7. The dependencies given to the job in every test of this item include an LLM client that fails if called.
8. The verification interval, the age after which a fact is stale, is one named constant.

**Constraints.**
- [`TESTING.md`](../../architecture/TESTING.md): "A test that must make no LLM call passes a client that fails on any call."
- [`INTERFACES.md`](../../architecture/INTERFACES.md): verification is recorded, then acted on in a separate call.
- The [software development research](../../research/industries/software-development.md), "Conflicts with settled decisions": a changed file or a fact from another branch is not a reason to invalidate.
- `.claude/rules/architecture.md`: an interface is added because there are two implementations, git and the test fake.

**Acceptance criteria.**
- [ ] Fixture "file deleted": a fact anchored to a file that a later commit deletes. After one run with an LLM client that fails if called: the fact is live and current, its latest verification is `source_missing`, `listOrphanedFacts` returns it, the run's report counts it as flagged, and no fact row was invalidated.
- [ ] Fixture "nothing changed": the fact is recorded as `confirmed`, and a second run made with the clock inside the verification interval examines no anchored fact.
- [ ] Fixture "other branch": a fact anchored at a commit that is not an ancestor of `HEAD` gets no verification row and no change.
- [ ] Fixture "file changed": a fact that is not about a function, anchored to a file that a later commit edits. The outcome is `inconclusive` and the fact is unchanged.
- [ ] Fixture "function removed": a fact whose subject is a symbol named `parseDate`, anchored to a file that defines it; a later commit removes the function and leaves the file. After one run with an LLM client that fails if called: the latest verification is `contradicted` and `deterministic`, the fact is live and current, the report counts it as flagged, and no fact row was invalidated.
- [ ] Fixture "function still there": the same fact after a commit that edits another part of the file. The name is found, and the outcome is `inconclusive` because the file changed.
- [ ] Fixture "longer name only": the file no longer holds `parseDate` and holds `parseDateInput`. The outcome is `contradicted`: the search is for the whole word.
- [ ] Unit tests of the word search pass with these names: "finds a name as a whole word", "does not find a name inside a longer name", "keeps the case of the name", "finds a name next to punctuation".
- [ ] A test named "the software development domain has a type for a function or symbol" passes, and the tests of FL-018 that assert the exact lists pass with the added names.
- [ ] A test runs the job in a directory that is not a git repository and shows the job reported as failed and the store unchanged.
- [ ] Every audit entry written by these runs has trigger `maintenance`, and after every fixture run the number of fact rows and the `invalidatedAt` of every fact are as before.
- [ ] Unit tests of the ladder with the fake repository reader cover each row of the rung table.

**Validation.** Unit tests of the ladder and of the word search with a fake reader and the in-memory store. Tests of the git implementation and of the whole run against fixture repositories with the SQLite adapter, on both CI platforms from FL-002. `pnpm check`.

**Completion evidence.** The commit; the passing check output on Linux and macOS arm64; the list of git commands used, each with its documentation citation.

### FL-062: Deterministic verification: manifest version check and succession

| | |
|---|---|
| Status | Pending |
| Phase | 3 |
| Depends on | FL-050 |
| Requirements | REQ-21 (REQ-CA-09), REQ-24 |
| Components | `@factloom/core` (repository interface), `packages/maintenance` (job), `@factloom/graph-rag` (the domain's predicate and structured check), `apps/mcp-server` (git implementation, wiring), fixture repositories |

**Objective.** Add a structured value check to the verification job: when a dependency's version in a manifest no longer matches a stored fact, end the fact and record the new version as its successor, with the manifest as the source and no LLM call.

**Background.** FL-050 built the repository reader and the rungs that check a path, a name and whether a file changed. A changed file gives `inconclusive` there. Rung 4 of the verification ladder in the [software development research](../../research/industries/software-development.md), section E, goes further for values that can be read from a file by a rule: the value at the anchor's commit is compared with the value at `HEAD`. This is the capability the [competitive analysis](../../research/evaluations/competitive-analysis.md) found in no system it ran or read (advantage A5, requirement REQ-CA-09). [`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 3", says a verification is recorded and what follows is a separate call, so the audit log shows both the finding and the action. The software development domain of FL-018 has six predicates and none holds a dependency's version, so this item adds one.

**Outcome.** After a dependency is upgraded in a commit, the next maintenance run ends the fact about the old version at the time of that commit and records the new one, with the manifest as its source. No API key is needed.

**Scope.**
- One more rung in the job of FL-050, used when the file changed: a structured check supplied by the domain.
- A predicate for a dependency's version in the software development domain (proposed: `pins_version`, single-valued, with a value as its object), and the structured check for it.
- One addition to the repository interface: the commits that touched a path between two commits, with their committer times.
- The succession that follows a contradicted value, under the domain's correction policy.
- A fixture repository in which a version changes.

**Non-goals.**
- Lockfiles, script entries, decision record status, and manifests of other ecosystems. Each is a further structured check, added when a scenario needs it.
- Reading the working tree. Checks read the repository at `HEAD`, so uncommitted edits are not judged.
- Proposing a change under `human_approval`. The fact is flagged.
- Changing a fact that FL-050 flagged for a missing file or a missing name.
- An LLM rung: FL-051.
- Extracting version facts from text. The predicate is in the domain, so `remember` and `record_fact` can use it; its extraction quality is not measured here.

**Functional requirements.**
1. The rung runs for a fact that passed the rungs of FL-050 and whose file differs between the anchor's commit and `HEAD`.
2. If the domain has a structured check for the fact's predicate, the checked value is read at the anchor's commit and at `HEAD`. The same value gives `confirmed`. A different value, or no value at `HEAD`, gives `contradicted`. If the domain has no check for the predicate, the outcome stays `inconclusive`.
3. The outcome is recorded with `recordVerification` and method `deterministic`, before any change is made.
4. For a `contradicted` fact with a new value at `HEAD`, under policy `automatic`, the job calls `endFact` with the new value as successor. `validTo` is the committer time of the first commit after the anchor in which the value differs. The source of the change is the manifest at `HEAD`: kind `file`, the path, and the `HEAD` commit.
5. For a `contradicted` fact under policy `human_approval`, and for a `contradicted` fact whose value is absent at `HEAD`, the job makes no change. The fact is counted as flagged.
6. The first structured check reads a dependency's version from `package.json`, in `dependencies` and `devDependencies`. It returns the value at a given commit, and for a changed value the statement of the successor fact.
7. The change carries the trigger `maintenance` and a reason code for a value found changed in its source (proposed: `source_changed`).
8. If `endFact` returns `conflict` or `already_invalidated`, because memory changed in between, the fact is counted as examined and nothing else happens.

**Technical requirements.**
1. `maintenance` still names no predicate, no file name and no git command. The structured check is supplied by the composition root from the software development **domain**, keyed by predicate.
2. The domain gains the predicate in the same commit as its check, and the tests of FL-018 that assert the exact lists are changed with it.
3. The git implementation of the added method uses the command recorded as run in the research (check 4.3 or 4.5, whichever gives the first commit in which the value differs), re-checked against the git documentation with the page cited, and run as a child process with arguments as a list.
4. Fixture repositories are created by the test with fixed author and committer dates, as in FL-050, so that `validTo` can be asserted exactly.
5. The dependencies given to the job in every test of this item include an LLM client that fails if called.
6. Reading `package.json` is parsing JSON from the text the repository reader returns. A manifest that does not parse gives `inconclusive`.

**Constraints.**
- [`INTERFACES.md`](../../architecture/INTERFACES.md): verification is recorded, then acted on in a separate call.
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): the world changed, so the fact is ended, not invalidated as wrong.
- [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md): a specific, single-valued predicate.
- [`TESTING.md`](../../architecture/TESTING.md): "A test that must make no LLM call passes a client that fails on any call."

**Acceptance criteria.**
- [ ] Fixture "manifest version changes": a repository whose `package.json` pins a dependency at one version, a stored fact about that version anchored at that commit, then a commit that changes the version. After one maintenance run with an LLM client that fails if called: the old fact is ended with `validTo` equal to the second commit's committer time; a current fact holds the new version; its source has kind `file`, the manifest path and the second commit; the verification row says `contradicted` and `deterministic`.
- [ ] The same fixture, read afterwards: asking as of a date between the two commits returns the old version; asking with a known-at date before the run returns the old version as current; fact history shows a succession.
- [ ] Fixture "manifest changed, version the same": another line of the manifest changes. The outcome is `confirmed` and the fact is unchanged.
- [ ] Fixture "dependency removed": the outcome is `contradicted`, the fact is live, and the report counts it as flagged.
- [ ] Fixture "file changed, no structured check": the outcome is `inconclusive` and the fact is unchanged.
- [ ] A test with a domain whose policy is `human_approval` runs the first fixture and shows the verification row `contradicted`, the fact unchanged, and the fact counted as flagged.
- [ ] A second run over the first fixture changes nothing: the successor is anchored at `HEAD` and is confirmed or not yet due.
- [ ] Every audit entry written by these runs has trigger `maintenance`.
- [ ] Unit tests of the structured check pass with these names: "reads a version from dependencies", "reads a version from devDependencies", "returns no value for a dependency that is not listed", "returns no value for a manifest that does not parse".
- [ ] A test named "the software development domain has a single-valued predicate for a dependency's version" passes.

**Validation.** Unit tests of the rung and of the structured check with a fake reader and the in-memory store. Tests of the whole run against fixture repositories with the git implementation and the SQLite adapter, on both CI platforms from FL-002. `pnpm check`.

**Completion evidence.** The commit; the passing check output on Linux and macOS arm64; the git command used for the added method, with its documentation citation.

### FL-051: LLM verification as the last rung

| | |
|---|---|
| Status | Pending |
| Phase | 3 |
| Depends on | FL-062, FL-028, FL-022 |
| Requirements | REQ-21, REQ-24 |
| Components | `packages/maintenance` (rung), `@factloom/graph-rag` (one export), `apps/mcp-server` (wiring, evals) |

**Objective.** For a fact the deterministic rungs could not decide, ask an LLM whether the file as it is now still supports the fact, record the answer, and lower the fact's confidence when it does not.

**Background.** Rung 7 of the verification ladder in the [software development research](../../research/industries/software-development.md): the LLM re-reads the changed text against the fact and answers supported, contradicted or unclear. The glossary puts the LLM last. Nobody has published how accurate this step is, so its rates are measured and reported, and its consequence is kept mild: [`INTERFACES.md`](../../architecture/INTERFACES.md) says confidence changes "on feedback or on a failed verification", and what follows from a `contradicted` outcome may be a lower confidence.

**Outcome.** A fact about a file that has changed is no longer left undecided forever. If the LLM finds the file no longer supports it, the fact's confidence falls, which brings it back into `listStaleFacts` and makes its weakness visible to an agent that recalls it.

**Scope.**
- One more rung in the verification job, after the deterministic rungs of FL-050 and FL-062, used only for facts whose deterministic outcome is `inconclusive`.
- A prompt with a three-way answer.
- A small set of verification cases and an eval in replay.

**Non-goals.**
- Invalidating or ending a fact on an LLM verdict. This item only lowers confidence.
- Verifying facts that have no anchor, such as preferences and reasons.
- Sending whole repositories or several files. One file per fact.
- Raising confidence on `confirmed`.

**Functional requirements.**
1. The rung runs only when an LLM client is configured. Without an API key it is skipped, the facts stay `inconclusive`, and the run reports how many were left.
2. The LLM receives the fact's statement and the text of the anchored file at `HEAD`, and answers one of supported, contradicted, unclear.
3. The answer is recorded with `recordVerification` and method `llm`: `confirmed`, `contradicted` or `inconclusive`.
4. On `contradicted`, the job calls `adjustConfidence` to lower the fact's confidence by a fixed step, to at least 0, with trigger `maintenance` and a reason code for a failed verification (proposed: `verification_failed`). The fact is counted as flagged.
5. If the call fails or the answer does not match the schema, the outcome recorded is `inconclusive` and the fact is counted as failed in the report.
6. A file larger than a fixed size is not sent. The outcome is `inconclusive`.
7. A file whose text matches the secret check from FL-022 is not sent. The outcome is `inconclusive`.
8. One run makes at most a fixed number of LLM calls. Facts beyond it wait for the next run.

**Technical requirements.**
1. The rung calls `LlmClient.generateObject` with `task: 'verification'`, the stable instructions in `instructions`, and the fact and file text in `input`.
2. The size limit, the confidence step and the number of calls per run are three named constants.
3. Verification cases are data files in `apps/mcp-server/evals/`: a statement, a file text, and the expected answer, at least four for each of the three answers, reviewed by hand. The eval runs them through the rung with the LLM replayed by the wrapper of FL-028 and prints the table of expected against given answers, and the share of cases expected supported or unclear that were answered contradicted.
4. The model for the `verification` task comes from the composition root's task map. No model name is written in `maintenance`.
5. The secret check of FL-022 is internal to `@factloom/graph-rag`, and `maintenance` may import only `core`. The check therefore reaches the rung as a function passed by the composition root. This item adds it to the exports of `@factloom/graph-rag` and to [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md).

**Constraints.**
- [`GLOSSARY.md`](../../../GLOSSARY.md), "Verification": deterministic checks come first.
- `.claude/rules/testing.md`, "Evals": replayed responses; a missing recording fails the run.
- Text sent to the LLM provider leaves the machine. The rung sends nothing the secret check matches.

**Acceptance criteria.**
- [ ] A unit test shows the rung is not reached for a fact whose deterministic outcome is `confirmed`, `contradicted` or `source_missing`: it passes with an LLM client that fails if called.
- [ ] A unit test with a scripted LLM shows each of the three answers recorded with method `llm` and the matching outcome.
- [ ] A unit test shows `contradicted` lowers the confidence by the step, leaves the fact live, and writes audit entries with trigger `maintenance`.
- [ ] A unit test shows a failed call records `inconclusive` and changes no confidence.
- [ ] Unit tests show an oversized file and a file containing a secret pattern are not sent: each passes with an LLM client that fails if called.
- [ ] A unit test shows that with no LLM client configured the run completes and reports the facts left `inconclusive`.
- [ ] A unit test shows the call limit: with the limit set to 2 and five undecided facts, two calls are made.
- [ ] The verification eval runs inside `pnpm check` in replay, fails on a missing recording, and prints the table and the rate. The rate is recorded; this item sets no target for it.

**Validation.** Unit tests with scripted and failing LLM clients, the fake repository reader and the in-memory store. The eval in replay. One live run by hand: the owner runs the eval with recording on and records the model identifier and the rate.

**Completion evidence.** The commit; the eval table and rate; the model identifier the recordings were made with; the three constants' values.

### FL-052: Entity merge with read resolution

| | |
|---|---|
| Status | Pending |
| Phase | 3 |
| Depends on | FL-015 |
| Requirements | REQ-20 (REQ-CA-05), REQ-15, REQ-24 |
| Components | `@factloom/core` (operation, in-memory store), `@factloom/storage` (migration, adapter, contract suite) |

**Objective.** Record that two entities are the same thing so that facts about either are read together, without rewriting any entity or fact.

**Background.** [`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 3", gives the signatures of `mergeEntities` and `undoEntityMerge` and their rules: a merge is a row; it can be refused; undoing sets `undone_at` once. "What a caller must know beyond the signatures" says the store resolves entity identifiers through merges and that the read methods do not change shape. [`SCHEMA.md`](../../architecture/SCHEMA.md), "Planned additions", describes `entity_merge`. The [entity resolution research](../../research/technical/entity-resolution.md) explains why: a wrong merge that rewrote facts could not be undone, and no system it read records enough to undo one.

The original item was split in two. This one adds the table, the operation `mergeEntities` and the resolution of entity identifiers through merges in every read. Undoing a merge, chains of merges and the refusal of a merge that would break the single-value rule are FL-063.

**Outcome.** After a merge, a question about either entity returns the facts of both, shown under the entity that the other was merged into. No entity row and no fact row has changed.

**Scope.**
- The migration that adds `entity_merge`, with its `undone_at` column.
- A `Change` kind (proposed: `merge_entities`), the `Operation` name `merge`, an `AuditAction` (proposed: `entity.merged`) and a reason code (proposed: `same_entity`).
- The operation `mergeEntities`.
- Resolution through merges in every read method, and in the single-value rule for commits made after a merge, in both stores.
- One read of the merges of a namespace, including undone ones (proposed: `listEntityMerges`).

**Non-goals.**
- `undoEntityMerge`, merging an entity that others were already merged into, and refusing a merge whose two entities already hold conflicting facts: FL-063. No job calls `mergeEntities` in this item.
- Finding duplicates. FL-053.
- The `entity_alias` table that `SCHEMA.md` lists beside `entity_merge`. FL-053.
- An MCP tool to merge or list entities.
- Merging across namespaces. Two entities of different types can be merged, because the same thing is sometimes extracted under two types ([`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 3"; [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md)).
- Splitting an entity that was recorded as one.

**Functional requirements.**
1. `mergeEntities` adds one row: from, into, and the time. No entity row and no fact row changes.
2. From then on, every read resolves an entity identifier through the merges that are not undone:
   - `listFacts` by subject, and by `touchingEntityIds`, matches facts recorded against any entity merged into the one asked for, and facts of the one it was merged into when asked by the merged identifier.
   - `subject` and `objectEntity` in every result are the entity the others were merged into.
   - Both search lanes return results with the same resolution.
3. The single-value rule is applied across merged entities: a commit that records a fact against either identifier is checked against the live facts of both.
4. Errors of `mergeEntities`: `not_found` for a missing entity or one in another namespace; `invalid_input` for an entity merged with itself; `already_exists` when the first entity is already merged; `storage_failed`. A merge of two entities of different types is accepted.
5. Until FL-063, a merge whose target is itself already merged, or whose first entity already has others merged into it, is refused with `invalid_input`, so that this item never has to follow a chain.
6. Resolution uses the merges in force when the read is made. A read with a past known-at date still resolves through today's merges, as `INTERFACES.md` states the rule without a time condition.
7. Resolution ignores a merge whose `undone_at` is set. Nothing in this item sets it.
8. The read of merges returns each merge's identifier, the two entities, the time, and `undone_at`.

**Technical requirements.**
1. The `entity_merge` table has the columns of `SCHEMA.md`, "Planned additions": from, into, `merged_at` and `undone_at`. Rows are append-only except for one change: `undone_at` from missing to a timestamp. A trigger enforces it, in the style of `fact_changes_only_by_invalidation`. The trigger is in this item's migration, so FL-063 needs no migration.
2. The audit entry of a merge targets the entity merged from, and its `detail` holds the other entity's identifier and the merge identifier.
3. Resolution is done inside the store, in the SQL of the SQLite adapter and in the in-memory store. No caller resolves identifiers itself, and the read methods do not change shape.
4. The migration carries a comment on what the Postgres version will do differently.

**Constraints.**
- [`SCHEMA.md`](../../architecture/SCHEMA.md), rule 9: entities are immutable.
- [`SCHEMA.md`](../../architecture/SCHEMA.md), rule 8: the single-value rule holds at all times.
- REQ-CA-05: every merge writes an audit entry, and no operation deletes a fact row.

**Acceptance criteria.**
- [ ] Contract suite cases pass against both stores: two entities of one type, each with facts; after `mergeEntities`, `listFacts` by either identifier returns the facts of both with `subject` set to the entity merged into; each search lane returns a fact recorded against the merged entity with the same `subject`.
- [ ] A contract case shows the number and content of entity rows and fact rows are identical before the merge and after it.
- [ ] A contract case shows two entities of different types are merged, and `listFacts` by either identifier returns the facts of both.
- [ ] A contract case shows that after the merge of two entities, recording a second open-ended value for a single-valued predicate against the merged identifier fails with `conflict`, when the other entity holds an open-ended value for that predicate.
- [ ] Contract cases cover the refusals: a self-merge is `invalid_input`; a merge of an already merged entity is `already_exists`; a merge into an entity that is itself merged is `invalid_input`; an entity in another namespace is `not_found`.
- [ ] A contract case shows one audit entry for the merge, with operation `merge` and action `entity.merged`.
- [ ] A contract case shows `listEntityMerges` returns the merge with its two entities, its time and a null `undone_at`, and returns nothing from another namespace.
- [ ] A SQLite adapter test shows a direct `DELETE` on `entity_merge`, and any `UPDATE` other than setting `undone_at` once, are refused.
- [ ] A SQLite adapter test opens a database created by the earlier migrations only, applies the new one, and reads an existing fact unchanged.
- [ ] `pnpm check` exits 0.

**Validation.** The contract suite against both stores. SQLite adapter tests for the triggers and the migration. Unit tests of the operation with the in-memory store. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the updated `INTERFACES.md` and `SCHEMA.md` with the names this item settled.

### FL-063: Undo a merge and refuse a conflicting merge

| | |
|---|---|
| Status | Pending |
| Phase | 3 |
| Depends on | FL-052 |
| Requirements | REQ-20 (REQ-CA-05), REQ-15, REQ-24 |
| Components | `@factloom/core` (operations, in-memory store), `@factloom/storage` (adapter, contract suite) |

**Objective.** Let a merge be undone, let merges form a chain, and refuse a merge that would break the single-value rule.

**Background.** FL-052 added the `entity_merge` table, `mergeEntities` and the resolution of identifiers in reads. [`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 3", gives the rest of the behaviour. Undoing a merge sets `undone_at` on its row, once, and facts stay with the entity they were recorded against, so nothing needs to be moved back. Reads follow a chain if the target of a merge was itself merged later. A merge is refused with `conflict` when the two entities hold live facts for the same single-valued predicate with different objects and overlapping valid periods; product 2 resolves them first. Two entities of different types can be merged. The [entity resolution research](../../research/technical/entity-resolution.md) explains why the undo matters: a wrong merge that rewrote facts could not be undone, and no system it read records enough to undo one.

**Outcome.** After the undo of a merge, each entity has exactly the facts that were recorded against it. A merge that would leave two conflicting live facts under one entity is refused, with the facts named. REQ-20, "a merge can be undone", is met.

**Scope.**
- The operation `undoEntityMerge`, with a `Change` kind (proposed: `undo_entity_merge`), an `AuditAction` (proposed: `entity.merge_undone`) and a reason code (proposed: `merge_mistaken`).
- Chains of merges: the refusal of FL-052 is lifted, reads follow a chain, and a cycle is refused.
- The refusal of `mergeEntities` with `conflict`, checked inside the commit.

**Non-goals.**
- A new table or migration. `undone_at` and its trigger are in the migration of FL-052.
- Refusing a merge across entity types. Such a merge is accepted.
- Resolving the conflicting facts that cause a merge to be refused. The caller does that first.
- Flattening a chain of merges, and splitting an entity that was recorded as one.
- An MCP tool or a command to undo a merge. The operation is called by tests now and by a later interface.

**Functional requirements.**
1. `undoEntityMerge` sets `undone_at` on the merge's row, once, and writes one audit entry. Errors: `not_found`; `already_exists` if already undone; `storage_failed`.
2. After an undo, facts recorded against either identifier, before or during the merge, are read under the identifier they were recorded against.
3. A merge whose target is itself merged, and a merge of an entity that others were merged into, are accepted. Every read resolves an identifier through the whole chain of merges that are not undone: with A merged into B and B into C, the facts of all three are read under C.
4. Undoing one merge of a chain separates the chain at that merge and leaves the other merges in force.
5. `mergeEntities` is refused with `conflict`, naming the facts in `relatedFactIds`, when the two entities, each with everything already merged into it, hold live facts for the same single-valued predicate with different objects and overlapping valid periods. Nothing is merged.
6. Two entities that hold the same object for a single-valued predicate, with overlapping valid periods, are merged. The two facts restate each other and both stay.
7. A merge of two entities of different types is accepted, subject to the same refusal.
8. A merge that would create a cycle is refused with `invalid_input`.

**Technical requirements.**
1. The refusal in requirement 5 must hold when another process records a conflicting fact between the operation's check and its commit. The check is therefore made inside the commit, by the store. This is the same reasoning as for the single-value rule itself ([ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md)).
2. Whether a predicate is single-valued comes from the domain that `mergeEntities` is given, and reaches the store in the change, as `singleValued` does for a recorded fact. The store still decides nothing.
3. Chain resolution is bounded by the cycle refusal. In the SQLite adapter it is one query, not one query per step.
4. The audit entry of an undo targets the entity merged from, and its `detail` holds the merge identifier.
5. Requirement 6 leaves two live facts with one subject, one single-valued predicate and overlapping periods under the merged entity. They have the same object, so they are not a **conflict** as the glossary defines it, but the store's rule does not compare objects ([ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md)). How the rule treats two such facts after a merge is settled in this item and recorded in `INTERFACES.md` before the code is written.

**Constraints.**
- [`SCHEMA.md`](../../architecture/SCHEMA.md), rule 9: entities are immutable.
- [`SCHEMA.md`](../../architecture/SCHEMA.md), rule 8: the single-value rule holds at all times.
- REQ-CA-05: every merge writes an audit entry, and no operation deletes a fact row.

**Acceptance criteria.**
- [ ] A contract case, against both stores, shows that after `undoEntityMerge`, `listFacts` by each identifier returns exactly the facts recorded against it, including one recorded while the merge was in force.
- [ ] A contract case shows the number and content of entity rows and fact rows are identical before the merge, after it, and after its undo.
- [ ] A contract case shows a chain: A merged into B, then B into C; `listFacts` by A returns the facts of all three under C, and each search lane returns them with the same `subject`.
- [ ] A contract case shows that undoing the merge of B into C leaves the facts of A and B read under B, and those of C under C.
- [ ] A contract case shows a merge is refused with `conflict`, with both facts in `relatedFactIds`, when the two entities hold different current values for a single-valued predicate, and that `listEntityMerges` then returns no merge.
- [ ] A contract case shows two entities of different types that hold different current values for a single-valued predicate are refused in the same way, and are merged when they do not.
- [ ] A contract case for an adapter that keeps its data in a file: one connection commits a merge while a second commits a conflicting fact for the other entity. Exactly one of the two commits succeeds.
- [ ] Contract cases cover the other refusals: a second undo is `already_exists`; an unknown merge is `not_found`; a merge in another namespace is `not_found`; a cycle is `invalid_input`.
- [ ] A contract case shows one audit entry for the undo, with operation `merge` and action `entity.merge_undone`.
- [ ] `pnpm check` exits 0.

**Validation.** The contract suite against both stores. Unit tests of the two operations with the in-memory store. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the section of `INTERFACES.md` that records the answer to technical requirement 5.

### FL-053: Duplicate entity detection by name

| | |
|---|---|
| Status | Pending |
| Phase | 3 |
| Depends on | FL-048, FL-052, FL-063 |
| Requirements | REQ-20, REQ-24 |
| Components | `packages/maintenance` (job), `@factloom/core` (one read), `@factloom/storage` (the read; the alias table if it is built) |

**Objective.** Find pairs of entities that are the same thing by their names alone, with no embedding and no LLM, and merge them or report them according to the domain's correction policy.

**Background.** Phase 1 resolves an entity only by its exact normalised name (FL-020), so "Postgres" and "PostgreSQL" become two entities. The [entity resolution research](../../research/technical/entity-resolution.md) recommends merging late and conservatively: an entity left unmerged costs some recall and can be fixed later, while a wrong merge joins the facts of two different things. It found no published over-merge rate for any LLM memory system. Its staged design is: stricter name matching, then aliases, then embedding neighbours as candidates only, then an LLM that decides. Question Q-56 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md), how well the LLM judges entity pairs from code-related text and what similarity threshold suits the embedding model, is open.

The alias table needs a decision before it is built. Section C of `OPEN-QUESTIONS.md` questions it, and FL-052 already makes a merged name resolve to the entity it was merged into, which is what an alias lookup would do. The first step of this item is to name a use of the alias table that merge resolution does not serve. If there is one, the table is built as described below. If there is none, it is left out and a decision record says why.

The original item was split in two. This one builds the job and its two stages that need only names. The stages that use embedding similarity and an LLM, and the reviewed set of entity pairs with its over-merge count, are FL-064.

**Outcome.** A maintenance run joins the duplicates whose names differ only in spelling details, and reports them when the policy asks for a person. No API key and no embedding model is needed.

**Scope.**
- A read of all entities of a namespace (proposed: `listEntities`), in both stores.
- The detection job, registered in the maintenance run, with two stages: normalised name, then alias.
- The decision on the alias table, and the table with its `Change` kind if the decision is to build it.

**Non-goals.**
- The embedding stage and the LLM stage, and the entity pair set with its eval: FL-064.
- MinHash, phonetic matching, and clustering of pairs into groups. The research lists them under "Do not build yet".
- Changing entity resolution at write time (FL-020).
- Comparing entities of different types. `mergeEntities` accepts such a merge, but an equal name is weak evidence that two things of different types are the same. Those pairs are left to the LLM stage of FL-064.
- Resolving the conflicting facts when a merge is refused. The pair is reported.
- Storing proposed merges. Under `human_approval` the pairs are in the run's report and nowhere else.

**Functional requirements.**
1. The job compares only entities of the same namespace and the same type.
2. Stages run in order, and a pair decided by one stage is not passed to the next:

   | Stage | Rule | Decision |
   |---|---|---|
   | 1. Name | The two names are equal under a stricter normalisation than `name_key`: Unicode NFKC, and punctuation and white space removed | Same |
   | 2. Alias | One name equals a stored alias of the other entity, and of no other entity. Only if the alias table is built | Same |

3. A pair decided "same" is merged with `mergeEntities` under policy `automatic`, and reported without merging under `human_approval`. The entity created earlier is the one merged into.
4. A pair that has a merge with `undone_at` set is never merged again by the job. It reads the merges, including undone ones, through `listEntityMerges` from FL-052. Someone undid that merge, and the job does not repeat it.
5. A merge that `mergeEntities` refuses with `conflict` is counted as flagged and reported with the facts in the way. Any other refusal is counted as failed.
6. Entities already joined by a merge that is in force are not compared again.
7. If the alias table is built: an alias is a name, an entity and a time; it is written through `commit` by its own `Change` kind with an audit entry; and it is immutable.

**Technical requirements.**
1. `listEntities` is paged by a limit and a cursor, returns only the namespace's entities, and is one indexed query. It is added to `MemoryStore` in both stores and to the contract suite.
2. The stricter normalisation is a pure function in `maintenance`, applied on top of `normaliseEntityName` from `core`, with its own unit tests.
3. The job is written so that further stages can be added after stage 2 without changing the first two: it passes on the pairs that no stage decided. FL-064 adds two stages.
4. The dependencies given to the job in every test of this item include an LLM client and an embedder that both fail if called.

**Constraints.**
- [`INTERFACES.md`](../../architecture/INTERFACES.md): a merge can be refused, and product 2 does not force it.
- The [entity resolution research](../../research/technical/entity-resolution.md): merge late and conservatively.
- `.claude/rules/engineering-principles.md`: no abstraction and no table without a use.

**Acceptance criteria.**
- [ ] The decision on the alias table is recorded in a decision record that names the use, or says there is none.
- [ ] Contract suite cases for `listEntities` pass against both stores: paging returns every entity once; no entity of another namespace is returned.
- [ ] A unit test for stage 1 passes with an LLM client and an embedder that both fail if called: two entities whose names differ only in punctuation and case are merged under `automatic`, into the one created earlier.
- [ ] A unit test shows two entities with equal names and different types are not compared.
- [ ] A unit test shows that under `human_approval` the same pair is reported and no merge row is written.
- [ ] A unit test shows a pair with an undone merge is not merged again. The store given to the job is wrapped so that `listEntityMerges` returns one merge of the pair with `undone_at` set.
- [ ] A unit test shows a merge refused with `conflict` is counted as flagged and the run continues. The store given to the job is wrapped so that the commit of the merge returns `conflict`.
- [ ] A unit test shows a second run over the same memory makes no further merge.
- [ ] Unit tests of the stricter normalisation pass with these names: "treats names that differ only in punctuation as equal", "treats compatibility forms of a character as equal", "keeps names with different letters apart".
- [ ] Every merge made by the job has an audit entry with trigger `maintenance`.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests with failing LLM and embedder clients and the in-memory store. The contract suite for the new read. `pnpm check`.

**Completion evidence.** The commit; the decision record on the alias table; the passing check output.

### FL-064: Duplicate entity detection by similarity

| | |
|---|---|
| Status | Pending |
| Phase | 3 |
| Depends on | FL-053, FL-028 |
| Requirements | REQ-20, REQ-24 |
| Components | `packages/maintenance` (two stages), `@factloom/core` (one LLM task), `apps/mcp-server` (wiring, evals) |

**Objective.** Add two stages to the duplicate entity job: embedding similarity to find candidate pairs, then an LLM to decide them, and measure how often the whole job merges two different things.

**Background.** FL-053 joins entities whose names are equal after normalisation. It cannot see that "Postgres" and "PostgreSQL" are one thing. The [entity resolution research](../../research/technical/entity-resolution.md) gives the rest of the staged design: embedding neighbours as candidates only, then an LLM that decides, and it rules out merging on similarity alone. It found no published over-merge rate for any LLM memory system, so the rate is measured here on a reviewed set. Question Q-56 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md), how well the LLM judges entity pairs from code-related text and what similarity threshold suits the embedding model, is open. [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md) expects an entity merge to join the same thing recorded under two entity types, and `mergeEntities` accepts such a merge, so the LLM stage is also where a pair of different types is decided.

**Outcome.** A maintenance run with an API key also joins duplicates whose names differ, and reports the uncertain ones. The number of wrong merges on a reviewed set of entity pairs is known.

**Scope.**
- Stage 3, embedding similarity, and stage 4, the LLM, added to the job of FL-053.
- A fourth `LlmTask` for it.
- A reviewed set of entity pairs, and an eval over all four stages that counts over-merges and under-merges.

**Non-goals.**
- Automatic merging on embedding similarity alone, at any threshold. The research rules it out.
- A table of entity embeddings.
- MinHash, phonetic matching, and clustering of pairs into groups.
- Storing proposed merges. Under `human_approval` the pairs are in the run's report and nowhere else.
- A target for the over-merge count of the LLM stage. It is reported.

**Functional requirements.**
1. The two stages receive the pairs that stages 1 and 2 did not decide:

   | Stage | Rule | Decision |
   |---|---|---|
   | 3. Embedding | The embeddings of the two names are closer than a threshold. Pairs of the same type only | Candidate only. Passed to stage 4 |
   | 4. LLM | The LLM sees both names, both types, and up to a fixed number of facts of each, and answers same, different or unsure | Same only on "same" |

2. A pair of entities of different types whose names are equal under the stricter normalisation of FL-053 goes to stage 4 without passing stage 3.
3. A pair decided "same" is merged or reported as in FL-053: merged under policy `automatic`, reported under `human_approval`, never merged again after an undone merge, and counted as flagged when the merge is refused with `conflict`.
4. Without an LLM client, stage 3 runs and its candidates are reported, not merged.
5. One run makes at most a fixed number of LLM calls. Candidates beyond it wait for the next run.
6. If the LLM call fails or its answer does not match the schema, the pair is left unmerged and counted as failed.

**Technical requirements.**
1. Name embeddings are computed during the run with `Embedder.embed` and held in memory. No table of entity embeddings is added.
2. The threshold of stage 3 is one named constant. Its first value is chosen from the similarities of the true and false pairs in the entity pair set, and the item records the two distributions. Thresholds from other systems are not reused, because they do not transfer between models (research, failure modes table).
3. The LLM stage needs a task name. `LlmTask` has three values and none is for entities. The item adds a fourth (proposed: `entity_matching`) to `INTERFACES.md` and to the task map of the Anthropic client.
4. The entity pair set is data in `apps/mcp-server/evals/`: two names, their types, a few facts for each, and the expected answer. At least 20 pairs, reviewed by hand, including same name with different meaning, short names, an abbreviation and its long form, two versions of one product, and one thing recorded under two types. It includes the two examples the research names: "Postgres" and "PostgreSQL", and two different things both called "Java".
5. The eval runs the four stages over the pair set with the real local embedder and with the LLM replayed by the wrapper of FL-028. It prints, for each stage, how many pairs it decided, and the over-merge count (expected different, decided same) and under-merge count (expected same, not decided same).
6. The stable part of the prompt is in `instructions` and the pair is in `input`. No model name is written in `maintenance`.

**Constraints.**
- [`INTERFACES.md`](../../architecture/INTERFACES.md): a merge can be refused, and product 2 does not force it.
- [ADR 0013](../../architecture/adr/0013-claude-behind-a-one-method-interface.md): the stage sees only `LlmClient`.
- `.claude/rules/testing.md`, "Evals": replayed responses; a missing recording fails the run.

**Acceptance criteria.**
- [ ] A unit test shows a pair above the threshold is sent to the LLM and a pair below it is not, with the fake embedder and a scripted LLM.
- [ ] A unit test shows an "unsure" answer and a "different" answer from a scripted LLM both leave the pair unmerged, and a "same" answer merges it under `automatic`.
- [ ] A unit test shows that without an LLM client no pair from stage 3 is merged, and the candidates are in the report.
- [ ] A unit test shows a pair of different types with equal names reaches the LLM stage and is merged on "same".
- [ ] A unit test shows the call limit: with the limit set to 2 and five candidates, two calls are made.
- [ ] A unit test shows a failed LLM call leaves the pair unmerged and counts it as failed.
- [ ] The entity pair eval runs inside `pnpm check` in replay and fails on a missing recording. Its output shows an over-merge count of 0 for pairs decided by stages 1 and 2. The over-merge and under-merge counts of stage 4 are printed and recorded; this item sets no target for them.
- [ ] The owner reads each pair of the set and its expected answer, and records "reviewed" and the date.
- [ ] Every merge made by the two stages has an audit entry with trigger `maintenance`.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests with scripted and failing LLM clients, the fake embedder and the in-memory store. The entity pair eval in replay. One live run by hand: the owner runs the eval with recording on and the real embedder, and records the counts and the two similarity distributions.

**Completion evidence.** The commit; the eval output; the threshold's value and the distributions it was chosen from; the model identifier the recordings were made with; Q-56 in `OPEN-QUESTIONS.md` brought up to date.

### FL-054: Anchor repair for moved and renamed files

| | |
|---|---|
| Status | Pending |
| Phase | 3 |
| Depends on | FL-050 |
| Requirements | REQ-22, REQ-24 |
| Components | `@factloom/core` (repository interface), `packages/maintenance` (job), `apps/mcp-server` (git implementation), fixture repositories |

**Objective.** When a fact's anchor points at a path that no longer exists, find where the file went using git, and give the fact a source at the new path. When git shows no successor, leave the fact flagged as an orphaned fact.

**Background.** FL-050 records `source_missing` when a path is gone and does not look further. Rung 2 of the verification ladder in the [software development research](../../research/industries/software-development.md) says a renamed file means "repair the link" and a deleted one means "mark the fact for review". Check 4.2 in that document found the new path of a renamed file with two git commands, and was run. Sources are immutable ([`SCHEMA.md`](../../architecture/SCHEMA.md), rule 9), so a repair cannot change a locator: it attaches a new source.

**Outcome.** A fact anchored to `src/util.ts` keeps being verifiable after the file becomes `src/dates.ts`. A fact whose file is really gone stays on the orphaned list for a person to look at.

**Scope.**
- One addition to the repository interface: the path a missing file was renamed to.
- The repair job, registered in the maintenance run after the verification job.
- Attaching a source at the new path, and recording a fresh verification.

**Non-goals.**
- Changing a fact whose statement or object names the old path. The statement is left as it is; whether it is still true is a matter for verification and for the agent.
- Merging or renaming the entity of a moved file.
- Finding a moved symbol inside a file.
- Guessing a successor from file names or content when git records no rename.
- Invalidating a fact because its file is gone.

**Functional requirements.**
1. The job takes the facts from `listOrphanedFacts` whose latest verification is `source_missing` and whose anchored source is of kind `file`.
2. For each, it asks the repository where the path went. A file renamed more than once is followed, up to a fixed number of steps, until a path that exists at `HEAD`.
3. If a successor path is found, the job attaches a new source to the fact: kind `file`, the new path, and the `HEAD` commit. No fact row is written and the fact keeps its identifier.
4. It then records a verification: `confirmed` if the file's content at the new path is the same as at the anchor's commit, and `inconclusive` if it was also changed. Either way the fact leaves the orphaned list, and FL-050 uses the new source from the next run, because it is the most recently observed.
5. If no successor is found, nothing is changed. The fact stays on the orphaned list and is counted as flagged in the run's report.
6. Running the job twice changes nothing the second time.

**Technical requirements.**
1. `INTERFACES.md` has no operation whose only purpose is to attach a source. The job uses `recordFacts` with no drafts and the fact in `restatedFactIds`, with trigger `maintenance` and a reason code for a moved anchor (proposed: `anchor_moved`). The item confirms that `recordFacts` accepts that input, and settles which `Operation` name the audit entry carries, in `INTERFACES.md`.
2. The git implementation uses the two commands of check 4.2, re-checked against the git documentation with the page cited, run as child processes with arguments as a list.
3. A rename is whatever git reports as one with its default similarity setting. The job adds no threshold of its own.
4. Fixture repositories are created by the test with fixed commit dates, as in FL-050.
5. The dependencies given to the job in every test include an LLM client that fails if called.

**Constraints.**
- [`SCHEMA.md`](../../architecture/SCHEMA.md), rules 5 and 9: a source can be attached to a live fact later; sources and source links are never changed.
- [`INTERFACES.md`](../../architecture/INTERFACES.md): verification is recorded, not applied.

**Acceptance criteria.**
- [ ] Fixture "renamed": a fact anchored to a file that a later commit renames without changing it. After a maintenance run that includes FL-050's job and this one: the fact has the same identifier and is live; it has a second source with the new path and the `HEAD` commit; its latest verification is `confirmed`; `listOrphanedFacts` does not return it.
- [ ] Fixture "renamed and edited": as above, with the file also changed in the renaming commit so that git still reports a rename. The latest verification is `inconclusive` and the fact is not on the orphaned list.
- [ ] Fixture "renamed twice": the new source carries the final path.
- [ ] Fixture "deleted": no source is attached, the fact is live, `listOrphanedFacts` returns it, and the report counts it as flagged.
- [ ] A second run over the "renamed" fixture attaches no further source and writes no audit entry for the fact.
- [ ] The number of fact rows is the same before and after every fixture run.
- [ ] Every audit entry written by the job has trigger `maintenance` and reason code `anchor_moved`.
- [ ] All fixture runs pass with an LLM client that fails if called.

**Validation.** Unit tests of the job with the fake repository reader and the in-memory store. Fixture repository tests with the git implementation and the SQLite adapter on both CI platforms. `pnpm check`.

**Completion evidence.** The commit; the passing check output on Linux and macOS arm64; the git commands used, each with its documentation citation.

### FL-055: Usage tracking

| | |
|---|---|
| Status | Pending |
| Phase | 3 |
| Depends on | FL-031, FL-048, FL-058 |
| Requirements | REQ-23 |
| Components | `@factloom/core` (interface, in-memory store), `@factloom/storage` (migration, adapter, contract suite), `apps/mcp-server` (usage step after `recall`) |

**Objective.** Record which facts recall returns, without making recall a write, so that archiving has something to decide by.

**Background.** An **archived fact** is a live fact left out of recall by default because it has not been used. [`SCHEMA.md`](../../architecture/SCHEMA.md), "Planned additions", describes a `fact_usage` table and the record that a fact is archived, and says they were kept out of phase 1 so that recall stays a pure read and that archiving by disuse starts counting when it is introduced. [`INTERFACES.md`](../../architecture/INTERFACES.md) states the rule and its one exception: "Reads never write. Recall does not update a counter or a timestamp. From phase 3, how often a fact is recalled is recorded by the caller after the read, in a usage table outside `commit` and with no audit entry: usage counts are bookkeeping, not memory." The original item was split: this one records usage, and FL-065 archives. The [research on decay](../../research/technical/memory-decay-and-consolidation.md) gives the position this item follows: archiving is about tidiness and never changes what Factloom believes; usage is counted when a fact is returned to the caller, in one batched write after the response is produced, and a lost update is acceptable. It also names the main risk: a true fact that is rarely used. Two questions are open in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md): Q-11, whether usage writes cause contention, and Q-57, what period suits code memory. The research's 180 days is a placeholder.

**Outcome.** For every fact, memory's bookkeeping shows when it was last returned by recall and how often. `recall` is still a pure read, and the audit log holds no entry for a recall. FL-065 reads these counts to decide what to archive.

**Scope.**
- The migration that adds `fact_usage`.
- One write method on `MemoryStore` for usage, outside `commit` and with no audit entry, and one read of a fact's usage, in both stores.
- The step in `apps/mcp-server` that records usage after `recall` has returned.
- The measurement that open question Q-11 asks for.

**Non-goals.**
- Archiving, unarchiving and the archiving job: FL-065.
- Any use of usage or age in ranking. The research lists it under "Do not build yet".
- A retrieval log, a pinned flag, and an importance value. Section C of `OPEN-QUESTIONS.md` questions each, and nothing in this item reads one.
- An audit entry for a recall. Usage counts are bookkeeping, not memory.
- A job in the maintenance run. This item registers none; the run of FL-048 gains the archiving job in FL-065.

**Functional requirements.**
1. The `recall` use case (FL-031) remains a pure read. It writes nothing, with or without usage tracking.
2. After `recall` has produced its result, the caller records usage for the facts in that result with the store's usage method (proposed: `recordFactUsage`): for each fact, the time and a count increased by one, in one write.
3. The usage write is not a change to memory. It does not go through `commit`, builds no `ChangeSet`, and writes no audit entry. It touches no row of `fact`, `source`, `entity` or `audit_log`.
4. A failure to record usage never fails or delays the recall result. It is logged to standard error and dropped. A lost update is acceptable.
5. Usage is recorded by the `recall` tool only. `get_fact_history`, the fact operations and the evals record none.
6. A fact that does not exist in the namespace is skipped by the usage write, without an error.
7. The read returns, for a fact, the time it was last recalled and its count, or nothing when it was never recalled. It never returns usage from another namespace.
8. Each store keeps the time at which its usage tracking began, so that FL-065 can tell "never used" from "not yet counted".

**Technical requirements.**
1. `INTERFACES.md`, "What a caller must know beyond the signatures", states that usage is recorded by the caller after the read, in a usage table outside `commit` and with no audit entry. This item adds the method's signature to that document. `commit` stays the only way to change memory ([ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md)); no new decision record is needed.
2. [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "What a handler does", says a handler does three things. Recording usage after the `recall` result is produced is a fourth step for that one handler. The item updates that section to say so.
3. The usage write is one batched statement for all facts of a result, and the timestamp is passed in as a parameter.
4. `fact_usage` holds one row per fact, updated in place. It is the one table whose rows change, which is acceptable because it holds bookkeeping and no content. The schema inventory test of FL-061 classifies its columns as "not content".
5. The owner measures Q-11 once: with the server running against a database of 10,000 facts, the time of 100 `recall` calls with usage recording on and off. The result is added to `OPEN-QUESTIONS.md`.
6. The migration carries a comment on what the Postgres version will do differently.

**Constraints.**
- [`INTERFACES.md`](../../architecture/INTERFACES.md): "Reads never write", and the stated exception for usage counts.
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): recording usage changes no fact row.
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md): a usage row belongs to the namespace of its fact.

**Acceptance criteria.**
- [ ] A unit test of `recall` with the in-memory store shows the store's whole content, usage included, is identical before and after the call. A SQLite adapter test shows the same by comparing a dump of every table before and after the lane queries.
- [ ] A test of the `recall` tool handler shows that after a call the usage of each returned fact has a count of 1 and the time of the call, and after a second call a count of 2.
- [ ] A test of the `recall` tool handler with a store whose usage write always fails shows the tool result is returned unchanged and without error.
- [ ] A contract suite case, against both stores, shows that recording usage for three facts sets their time and raises each count by one, in one call, and that `listAuditEntries` for each fact returns the same entries as before.
- [ ] A contract case shows usage recorded for a fact of another namespace, or for an unknown fact, changes nothing and returns no error.
- [ ] A SQLite adapter test shows the row counts of `fact`, `source`, `entity` and `audit_log` are unchanged by a usage write.
- [ ] A test shows `get_fact_history` records no usage.
- [ ] The MCP smoke test still passes.
- [ ] The owner records the two timings of technical requirement 5 in `OPEN-QUESTIONS.md`.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests of `recall` and of the handler. The contract suite against both stores. The MCP smoke test. The owner's timing run. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the updated `INTERFACES.md`, `SCHEMA.md` and `MCP-TOOLS.md`; the timings added to `OPEN-QUESTIONS.md`.

### FL-065: Archiving unused facts

| | |
|---|---|
| Status | Pending |
| Phase | 3 |
| Depends on | FL-055, FL-058 |
| Requirements | REQ-23, REQ-03, REQ-24 |
| Components | `@factloom/core` (operations, in-memory store), `@factloom/storage` (migration, adapter, contract suite), `@factloom/graph-rag` (`recall` option), `packages/maintenance` (job), `apps/mcp-server` (usage step, `recall` tool input) |

**Objective.** Archive facts that have gone unused for a configured period, leave them out of recall by default, and make archiving audited and reversible.

**Background.** An **archived fact** is a live fact left out of recall by default because it has not been used ([`GLOSSARY.md`](../../../GLOSSARY.md)). FL-055 records when each fact was last recalled. The [research on decay](../../research/technical/memory-decay-and-consolidation.md) gives the position this item follows: archiving is about tidiness and never changes what Factloom believes. It also names the main risk: a true fact that is rarely used. Open question Q-57 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) asks what period suits code memory; the research's 180 days is a placeholder. Unlike a usage count, archiving changes what recall returns, so it goes through `commit` and has audit entries.

**Outcome.** Default recall stops offering facts nobody has used for a long time. Nothing is lost: an archived fact is still live, still in fact history, still returned when asked for, and comes back to default recall when it is used or unarchived.

**Scope.**
- The migration that adds the record of archiving.
- Operations that archive and unarchive (proposed: `archiveFacts`, `unarchiveFact`), with `Change` kinds, an `Operation` name (proposed: `archive`), `AuditAction` values (proposed: `fact.archived`, `fact.unarchived`) and reason codes (proposed: `unused`, `used_again`, `requested`).
- The retrieval lanes leaving out archived facts by default, and an option on `recall` to include them.
- Unarchiving a fact when it is used again.
- The archiving job, registered in the maintenance run.

**Non-goals.**
- Recording usage: FL-055.
- Any use of usage or age in ranking.
- Verifying a fact before archiving it.
- Removing archived facts from the keyword and vector entries, or removing any row.
- An MCP tool to archive or unarchive.

**Functional requirements.**
1. `archiveFacts` marks live facts as archived, in one commit, with one audit entry for each. `unarchiveFact` reverses it, with an audit entry. Neither changes the fact row, its identifier, its `invalidated_at` or its valid time. Errors: `invalid_input`, `not_found`, `already_invalidated`, `storage_failed`; archiving an archived fact, or unarchiving one that is not, is `already_exists`.
2. The three retrieval lanes leave out archived facts when the caller asks only about now. `recall` includes them when an as-of or known-at date is given, or when its new option is set (proposed: `includeArchived`, `include_archived` on the tool, default false).
3. Every other read returns archived facts: `getFact`, `listFacts` for conflict candidates and fact history, `listStaleFacts`, and the single-value rule. An archived fact still conflicts.
4. A result that includes an archived fact says so (proposed: an `archivedAt` value beside the fact).
5. When the usage step of FL-055 records usage for an archived fact, it then calls `unarchiveFact` for that fact, with reason code `used_again`. A failure is logged and dropped, as for the usage write.
6. The job archives a fact when all of these hold: it is a current fact; it is not archived; it was recorded more than the archiving period ago; and it has no usage within the period.
7. No fact is archived for disuse until a full archiving period has passed since usage tracking began in that database, which the store of FL-055 keeps.
8. Under policy `human_approval` the job archives nothing and reports the facts it would have archived, counted as flagged.
9. Changes made by the job carry the trigger `maintenance` and the reason code `unused`.

**Technical requirements.**
1. Archiving and unarchiving are changes to what recall returns and go through `commit`, each with an audit entry ([ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md)).
2. The archiving period is configuration with a default of 180 days, labelled in the configuration table of `MCP-TOOLS.md` as a placeholder until Q-57 is answered.
3. The record of archiving is rows in a side table, added and closed like `entity_merge`, so that the fact row stays immutable and the history of archiving is kept.
4. Requirement 7 is met inside each store. The job is given no date to pass.
5. The job reads the facts to consider through one read method added to `MemoryStore` in both stores (proposed: `listUnusedFacts`, with a date and a limit), which is one indexed query in the SQLite adapter.
6. The migration carries a comment on what the Postgres version will do differently.

**Constraints.**
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): archiving is not a change to the fact row, and is not an invalidation.
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "The time predicate": archiving does not alter the four conditions. It is a further filter in the lanes, used only for a question about now.
- [`GLOSSARY.md`](../../../GLOSSARY.md): an archived fact is still a live fact.

**Acceptance criteria.**
- [ ] Contract cases, against both stores, with a fixed clock: an archived fact is not returned by either search lane or by `listFacts` with `touchingEntityIds` when archived facts are excluded, and is returned by each when they are included; `getFact` returns it; `listFacts` by subject and predicate returns it.
- [ ] A contract case shows a commit that records a second open-ended value for a single-valued predicate still fails with `conflict` when the existing fact is archived.
- [ ] A contract case shows archive then unarchive leaves the fact row unchanged, writes two audit entries with operation `archive`, and that the fact is again returned by default.
- [ ] Contract cases cover the refusals: archiving an archived fact is `already_exists`; archiving an invalidated fact is `already_invalidated`; a fact in another namespace is `not_found`.
- [ ] A unit test of `recall` shows an archived fact is left out by default, returned with `includeArchived`, and returned when an as-of date is given.
- [ ] A test of the `recall` tool handler shows that an archived fact returned with `include_archived` is unarchived afterwards, with an audit entry whose reason code is `used_again`.
- [ ] Unit tests of the job with a fixed clock: a current fact recorded 200 days ago with no usage is archived; one recalled 10 days ago is not; an ended fact is not; a fact recorded 10 days ago is not.
- [ ] A unit test shows that in a store whose usage tracking began 30 days ago, a fact recorded 200 days ago is not archived.
- [ ] A unit test shows that under `human_approval` nothing is archived and the fact is counted as flagged.
- [ ] Every audit entry written by the job has trigger `maintenance`.
- [ ] The MCP smoke test still passes, and the `recall` tool's input schema includes `include_archived` with a description.
- [ ] `pnpm check` exits 0.

**Validation.** Unit tests of `recall`, the handler, the operations and the job. The contract suite against both stores. The MCP smoke test. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the updated `INTERFACES.md`, `SCHEMA.md` and `MCP-TOOLS.md`.
