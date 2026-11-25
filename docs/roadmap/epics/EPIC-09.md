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

- The maintenance run: one command, run once, with a report. No daemon. "On a schedule", in REQ-20 and in the glossary's definition of self-healing, means here that the host's scheduler or a session-start hook starts this command; Factloom runs no process of its own between sessions.
- The phase 3 fact operations of `INTERFACES.md`: `recordVerification`, `listStaleFacts`, `listOrphanedFacts`, `mergeEntities`, `undoEntityMerge`, each with its `Change` kind, `Operation` name, `AuditAction` values, reason codes and migration.
- **Verification** of anchored code facts: deterministic checks first, an LLM last. The deterministic checks cover what the owner asks of the software development domain, that referenced files and functions still exist: the file by its path (FL-050), the function by a word search for its name (FL-071).
- Detection of duplicate entities and their **entity merge**.
- Anchor repair after a file is moved or renamed.
- Usage tracking outside the read path, and archiving that is reversible and audited.

## Out of scope

- Resolving conflicts at write time and acting on feedback. [EPIC-08](EPIC-08.md).
- A syntax-aware symbol check: parsing with tree-sitter, the TypeScript compiler or a language server (the [verification ladder](../../research/industries/software-development.md), section E, rung 6). A function is checked by a word search for its name (FL-071). Parsing is considered only if text search proves too weak; see "Open decisions".
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
- **Git and the file system are reached through an interface declared in `@factloom/maintenance`**, its only consumer, and implemented in the application, which may import `maintenance` ([ADR 0003](../../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md)). The interface is not in `@factloom/core`, because commits, paths and `HEAD` belong to the software development domain and the core is generic (REQ-31).
- **Schema changes are new numbered migrations**, and every storage behaviour is a case in the storage contract suite ([`SCHEMA.md`](../../architecture/SCHEMA.md), [`TESTING.md`](../../architecture/TESTING.md)).
- **Names marked "proposed" in this file are not in `INTERFACES.md`.** The work item that uses one settles the name and adds it to `INTERFACES.md` and `SCHEMA.md`.

## Dependencies

- [EPIC-08](EPIC-08.md): the `maintenance` package (FL-040). Its confidence history (FL-045) and purge columns (FL-061) are read by FL-049.
- [EPIC-03](EPIC-03.md): the SQLite structural reads (FL-015), the migration runner and the contract suite.
- [EPIC-02](EPIC-02.md): `endFact` and `recordFacts`, which verification and anchor repair call.
- [EPIC-04](EPIC-04.md): the secret check (FL-022), which a file passes before FL-051 sends it to the LLM.
- [EPIC-05](EPIC-05.md): the `recall` use case (FL-031), whose results FL-055 counts.
- [EPIC-07](EPIC-07.md): the record-and-replay wrapper (FL-028) for the two steps that use an LLM.
- [EPIC-06](EPIC-06.md): the application, its configuration and entry point (FL-034), which host the maintenance command; the smoke test (FL-037), which shows the server still starts with no argument; and the `recall` tool (FL-058) that FL-055 and FL-073 extend.
- [EPIC-04](EPIC-04.md) also supplies the software development domain (FL-018), to which FL-071 and FL-062 add an entity type and a predicate.

## Deliverables

- The maintenance command and its report.
- `recordVerification`, `listStaleFacts`, `listOrphanedFacts`, `mergeEntities` and `undoEntityMerge` in `@factloom/core`, with migrations and contract cases.
- The deterministic verification job, with fixture repositories: path checks (FL-050), the function check (FL-071), then the manifest version check with succession (FL-062).
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
- A fact about a function whose name no longer appears in its anchored file is flagged for review, stays live, and no LLM call is made (FL-071).
- `git grep -n "RepositoryReader\|HEAD" -- packages/core/src` finds nothing: the core holds nothing about repositories.

## Open decisions

| Decision | What is known |
|---|---|
| Whether a function or symbol is checked by parsing the file, with tree-sitter, the TypeScript compiler or a language server, and not by a word search | Not used. FL-071 checks a named function by a word search for its name in the anchored file. A word search cannot tell a definition from a mention in a comment, and it misses a function that was renamed. Parsing adds a dependency for each language and is considered only if text search proves too weak, measured by the facts FL-071 flags wrongly or fails to flag |

## Work items

| ID | Title | Phase | Depends on | Status |
|---|---|---|---|---|
| FL-048 | Maintenance run entry point | 3 | FL-040, FL-034, FL-037 | Under Review |
| FL-049 | Verification records and the stale and orphaned lists | 3 | FL-015, FL-045, FL-061 | Completed |
| FL-050 | Deterministic verification: repository reader and path checks | 3 | FL-018, FL-048, FL-049 | Completed |
| FL-071 | Deterministic verification: function check by text search | 3 | FL-050, FL-018 | Completed |
| FL-062 | Deterministic verification: manifest version check and succession | 3 | FL-050, FL-018 | Completed |
| FL-051 | LLM verification as the last rung | 3 | FL-062, FL-028, FL-022 | Completed |
| FL-052 | Entity merge with read resolution | 3 | FL-015, FL-016, FL-017 | Completed |
| FL-063 | Undo a merge and refuse a conflicting merge | 3 | FL-052 | Completed |
| FL-053 | Duplicate entity detection by name | 3 | FL-048, FL-052, FL-063 | Completed |
| FL-064 | Duplicate entity detection by similarity | 3 | FL-053, FL-028 | Completed |
| FL-054 | Anchor repair for moved and renamed files | 3 | FL-050 | Completed |
| FL-055 | Usage tracking | 3 | FL-015, FL-031, FL-058 | Under Review |
| FL-065 | Archive and unarchive operations | 3 | FL-055, FL-058 | Completed |
| FL-073 | Archived facts left out of recall, and the archiving job | 3 | FL-065, FL-048, FL-058 | Completed |

### FL-048: Maintenance run entry point

| | |
|---|---|
| Status | Under Review |
| Phase | 3 |
| Depends on | FL-040, FL-034, FL-037 |
| Requirements | REQ-20, REQ-21, REQ-24 |
| Components | `packages/maintenance` (run function), `apps/mcp-server` (command, wiring, registration guide) |

**Objective.** Provide one command that runs the maintenance jobs for a namespace once, reports what each did, and exits.

**Background.** [`ARCHITECTURE.md`](../../architecture/ARCHITECTURE.md), "Background, from phase 3", says product 2 works on a schedule. Factloom's first form is a stdio server that a host starts per session, so there is no long-lived process to schedule in. The [competitive analysis](../../research/evaluations/competitive-analysis.md) (advantage A5) expects the checks to be triggered at session start. The [software development research](../../research/industries/software-development.md) (findings 5.7 to 5.10) confirmed in documentation that Claude Code and Codex both have a session start hook that can run a command; neither was run.

REQ-20 says duplicates are merged "on a schedule", and the glossary defines self-healing as running on a schedule. In this roadmap that means: the maintenance run is a command, and the host's scheduler or a session-start hook starts it. Factloom runs no daemon. The command reads the configuration of the server (FL-034), and the server must still start as before with no argument, which the smoke test (FL-037) shows.

**Outcome.** The jobs of FL-050, FL-053, FL-054 and FL-073, and the stages that FL-071, FL-062, FL-051 and FL-064 add to them, have a place to be registered and a common report. A user can run maintenance by hand, from a scheduler, or from a session start hook.

**Scope.**
- A run function in `maintenance` that runs a list of jobs in order and collects their reports.
- A command in the existing application that builds the dependencies and calls it.
- The type of a job and of its report.
- A section in the registration guide, the README section of FL-038, on how to trigger the command. If FL-038 has not yet written that section, this item adds its own section to the app's README and FL-038 places it.

**Non-goals.**
- A daemon, a timer inside the server, or a queue.
- Any job. Each later work item adds its own.
- A dry-run mode, a record of when the last run happened, and a minimum interval between runs. `listStaleFacts` already keeps recently verified facts out of the next run. Add these when a run is measured to be slow.
- A new application. The command is a further mode of `apps/mcp-server`, beside the server and the purge and proposal commands of phase 2 (FL-072, FL-070), so there is still one composition root. It is added to the entry point's handling of a command argument where those items wrote it, or writes that function if neither exists yet.

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
- [x] A unit test runs three fake jobs, the second of which fails, and shows all three ran in order and the report holds three entries with the second marked failed.
- [x] A test starts the command as a child process on a temporary database with no jobs and shows exit code 0 and a standard output that parses as the report schema.
- [x] A test starts the command without a namespace and shows a non-zero exit code and a message on standard error.
- [x] The MCP smoke test still passes: starting the application with no argument serves MCP over stdio.
- [ ] The owner adds the documented session start hook for Claude Code on the Mac, starts a session in a repository, and records the report that the run produced. The same is done for Codex. If a host's hook cannot be made to run the command, the guide says so and the reason is added to [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md).

**Validation.** Unit tests of the run function with fake jobs. Two child-process tests of the command. The MCP smoke test. The owner's two hook runs.

**Completion evidence.** The commit; the passing check output; the two reports from the owner's hook runs, or the recorded reason one could not be produced.

**Recorded evidence.** Done on 2026-11-17 on Linux x64 with Node.js v22.23.4, in three commits: `feat(maintenance): add the maintenance run and its report`, `feat(mcp-server): add the maintenance command`, and `docs: describe the app's modes and how to run maintenance from a hook`. The item is `Under Review` until the owner runs the two hooks; the last acceptance criterion is the owner's.

The run and the command:

- **The run function.** `runMaintenance(deps, jobs)` in `packages/maintenance/src/run-maintenance.ts` runs `MaintenanceJob`s, each a name and a bound `run` that returns a `Result` of `JobCounts`, one after another.
- **Failures.** A job that fails, by returning a failure or by throwing, is reported `failed` with its error code and zero counts, and the jobs after it still run.
- **The report.** The report's start and end times come from the clock passed in. Its schema, `MaintenanceReportSchema`, is exported.
- **The command.** `node src/main.ts maintenance` is a further mode of the entry point's `readCommand`, which FL-072 wrote. It opens the store from the server's configuration, so it refuses to start without a namespace. It runs the jobs of `buildMaintenanceJobs` in `src/maintenance-jobs.ts`, which is empty until FL-050 and later items add theirs, writes the report as one JSON line to standard output, and exits with 1 if a job failed.

Functional requirement 5, counting work another process did as examined, is stated in the doc comment of `MaintenanceJob`, for each job to follow; no job exists yet to test it on.

Tests:

- **Unit, 3:** three fake jobs, the second failing, all run in order, with the second reported `failed`, `storage_failed`; a throwing job is reported `failed` and the next still runs; no job gives an empty list with the run's times, and the report parses.
- **Child process, 2:** the command on a new database with no jobs exits 0 and prints a report that parses with the schema and has no jobs; with no namespace it exits non-zero, prints nothing to standard output, and says `FACTLOOM_NAMESPACE is not set` on standard error.
- **The smoke tests**, `serve-with-fake-embedder.test.ts` and `main.test.ts`, still pass: with no argument the application serves MCP over stdio.

The guide. FL-038 has not written the registration guide, so the section is in `apps/mcp-server/README.md`, "Running maintenance", for FL-038 to place. It also replaces that README's stale "scaffold only" status with a table of the modes. It gives the command by hand and a `SessionStart` hook for each host, written from the hosts' current pages, read on 2026-11-17:

- **Claude Code:** https://code.claude.com/docs/en/hooks. The event, the matchers, the fields, the default timeout of 600 seconds, and that standard output is added as context are quoted from the page; the location of the settings files was read as a summary, and the README marks it likely.
- **Codex:** https://learn.chatgpt.com/docs/hooks, to which https://developers.openai.com/codex/hooks redirects. It documents a `SessionStart` hook in `hooks.json` or `config.toml`, to be reviewed and trusted with `/hooks` before it runs.

Both hosts add a hook's standard output to the session's context, so the examples write the report to `~/.factloom/last-maintenance.json`.

`pnpm check`:

```text
 Test Files  86 passed (86)
      Tests  906 passed (906)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the third commit, including both child-process tests: https://github.com/Johnmark-Tech/factloom/actions/runs/43996240427.

Not run: the two hooks, which the last criterion gives to the owner on the Mac.

For the owner's review:

- Add the Claude Code hook from `apps/mcp-server/README.md`, start a session in a repository, and record `~/.factloom/last-maintenance.json`.
- Do the same for Codex, after trusting the hook with `/hooks`. If either hook cannot be made to run the command, record why in the guide and in `OPEN-QUESTIONS.md`.

### FL-049: Verification records and the stale and orphaned lists

| | |
|---|---|
| Status | Completed |
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
- [x] Contract suite cases pass against both stores, with a fixed clock: three current facts, one verified recently, one verified long ago and one never verified and recorded in between, are returned by `listStaleFacts` in the order "long ago, in between", and the recent one is not returned.
- [x] A contract case shows an ended fact and an invalidated fact are not returned by `listStaleFacts`.
- [x] A contract case shows `confidenceBelow` adds a recently verified fact whose confidence was adjusted below the threshold.
- [x] A contract case shows `listOrphanedFacts` returns a fact whose latest verification is `source_missing`, stops returning it after a later `confirmed`, and returns a fact whose only source was purged.
- [x] Contract cases cover the refusals of `recordVerification`: a missing fact is `not_found`, an invalidated fact is `already_invalidated`, an unknown outcome is `invalid_input`.
- [x] A contract case shows one audit entry per verification, with operation `verification`, and no change to any fact row.
- [x] A SQLite adapter test shows a direct `UPDATE` or `DELETE` on `fact_verification` is refused, and that the query plan of each list uses an index.

**Validation.** The contract suite against both stores. SQLite adapter tests for the triggers and the query plans. `pnpm check`.

**Completion evidence.** The commit and the passing check output.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in four commits:

1. `docs: design verification records and the stale and orphaned lists in INTERFACES.md`;
2. `feat(core): record verifications of facts in both stores`;
3. `feat(core): add listStaleFacts and listOrphanedFacts in both stores`;
4. `docs: describe fact_verification and the two lists in SCHEMA.md`.

Built:

- **The record.** `FactVerification` in `@factloom/core`: identifier, namespace, fact, outcome, method, `verifiedAt`. The change `record_verification`, under the operation `verification`, writes one row and one audit entry, action `fact.verified`, on the fact, with `detail` `{ verificationId }`. The reason code for a scheduled check is `verification_due`. The store refuses a missing fact with `not_found` and an invalidated one with `already_invalidated`; the change set's schema refuses an outcome outside the list with `invalid_input`.
- **The operations.** `recordVerification`, `listStaleFacts` and `listOrphanedFacts`. `listStaleFacts` refuses a `confidenceBelow` outside 0 to 1 and passes its clock's now to the store.
- **The store methods.** `MemoryStore.listStaleFacts` and `listOrphanedFacts`, in both stores. In SQLite each is one query, `STALE_FACTS_SQL` and `ORPHANED_FACTS_SQL` in `create-reads.ts`. The latest verification is the one with the latest time, and of two with one time the later recorded.
- **The migration.** `0007_add_fact_verification.sql`, sha256 `df970f2fc8655560f28500ee996e4080f356b97d6b4c5d3d9a065605667bd68c`. It holds the table, the index `fact_verification_by_fact`, and two triggers that refuse every update and delete. It carries the comment on Postgres. The purge inventory of FL-061 required its six columns to be classified, and they are listed as not content.

Contract cases, against both stores:

- **E1:** one audit entry on the fact, operation `verification`, action `fact.verified`, naming the verification; every fact row unchanged.
- **E2 to E5:** a missing fact is `not_found`, an invalidated fact is `already_invalidated` naming its successor, an unknown outcome is `invalid_input`, a repeated identifier is `already_exists`.
- **L1:** with a fixed clock, `pg16` verified long ago and `redis` never verified and recorded later come in that order, and `node22`, verified recently, is left out.
- **L2:** the ended fact `pg14-ended` and the invalidated facts are not returned.
- **L3:** `confidenceBelow` 0.5 adds `node22`, verified recently and adjusted to 0.3; at 0.3 it is not added, since the rule is "below".
- **L4:** a fact whose latest verification is `source_missing` is orphaned, is not after a later `confirmed`, and a fact whose only source was purged is orphaned.
- **L5:** of two verifications at one time, the later recorded is the latest.
- **L6 and L7:** both lists respect `limit` and refuse a limit below 1; the stale list is empty when nothing is due.
- **N9 and N10:** a verification of a fact of the other namespace is `not_found`, and neither list returns a fact of the other namespace.

The count of group 1 is 78, and of group 2 37 for the in-memory store and 39 for SQLite. The operations have 6 unit tests with the in-memory store.

The SQLite tests in `fact-verification-sqlite.test.ts` show a direct `UPDATE` and `DELETE` refused by the triggers, and the query plan of each list. The plan of the stale list, on the fixture:

```text
SEARCH f USING INDEX fact_subject_predicate (namespace=?)
CORRELATED SCALAR SUBQUERY 2
SEARCH v USING COVERING INDEX fact_verification_by_fact (fact_id=?)
CORRELATED SCALAR SUBQUERY 1
SEARCH c USING INDEX fact_confidence_by_fact (fact_id=?)
USE TEMP B-TREE FOR ORDER BY
```

SQLite lists the two subqueries twice, because the outer query reads both of their columns. The orphaned list's plan searches `fact_subject_predicate`, the primary key of `fact_source`, the primary key of `source`, and `fact_verification_by_fact`. Neither plan scans a table.

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| Either store records a verification of an invalidated fact | E3 |
| SQLite ignores `confidenceBelow` | L3 |
| SQLite lets the earlier of two verifications at one time win | L5 |
| SQLite's stale list leaves out the time predicate | L1, L2, L3, L6, L7, N10 |
| SQLite's orphaned list ignores whether a source is purged | L4 |
| The migration leaves out `fact_verification_by_fact` | both query plan tests |
| The in-memory store lets the earlier of two verifications at one time win | L5 |
| The in-memory store sorts the stale list the wrong way | L1, L2, L3, N10 |

`pnpm check`:

```text
 Test Files  95 passed (95)
      Tests  997 passed (997)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the fourth commit, which holds the code of the second and third: https://github.com/Johnmark-Tech/factloom/actions/runs/44001024893.

Differences from the item:

- **No new index on `fact`.** A partial index of live facts by namespace was added first and then removed: without statistics, the planner chose it for `listFacts` by subject as well, and the existing test of that query's index failed. Both lists start from the namespace prefix of `fact_subject_predicate`, so the migration adds only the index on `fact_verification`.
- **The store method takes `currentAt`.** The moment at which facts must be current is passed by `listStaleFacts`, from its clock, so that the store reads no clock.
- **The audit entry targets the fact**, not a verification row, so that a fact's history shows when it was checked. The outcome and the method stay in the row, as technical requirement 5 asks.

### FL-050: Deterministic verification: repository reader and path checks

| | |
|---|---|
| Status | Completed |
| Phase | 3 |
| Depends on | FL-018, FL-048, FL-049 |
| Requirements | REQ-21 (REQ-CA-09), REQ-24 |
| Components | `packages/maintenance` (repository interface, job), `apps/mcp-server` (git implementation, wiring), fixture repositories |

**Objective.** Check that the files that anchored code facts refer to still exist and whether they changed, using git and the file system only, and flag the facts whose file is gone, without any LLM call and without invalidating anything.

**Background.** This is the capability the [competitive analysis](../../research/evaluations/competitive-analysis.md) found in no system it ran or read (advantage A5, requirement REQ-CA-09), with the qualification stated there: the findings are "no such code found", not exhaustive searches, and hosted services were not examined. The checks come from the verification ladder in the [software development research](../../research/industries/software-development.md), section E, and each git command behind them was run in section 4 of that document. An **anchor** is a source's `locator` and `version`: a path and a commit.

The owner's requirement for the software development domain is that self-healing "checks that referenced files and functions still exist". This item covers the files: a file is checked by its path. The original item was split twice: the check of a function or symbol by a word search for its name is FL-071, and the check of a value in a manifest, with the succession that follows from it, is FL-062.

The repository interface is declared in `@factloom/maintenance`, its only consumer, and implemented in the application, which may import `maintenance` (FL-040). It is not in `@factloom/core`: commits, paths and `HEAD` belong to the software development domain, and REQ-31 keeps the core generic.

**Outcome.** A maintenance run confirms the anchored facts whose file is unchanged. A fact whose file was deleted is flagged for a person and stays live. No API key is needed for any of it.

**Scope.**
- An interface in `@factloom/maintenance` for reading a repository (proposed: `RepositoryReader`), with a git implementation in the application and a fake for tests.
- The verification job, registered in the maintenance run.
- Three rungs of the ladder: the anchor's commit is on the current branch; the path exists; the file is unchanged since the anchor.
- Fixture repositories built by the tests, and a helper that builds them, which FL-071, FL-062 and FL-054 reuse.

**Non-goals.**
- The check of a named function or symbol, and the domain's entity type for one: FL-071.
- A structured value check, and ending or superseding a fact. FL-062. In this item no fact is changed.
- An LLM rung. FL-051.
- Finding where a missing file went. FL-054.
- An interface for repositories in `@factloom/core`.
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
   | 3 | The file's content at `HEAD` is the same as at the anchor's commit | If the same: outcome `confirmed`. If it differs: `inconclusive` |

   FL-071 adds a rung between 2 and 3 for facts about a named function or symbol, and FL-062 a rung after 3 for values a domain can read from a file.
3. Every outcome is recorded with `recordVerification` and method `deterministic`.
4. No rung of this item changes a fact. A fact with outcome `source_missing` is counted as flagged, whatever the domain's correction policy.
5. A flagged fact is reported by the run, with its identifier and the outcome. A fact with outcome `source_missing` also appears in `listOrphanedFacts`.
6. If the repository cannot be read, for example the directory is not a git repository, the job fails as a whole, changes nothing, and the run reports the failure.

**Technical requirements.**
1. `maintenance` holds the ladder and names no entity type, no predicate, no file name and no git command. The rungs that FL-071 and FL-062 add are supplied by the composition root from the software development **domain** (FL-018), so the job takes a list of rungs, each marked to run before rung 3 or after it for a file that changed, and knows nothing about what each checks. In this item the list is empty.
2. The repository interface is declared in `@factloom/maintenance` and exported from its entry. It offers only what the rungs need: whether a commit is an ancestor of `HEAD`, whether a path exists at a commit, the content identifier of a path at a commit, the text of a path at a commit, and the `HEAD` commit. The text is read by the rungs of FL-071 and FL-062. The implementation lives in `apps/mcp-server`, and `@factloom/core` gains nothing.
3. The git implementation runs git as a child process with arguments passed as a list, never through a shell, and uses the commands recorded as run in the research (checks 4.1, 4.6 and 4.7), re-checked against the git documentation with the page cited.
4. The repository's location is configuration read by the composition root (proposed: `FACTLOOM_REPO`, default the working directory). It is added to the configuration table in `MCP-TOOLS.md`.
5. Fixture repositories are created by the test in a temporary directory, with fixed author and committer dates. No fixture repository is committed inside this repository.
6. The dependencies given to the job in every test of this item include an LLM client that fails if called.
7. The verification interval, the age after which a fact is stale, is one named constant.

**Constraints.**
- [`TESTING.md`](../../architecture/TESTING.md): "A test that must make no LLM call passes a client that fails on any call."
- [`INTERFACES.md`](../../architecture/INTERFACES.md): verification is recorded, then acted on in a separate call.
- The [software development research](../../research/industries/software-development.md), "Conflicts with settled decisions": a changed file or a fact from another branch is not a reason to invalidate.
- `.claude/rules/architecture.md`: an interface is added because there are two implementations, git and the test fake.

**Acceptance criteria.**
- [x] Fixture "file deleted": a fact anchored to a file that a later commit deletes. After one run with an LLM client that fails if called: the fact is live and current, its latest verification is `source_missing`, `listOrphanedFacts` returns it, the run's report counts it as flagged, and no fact row was invalidated.
- [x] Fixture "nothing changed": the fact is recorded as `confirmed`, and a second run made with the clock inside the verification interval examines no anchored fact.
- [x] Fixture "other branch": a fact anchored at a commit that is not an ancestor of `HEAD` gets no verification row and no change.
- [x] Fixture "file changed": a fact anchored to a file that a later commit edits. The outcome is `inconclusive` and the fact is unchanged.
- [x] A test runs the job in a directory that is not a git repository and shows the job reported as failed and the store unchanged.
- [x] Every audit entry written by these runs has trigger `maintenance`, and after every fixture run the number of fact rows and the `invalidatedAt` of every fact are as before.
- [x] Unit tests of the ladder with the fake repository reader cover each row of the rung table, and one test shows that a rung passed to the job runs at the place it names: before rung 3, or after it for a file that changed.
- [x] `git grep -n "RepositoryReader\|HEAD" -- packages/core/src` finds nothing.

**Validation.** Unit tests of the ladder with a fake reader and the in-memory store. Tests of the git implementation and of the whole run against fixture repositories with the SQLite adapter, on both CI platforms from FL-002. `pnpm check`.

**Completion evidence.** The commit; the passing check output on Linux and macOS arm64; the list of git commands used, each with its documentation citation.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4 and git 2.43.0, in seven commits:

1. `docs: add listVerifications to the MemoryStore of INTERFACES.md`;
2. `feat(core): add listVerifications in both stores`;
3. `feat(maintenance): add the verification job, its ladder and the repository reader it reads`;
4. `feat(mcp-server): add the git repository reader and fixture repositories for tests`;
5. `feat(mcp-server): run the verification job in maintenance, against FACTLOOM_REPO`;
6. `docs: add FACTLOOM_REPO to the configuration in MCP-TOOLS.md`;
7. `docs(mcp-server): describe the verification job of the maintenance command`.

The item was started while FL-048, on which it depends, was `Under Review`. FL-048's code is complete: only the owner's run of the two session start hooks remains, and this item changes neither hook.

Built:

- **The interface.** `RepositoryReader`, declared in `@factloom/maintenance` and exported from its entry, has five methods: `readHead`, `isAncestorOfHead`, `pathExists`, `readContentId` and `readText`.
- **The job.** `verifyAnchoredFacts`:
  - takes the stale facts from `listStaleFacts`, not verified for `VERIFICATION_INTERVAL_MS`, seven days;
  - uses as the anchor of each the most recently observed source of kind `file` with a locator and a version;
  - climbs the ladder: commit on the branch, path at `HEAD`, the domain's rungs placed `before_content_check`, the content identifier compared with the anchor's, then the rungs placed `after_content_changed`;
  - records each outcome with `recordVerification`, method `deterministic`, trigger `maintenance` and reason `verification_due`.

  It names no entity type, predicate, file name or git command.
- **The report.** The job reports each flagged fact with its identifier and the reason `source_missing`. A job's report now carries `flaggedItems`.
- **`listVerifications`**, added to `MemoryStore` in both stores, with contract case E6. It reads the outcomes back. The item listed two read methods; the tests had no other way to see which outcome was recorded.
- **The git reader.** `createGitRepositoryReader` in `apps/mcp-server` runs git with `execFile` and its arguments as a list, never through a shell, at commits and never on the working tree. A directory that is not a repository fails `readHead` with `invalid_input`, before anything is read or recorded.
- **The wiring.** The job is registered as `verify_anchored_facts` in `buildMaintenanceJobs` with no domain rungs. `FACTLOOM_REPO`, which defaults to the working directory, is read by `readConfiguration` and added to `MCP-TOOLS.md`.
- **The fixture helper.** `testing/fixture-repository.ts` builds repositories in a temporary directory, with fixed author and committer dates and with global and system git configuration turned off. FL-071, FL-062 and FL-054 will reuse it.

The git commands, each re-read on 2026-11-17 on https://git-scm.com/docs:

| Method | Command | Documentation |
|---|---|---|
| `readHead` | `git rev-parse --verify HEAD^{commit}` | git-rev-parse: `--verify` emits one object name "otherwise, error out"; gitrevisions: `<rev>^{commit}` "describes the corresponding commit object" |
| `isAncestorOfHead` | `git cat-file -e <commit>^{commit}`, then `git merge-base --is-ancestor <commit> HEAD` | git-cat-file: "Exit with zero status if `<object>` exists and is a valid object"; git-merge-base: exit 0 if an ancestor, 1 if not, "Errors are signaled by a non-zero status that is not 1" (research check 4.7) |
| `pathExists` | `git cat-file -e <commit>:<path>` | git-cat-file, as above; gitrevisions: `<rev>:<path>` "names the blob or tree at the given path" (research check 4.1) |
| `readContentId` | `git rev-parse --verify --quiet <commit>:<path>` | git-rev-parse `--verify`, with `-q` to exit non-zero without a message (research check 4.6) |
| `readText` | `git cat-file blob <commit>:<path>` | git-cat-file: with a type, "the raw (though uncompressed) contents of the `<object>` will be returned" |

The documentation gives no exit status for a missing object under `cat-file -e`, only "non-zero". So the reader treats any non-zero status there as "absent", once `readHead` has shown that the repository can be read.

Tests:

- **The ladder, with a fake reader and the in-memory store.** Ten unit tests: `confirmed`, `inconclusive`, `source_missing` with the flag, a commit on another branch, a fact with no anchor, a rung placed before the content check deciding and the after-rung not running, a rung placed after it running only for a changed file, no rung for a missing file, a repository that cannot be read, and a second run inside the interval.
- **The git reader, against a fixture repository.** Four tests: `HEAD`; ancestor, other branch and unknown commit; path, content identifier and text; not a repository.
- **The whole run, with the SQLite adapter, through `buildMaintenanceJobs` and `runMaintenance`.** The five fixtures of the acceptance criteria, "file deleted", "nothing changed", "other branch", "file changed" and "not a git repository". After each run the fact rows and their `invalidatedAt` are as before, and every verification's audit entry has trigger `maintenance`.
- **The command, as a child process.** It runs the job on a fixture repository and exits 0, and it exits 1 with the job failed when `FACTLOOM_REPO` is not a repository.
- **No LLM call.** Every run receives the dependencies of `createTestDeps`, whose LLM client fails if called.

`git grep -n "RepositoryReader\|HEAD" -- packages/core/src` found nothing (exit 1).

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| The ladder skips the branch check | the other-branch unit test |
| A changed file counts as unchanged | the file-changed unit test and the after-rung unit test |
| Rungs placed before the content check run after it | the before-rung and after-rung unit tests |
| The git reader reads the content identifier at `HEAD`, not at the anchor | the reader's content test and the "file changed" fixture |
| The git reader counts an unknown commit as an ancestor | the reader's ancestor test |

One break failed no test, and is not a fault: moving the read of `HEAD` into the loop still reads it before the first verification is recorded.

`pnpm check`:

```text
 Test Files  98 passed (98)
      Tests  1020 passed (1020)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the fifth commit, with the git tests on both: https://github.com/Johnmark-Tech/factloom/actions/runs/44003830461.

Differences from the item:

- **`listVerifications` was added to `MemoryStore`**, a third read method.
- **An unreadable repository is `invalid_input`.** No error code names one, and the item does not ask for a new code, so the job's failure uses `invalid_input`. Its message names the directory and git's own error.
- **`flaggedItems` was added to every job's report** to meet functional requirement 5.

### FL-071: Deterministic verification: function check by text search

| | |
|---|---|
| Status | Completed |
| Phase | 3 |
| Depends on | FL-050, FL-018 |
| Requirements | REQ-21 (REQ-CA-09), REQ-24 |
| Components | `packages/maintenance` (word search), `@factloom/graph-rag` (the domain's entity type, predicate and name check), `apps/mcp-server` (wiring), fixture repositories |

**Objective.** Check that a function or symbol that an anchored code fact names is still named in its anchored file, by a word search with no LLM call, and flag the fact for review when it is not.

**Background.** This item is the second part of FL-050, which built the repository reader, the verification job and the rungs for a path and a changed file. The owner's requirement for the software development domain is that self-healing "checks that referenced files and functions still exist". FL-050 covers files; this item covers functions. The [software development research](../../research/industries/software-development.md), section 4, ran the word match of check 4.4 with a search tool over a directory; here the match is made in code on the text of the one anchored file, so no further tool is needed. The domain of FL-018 has four entity types and none is a function or symbol, so this item adds one.

**Outcome.** A fact about a function whose name no longer appears in its anchored file is flagged for a person and stays live. A fact about a function that is still named passes on to the file-unchanged rung. No API key is needed.

**Scope.**
- A rung in the job of FL-050, run before the file-unchanged rung, for facts about a named function or symbol.
- The word search, a pure function in `maintenance`.
- An entity type for a function or symbol in the software development domain (proposed: `symbol`), and one multi-valued predicate that a fact about a symbol can use (proposed: `described_as`, with a value as its object).
- The name check that the composition root supplies from the domain.

**Non-goals.**
- Parsing the file with tree-sitter, the TypeScript compiler or a language server. A word search needs no dependency and works for every language, and that is enough to answer "is this name still in this file". It cannot tell a definition from a mention and it does not follow a rename. Parsing is considered only if text search proves too weak, and is listed under "Open decisions" of this epic.
- Searching the whole repository for a name that left its file. The fact is flagged, and a person or an agent decides.
- Changing a fact. In this item no fact is changed.
- Extracting facts about symbols from text. The entity type is in the domain, so `remember` and `record_fact` can use it; its extraction quality is not measured here.

**Functional requirements.**
1. The rung runs for a fact that passed rung 2 of FL-050, before the file-unchanged rung.
2. A fact is about a named function or symbol when its subject or its object is an entity of the domain's type for one. The name searched for is the entity's name. A fact that is not about a function or symbol passes the rung unchecked.
3. The name is searched for as a whole word, with the case kept, in the file's text at `HEAD`. `parseDate` is not found in `parseDateInput`.
4. If the name is found, the fact goes on to the next rung. If it is not found, the outcome `contradicted` is recorded with `recordVerification` and method `deterministic`, the fact is flagged for review and stays live, and no later rung runs for it.
5. A name that is found in a comment or a string still counts as found. This is the stated limit of a word search.
6. A flagged fact is counted as flagged whatever the domain's correction policy.

**Technical requirements.**
1. `maintenance` names no entity type and no predicate. The name check is supplied by the composition root from the software development **domain**: a function that, given a fact with its entities, returns the names that must appear in its anchored file, or none. The word search is a pure function in `maintenance`, with its own unit tests.
2. The domain gains the entity type and the predicate in the same commit as the name check, and the tests of FL-018 that assert the exact lists are changed with it.
3. The rung reads the file's text through the repository reader of FL-050 and adds no method to it.
4. Fixture repositories are built with the helper of FL-050, with fixed author and committer dates.
5. The dependencies given to the job in every test of this item include an LLM client that fails if called.

**Constraints.**
- [`TESTING.md`](../../architecture/TESTING.md): "A test that must make no LLM call passes a client that fails on any call."
- [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md): a specific predicate.
- REQ-31: the core is generic; the name check comes from the domain.

**Acceptance criteria.**
- [x] Fixture "function removed": a fact whose subject is a symbol named `parseDate`, anchored to a file that defines it; a later commit removes the function and leaves the file. After one run with an LLM client that fails if called: the latest verification is `contradicted` and `deterministic`, the fact is live and current, the report counts it as flagged, and no fact row was invalidated.
- [x] Fixture "function still there": the same fact after a commit that edits another part of the file. The name is found, and the outcome is `inconclusive` because the file changed.
- [x] Fixture "longer name only": the file no longer holds `parseDate` and holds `parseDateInput`. The outcome is `contradicted`: the search is for the whole word.
- [x] Fixture "not about a symbol": a fact about a repository anchored to a file that a later commit edits. The rung does not decide it, and the outcome is `inconclusive` as in FL-050.
- [x] Unit tests of the word search pass with these names: "finds a name as a whole word", "does not find a name inside a longer name", "keeps the case of the name", "finds a name next to punctuation".
- [x] A test named "the software development domain has a type for a function or symbol" passes, and the tests of FL-018 that assert the exact lists pass with the added names.
- [x] Every audit entry written by these runs has trigger `maintenance`.
- [x] `pnpm check` exits 0.

**Validation.** Unit tests of the word search and of the rung with a fake reader and the in-memory store. Tests of the whole run against fixture repositories with the git implementation and the SQLite adapter, on both CI platforms from FL-002. `pnpm check`.

**Completion evidence.** The commit; the passing check output on Linux and macOS arm64. Any fact the fixtures show flagged wrongly is noted under "Open decisions" of this epic.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in four commits:

1. `feat(maintenance): add the word search and the name check rung, and flag a contradicted fact`;
2. `feat(graph-rag): add the symbol type, described_as and the name check to the domain`;
3. `feat(mcp-server): run the name check in the verification job`;
4. `docs(mcp-server): describe the name check of the verification job`.

Built:

- **The word search.** `containsWholeWord` in `@factloom/maintenance` is a pure function: a match counts only where the characters before and after it are not letters, digits, `_` or `$`, and the case is kept.
- **The rung.** `createNameCheckRung(namesToFind)` is placed `before_content_check`. It reads the file at `HEAD` through the repository reader, which gains no method, and decides `contradicted` when a name is missing. Otherwise the fact goes on to the file-unchanged rung. A fact that names no symbol is not read.
- **Flagging.** The verification job now flags a `contradicted` fact as well as a `source_missing` one, with the outcome as the reason, whatever the policy. `maintenance` names no entity type and no predicate.
- **The domain.** The software development domain gains the entity type `symbol`, the multi-valued predicate `described_as` with a value as its object, an extraction instruction for a symbol, and `findSymbolNames`: the names of a fact's entities of type `symbol`. All are in one commit, with the tests of FL-018 that assert the exact lists. The composition root passes `findSymbolNames` to the rung.
- **The recordings.** The domain's types and predicates are part of the extraction prompt and of its output schema, so every extraction recording of FL-069 got a new key. With the owner's approval, in this session, the owner's key was set for the one command `pnpm run record:extraction` and nowhere else:
  - the cases were recorded again with `claude-haiku-5-5`: 20 of 20 pass, 25 facts expected, 24 extracted, 24 matched, 0 forbidden, precision 1.000, recall 0.960;
  - the 20 recordings named by the old keys were removed;
  - the new files were scanned for key, token and password patterns and none matched.

Tests:

- **The word search:** the four named tests, "finds a name as a whole word", "does not find a name inside a longer name", "keeps the case of the name" and "finds a name next to punctuation".
- **The rung, with a fake reader:** a missing name, a longer name only, every name found, and a fact that names no symbol, for which nothing is read.
- **The domain:** "the software development domain has a type for a function or symbol", and the exact lists, now five types and seven predicates.
- **The fixtures, with the git reader and the SQLite adapter, in `name-check-run.test.ts`:**
  - "function removed": `contradicted` and `deterministic`, flagged with reason `contradicted`, fact rows unchanged, the audit entry's trigger `maintenance`;
  - "function still there": `inconclusive`;
  - "longer name only": `contradicted`;
  - "not about a symbol": `inconclusive`.

  Every run passes the dependencies of `createTestDeps`, whose LLM client fails if called. No fixture flagged a fact wrongly, so nothing is added under "Open decisions".

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| The search matches inside a longer name | "longer name only", the rung's longer-name test, "does not find a name inside a longer name" |
| The search ignores case | "keeps the case of the name" |
| The composition root passes no rung | "function removed", "longer name only" |

`pnpm check`:

```text
      Tests  1087 passed (1087)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the third commit, which holds all of the code and the recordings: https://github.com/Johnmark-Tech/factloom/actions/runs/44013087474.

Differences from the item:

- **A contradicted fact is flagged with the reason `contradicted`**, in the same `flaggedItems` list as a missing file.
- **The name check is `findSymbolNames`**, exported by `@factloom/graph-rag` beside the domain. The domain type of `@factloom/core` gains no field.

### FL-062: Deterministic verification: manifest version check and succession

| | |
|---|---|
| Status | Completed |
| Phase | 3 |
| Depends on | FL-050, FL-018 |
| Requirements | REQ-21 (REQ-CA-09), REQ-24 |
| Components | `packages/maintenance` (repository interface, job), `@factloom/graph-rag` (the domain's predicate and structured check), `apps/mcp-server` (git implementation, wiring), fixture repositories |

**Objective.** Add a structured value check to the verification job: when a dependency's version in a manifest no longer matches a stored fact, end the fact and record the new version as its successor, with the manifest as the source and no LLM call.

**Background.** FL-050 built the repository reader and the rungs that check a path and whether a file changed, and FL-071 the rung that checks a name. A changed file gives `inconclusive` there. Rung 4 of the verification ladder in the [software development research](../../research/industries/software-development.md), section E, goes further for values that can be read from a file by a rule: the value at the anchor's commit is compared with the value at `HEAD`. This is the capability the [competitive analysis](../../research/evaluations/competitive-analysis.md) found in no system it ran or read (advantage A5, requirement REQ-CA-09). [`INTERFACES.md`](../../architecture/INTERFACES.md), "Phase 3", says a verification is recorded and what follows is a separate call, so the audit log shows both the finding and the action. The software development domain of FL-018 has six predicates and none holds a dependency's version, so this item adds one.

**Outcome.** After a dependency is upgraded in a commit, the next maintenance run ends the fact about the old version at the time of that commit and records the new one, with the manifest as its source. No API key is needed.

**Scope.**
- One more rung in the job of FL-050, used when the file changed: a structured check supplied by the domain.
- A predicate for a dependency's version in the software development domain (proposed: `pins_version`, single-valued, with a value as its object), and the structured check for it.
- One addition to the repository interface of FL-050, in `@factloom/maintenance`: the commits that touched a path between two commits, with their committer times.
- The succession that follows a contradicted value, under the domain's correction policy.
- A fixture repository in which a version changes.

**Non-goals.**
- Lockfiles, script entries, decision record status, and manifests of other ecosystems. Each is a further structured check, added when a scenario needs it.
- Reading the working tree. Checks read the repository at `HEAD`, so uncommitted edits are not judged.
- Proposing a change under `human_approval`. The fact is flagged.
- Changing a fact that FL-050 flagged for a missing file or FL-071 for a missing name.
- An LLM rung: FL-051.
- Extracting version facts from text. The predicate is in the domain, so `remember` and `record_fact` can use it; its extraction quality is not measured here.

**Functional requirements.**
1. The rung runs for a fact that passed the rungs of FL-050 and FL-071 and whose file differs between the anchor's commit and `HEAD`. It is passed to the job as a rung that runs after the file-unchanged rung.
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
- [x] Fixture "manifest version changes": a repository whose `package.json` pins a dependency at one version, a stored fact about that version anchored at that commit, then a commit that changes the version. After one maintenance run with an LLM client that fails if called: the old fact is ended with `validTo` equal to the second commit's committer time; a current fact holds the new version; its source has kind `file`, the manifest path and the second commit; the verification row says `contradicted` and `deterministic`.
- [x] The same fixture, read afterwards: asking as of a date between the two commits returns the old version; asking with a known-at date before the run returns the old version as current; fact history shows a succession.
- [x] Fixture "manifest changed, version the same": another line of the manifest changes. The outcome is `confirmed` and the fact is unchanged.
- [x] Fixture "dependency removed": the outcome is `contradicted`, the fact is live, and the report counts it as flagged.
- [x] Fixture "file changed, no structured check": the outcome is `inconclusive` and the fact is unchanged.
- [x] A test with a domain whose policy is `human_approval` runs the first fixture and shows the verification row `contradicted`, the fact unchanged, and the fact counted as flagged.
- [x] A second run over the first fixture changes nothing: the successor is anchored at `HEAD` and is confirmed or not yet due.
- [x] Every audit entry written by these runs has trigger `maintenance`.
- [x] Unit tests of the structured check pass with these names: "reads a version from dependencies", "reads a version from devDependencies", "returns no value for a dependency that is not listed", "returns no value for a manifest that does not parse".
- [x] A test named "the software development domain has a single-valued predicate for a dependency's version" passes.

**Validation.** Unit tests of the rung and of the structured check with a fake reader and the in-memory store. Tests of the whole run against fixture repositories with the git implementation and the SQLite adapter, on both CI platforms from FL-002. `pnpm check`.

**Completion evidence.** The commit; the passing check output on Linux and macOS arm64; the git command used for the added method, with its documentation citation.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4 and git 2.43.0, in six commits:

1. `docs: settle in INTERFACES.md how a value found changed in its source ends a fact`;
2. `feat(core): add the reason code source_changed`;
3. `feat(maintenance): add the structured value rung, and end a fact whose value changed in its source`;
4. `feat(graph-rag): add pins_version and the package.json version check to the domain`;
5. `feat(mcp-server): run the version check in the verification job`;
6. `docs(mcp-server): describe the version check of the verification job`.

Built:

- **Rung decisions.** A rung now returns a decision: the outcome, and for a value that changed, a successor with the new value, its statement and when it changed. The name check of FL-071 returns its decision with no successor.
- **`createStructuredValueRung(checks)`**, placed `after_content_changed`, looks up the domain's check by the fact's predicate.
  - It reads the value at the anchor's commit and at `HEAD`. The same value is `confirmed`; a different one, or none at `HEAD`, is `contradicted`; a predicate with no check, or a file that cannot be read, decides nothing, so the outcome stays `inconclusive`.
  - For a new value, it walks the commits that touched the file after the anchor and dates the change by the committer time of the first commit whose value differs.

  `maintenance` names no predicate, file name or git command.
- **The job.**
  - It records the verification first.
  - Then, for a `contradicted` fact with a successor under `automatic`, it calls `endFact` with trigger `maintenance` and reason `source_changed`. The successor holds the new value, and the source is the file at `HEAD`: kind `file`, the path, the `HEAD` commit.
  - A `conflict` or `already_invalidated` from `endFact` counts as examined.
  - Any other `contradicted` fact is flagged.
  - The job's dependencies are now the full `OperationDeps`, since `endFact` needs the domain and the embedder.
- **The repository reader** gains `listCommitsTouching(path, fromCommit)`. Its git implementation runs `git log --reverse --format=%H %cI <from>..HEAD -- <path>`, after check 4.3 of the research, which lists commits with their committer times. Re-read on 2026-11-17:
  - https://git-scm.com/docs/gitrevisions: `<rev1>..<rev2>` "Include commits that are reachable from `<rev2>` but exclude those that are reachable from `<rev1>`";
  - https://git-scm.com/docs/git-log: `-- <path>` shows "only commits that are enough to explain how the files that match the specified paths came to be"; `--reverse` outputs the chosen commits in reverse order; `%cI` is the committer date in strict ISO 8601.

  The last two were read only as a summary of the page, and the reader's test confirms them by running the command.
- **The domain.** The software development domain gains the single-valued predicate `pins_version`, with a value as its object, and its check: `readDependencyVersion` parses a `package.json` and reads `dependencies`, then `devDependencies`; `describeDependencyVersion` words the successor. All are in one commit, with the FL-018 tests of the exact lists, now eight predicates. The composition root keys the check by `pins_version`.
- **The recordings.** As for FL-071, the predicate is part of the extraction prompt, so the extraction cases were recorded again with the owner's key, set for that one command: `claude-haiku-5-5`, 20 of 20 pass, precision 1.000, recall 0.960. The 20 old recordings were removed, and the new ones scanned for key, token and password patterns, with no match.
- **The fixture helper** now takes a date for each commit, so that `validTo` can be asserted exactly.

Tests:

- **The structured check:** the four named tests, "reads a version from dependencies", "reads a version from devDependencies", "returns no value for a dependency that is not listed" and "returns no value for a manifest that does not parse".
- **The domain:** "the software development domain has a single-valued predicate for a dependency's version".
- **The rung, with a fake reader:**
  - confirmed after an unrelated change;
  - contradicted with the new value, dated by the first differing commit among three;
  - contradicted with no successor for a removed value;
  - nothing for a predicate with no check;
  - nothing for an unreadable file.
- **The git reader:** `listCommitsTouching` lists only the later commit that touched the path, with its committer time.
- **The fixtures, with the git reader and the SQLite adapter, in `version-check-run.test.ts`:**
  - "manifest version changes": the job reports one change. The verification is `contradicted` and `deterministic`. The current fact holds 5.1.0, with the source `file`, `package.json` and the second commit. The audit entries of the old fact are `verification` then `succession`, both with trigger `maintenance`, the succession with reason `source_changed`.
  - **Read afterwards:** as of 2026-02-01, between the commits, the old version is returned, ended at the second commit's committer time, 2026-02-14T10:30:00.000Z. Known at 2026-02-20, before the run, the old version is current.
  - "manifest changed, version the same": `confirmed`, fact rows unchanged.
  - "dependency removed": `contradicted`, flagged, fact rows unchanged.
  - "file changed, no structured check": `inconclusive`, fact rows unchanged.
  - **`human_approval`:** `contradicted`, no change, flagged.
  - **A second run:** no change and no flag.

  Every run receives the dependencies of `createTestDeps`, whose LLM client fails if called.

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| The change is dated by the last commit, not the first | the rung's dating test |
| The job ignores `human_approval` | the human-approval fixture |
| A different value counts as the same | the rung's dating test, the version-change, read-afterwards and human-approval fixtures |

`pnpm check`:

```text
      Tests  1105 passed (1105)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the fifth commit, which holds all of the code and the recordings: https://github.com/Johnmark-Tech/factloom/actions/runs/44014042711.

Differences from the item:

- **The repository method** is `listCommitsTouching`, which lists the commits; the rung reads each one's value to find the first that differs. The research's check 4.5 searches by text, which a version string does not fit.
- **A rung's result is a decision**, with an optional successor, so that the job can make the change after recording the verification.

### FL-051: LLM verification as the last rung

| | |
|---|---|
| Status | Completed |
| Phase | 3 |
| Depends on | FL-062, FL-028, FL-022 |
| Requirements | REQ-21, REQ-24 |
| Components | `packages/maintenance` (rung), `@factloom/graph-rag` (one export), `apps/mcp-server` (wiring, evals) |

**Objective.** For a fact the deterministic rungs could not decide, ask an LLM whether the file as it is now still supports the fact, record the answer, and lower the fact's confidence when it does not.

**Background.** Rung 7 of the verification ladder in the [software development research](../../research/industries/software-development.md): the LLM re-reads the changed text against the fact and answers supported, contradicted or unclear. The glossary puts the LLM last. Nobody has published how accurate this step is, so its rates are measured and reported, and its consequence is kept mild: [`INTERFACES.md`](../../architecture/INTERFACES.md) says confidence changes "on feedback or on a failed verification", and what follows from a `contradicted` outcome may be a lower confidence.

**Outcome.** A fact about a file that has changed is no longer left undecided forever. If the LLM finds the file no longer supports it, the fact's confidence falls, which brings it back into `listStaleFacts` and makes its weakness visible to an agent that recalls it.

**Scope.**
- One more rung in the verification job, after the deterministic rungs of FL-050, FL-071 and FL-062, used only for facts whose deterministic outcome is `inconclusive`.
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
- [x] A unit test shows the rung is not reached for a fact whose deterministic outcome is `confirmed`, `contradicted` or `source_missing`: it passes with an LLM client that fails if called.
- [x] A unit test with a scripted LLM shows each of the three answers recorded with method `llm` and the matching outcome.
- [x] A unit test shows `contradicted` lowers the confidence by the step, leaves the fact live, and writes audit entries with trigger `maintenance`.
- [x] A unit test shows a failed call records `inconclusive` and changes no confidence.
- [x] Unit tests show an oversized file and a file containing a secret pattern are not sent: each passes with an LLM client that fails if called.
- [x] A unit test shows that with no LLM client configured the run completes and reports the facts left `inconclusive`.
- [x] A unit test shows the call limit: with the limit set to 2 and five undecided facts, two calls are made.
- [x] By hand, once, by the owner in the session: with `ANTHROPIC_API_KEY` set in the environment and nowhere else, the owner runs the verification eval in record mode from `apps/mcp-server` (`pnpm run record:verification`, which wraps the Anthropic client with the wrapper of FL-028 in record mode), reads the diff of the new recordings for secrets, and records the model identifier. A replayed run fails while a recording is missing, so the code and the recordings are committed together after this step, and the item is not `Completed` before it.
- [x] The verification eval runs inside `pnpm check` in replay, fails on a missing recording, and prints the table and the rate. The rate is recorded; this item sets no target for it.

**Validation.** Unit tests with scripted and failing LLM clients, the fake repository reader and the in-memory store. The eval in replay. One live run by hand: the owner runs the eval with recording on and records the model identifier and the rate.

**Completion evidence.** The commit; the eval table and rate; the model identifier the recordings were made with; the three constants' values.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in nine commits:

1. `docs: settle in INTERFACES.md that an LLM verdict only lowers confidence`;
2. `feat(core): add the reason code verification_failed`;
3. `feat(maintenance): add the LLM verification rung, which lowers the confidence of a contradicted fact`;
4. `test(maintenance): build the fake key of the secret test at run time, so the repository scan passes`;
5. `feat(graph-rag): export the secret check, for the LLM verification rung`;
6. `docs: list the domain checks and the secret check among the exports of graph-rag`;
7. `feat(mcp-server): run the LLM verification rung last in the verification job when a key is set`;
8. `test(mcp-server): add the verification cases and their eval, recorded with the owner's key`;
9. `docs(mcp-server): describe the LLM step of the verification job`.

Commit 3 alone does not pass `pnpm check`. Its new test held a literal AWS-style key, which the repository-wide secret scan of FL-022 refuses once the file is tracked. The check run before that commit passed only because the file was not yet tracked. Commit 4 fixes it, and every later commit passes. History was not rewritten.

Built:

- **The rung.** `createLlmVerificationRung({ llm, containsSecret, maxCalls })`, placed `after_content_changed`, is the last rung the composition root passes. It is reached only for a file that changed and that no deterministic rung decided.
  - It reads the file at `HEAD` and calls `generateObject` with task `verification`, the stable `VERIFICATION_INSTRUCTIONS` and the fact's statement, path and file text in `input`.
  - It maps `supported`, `contradicted` and `unclear` to `confirmed`, `contradicted` and `inconclusive`, with method `llm`.
  - It is made anew for each run, because it counts its calls.
- **The three constants:**
  - `MAX_VERIFIED_TEXT_LENGTH` = 50,000 characters;
  - `CONFIDENCE_STEP` = 0.2;
  - `MAX_LLM_CALLS_PER_RUN` = 20.
- **The guards:**
  - a file over the limit, or one the secret check matches, is not sent and stays `inconclusive`;
  - a failed call, or an answer outside the schema, is `inconclusive` with method `llm` and counted as failed;
  - with no LLM client the fact is recorded `inconclusive` and counted as undecided;
  - beyond the call limit the fact is not recorded at all, so it stays stale for the next run, and is counted as undecided.
- **Decisions.** A rung's decision now carries the method and a note (`failed`, `undecided`, `deferred`). Every job's report has a new count, `undecided`.
- **The job.** On `contradicted` with method `llm`, it calls `adjustConfidence` to lower the confidence by the step, to no less than 0, with trigger `maintenance` and the new reason code `verification_failed`, and flags the fact. It never ends or invalidates a fact on an LLM verdict.
- **The secret check.** `checkForSecrets` is now exported by `@factloom/graph-rag`, recorded in `SYSTEM-BOUNDARIES.md`, and passed to the rung by the composition root.
- **The model.** The maintenance command gives the rung the Anthropic client only when `ANTHROPIC_API_KEY` is set. The model comes from the task map, `verification`: `claude-haiku-5-5`. No model name is in `maintenance`.

Unit tests, with scripted and failing LLM clients, a fake reader and the in-memory store:

- **Not reached:** for `confirmed`, `source_missing`, and a fact the name check contradicts.
- **The answers:** each of the three, with method `llm`.
- **`contradicted`:** confidence 0.9 becomes 0.7, the fact stays live and flagged, and the audit entries `fact.verified` and `fact.confidence_adjusted` have trigger `maintenance`.
- **A failed call:** `inconclusive`, counted as failed, confidence unchanged.
- **Not sent:** an oversized file and a file with a secret pattern.
- **No client:** the run completes with one undecided fact.
- **The call limit:** with a limit of 2 and five undecided facts, two verifications are recorded and three are undecided.

**The eval.** Twelve cases in `apps/mcp-server/evals/verification-cases/`, four for each answer, written and reviewed by hand. `run-verification-eval.ts` runs them through the rung. `verification-replay.test.ts` replays them inside `pnpm check`; with one recording removed, it failed with `No recording for the key …` and named the record command. The recordings were made in this session with the owner's key, set in the environment for the one command `pnpm run record:verification` and nowhere else, model `claude-haiku-5-5`, 12 calls. They were scanned for key, token and password patterns, with no match. The table:

```text
MATCH  expected contradicted, given contradicted  Contradicted: the deployment moved to Render
MATCH  expected contradicted, given contradicted  Contradicted: the local PostgreSQL port moved
MATCH  expected contradicted, given contradicted  Contradicted: a function described as removed
MATCH  expected contradicted, given contradicted  Contradicted: the tests moved to Jest
MATCH  expected supported, given supported  Supported: conventional commits
MATCH  expected supported, given supported  Supported: the deployment target in a README
MATCH  expected supported, given supported  Supported: the local PostgreSQL port
MATCH  expected supported, given supported  Supported: the test framework
MATCH  expected unclear, given unclear  Unclear: the test runner comes from a shared preset
MATCH  expected unclear, given unclear  Unclear: the commit section was removed
MATCH  expected unclear, given unclear  Unclear: the port is not mentioned any more
MATCH  expected unclear, given unclear  Unclear: a README about something else
Matched: 12 of 12.
Expected supported or unclear, answered contradicted: 0.000.
```

The rate is recorded and no target is set. Twelve hand-written cases are a small set, so the rate says little beyond them.

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| No size or secret guard | the not-sent test |
| No call limit | the call-limit test |
| The rung placed before the content check | the not-reached test |
| The confidence not lowered | the `contradicted` test |
| A recording removed | the replay test |

`pnpm check`:

```text
      Tests  1114 passed (1114)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the eighth commit, which holds all of the code and the recordings, with the eval in replay on both: https://github.com/Johnmark-Tech/factloom/actions/runs/44017515181.

Differences from the item:

- **The owner's step was done in this session**, as the item says, with the owner's approval to use the key. The agent ran the record command with the key set for that command only.
- **The report gains an `undecided` count** for facts left `inconclusive` because no key is set, and for facts left for the next run by the call limit.
- **Facts beyond the call limit are not recorded at all**, so that they are still stale on the next run, as "wait for the next run" requires.

### FL-052: Entity merge with read resolution

| | |
|---|---|
| Status | Completed |
| Phase | 3 |
| Depends on | FL-015, FL-016, FL-017 |
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
- [x] Contract suite cases pass against both stores: two entities of one type, each with facts; after `mergeEntities`, `listFacts` by either identifier returns the facts of both with `subject` set to the entity merged into; each search lane returns a fact recorded against the merged entity with the same `subject`.
- [x] A contract case shows the number and content of entity rows and fact rows are identical before the merge and after it.
- [x] A contract case shows two entities of different types are merged, and `listFacts` by either identifier returns the facts of both.
- [x] A contract case shows that after the merge of two entities, recording a second open-ended value for a single-valued predicate against the merged identifier fails with `conflict`, when the other entity holds an open-ended value for that predicate.
- [x] Contract cases cover the refusals: a self-merge is `invalid_input`; a merge of an already merged entity is `already_exists`; a merge into an entity that is itself merged is `invalid_input`; an entity in another namespace is `not_found`.
- [x] A contract case shows one audit entry for the merge, with operation `merge` and action `entity.merged`.
- [x] A contract case shows `listEntityMerges` returns the merge with its two entities, its time and a null `undone_at`, and returns nothing from another namespace.
- [x] A SQLite adapter test shows a direct `DELETE` on `entity_merge`, and any `UPDATE` other than setting `undone_at` once, are refused.
- [x] A SQLite adapter test opens a database created by the earlier migrations only, applies the new one, and reads an existing fact unchanged.
- [x] `pnpm check` exits 0.

**Validation.** The contract suite against both stores. SQLite adapter tests for the triggers and the migration. Unit tests of the operation with the in-memory store. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the updated `INTERFACES.md` and `SCHEMA.md` with the names this item settled.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in three commits, each checked on its own: `feat(storage): add the entity merge migration`, `feat(core): add merge_entities and resolution through merges to both stores`, and `feat(core): add the mergeEntities operation`.

The proposed names are kept: the change `merge_entities`, the operation `merge`, the action `entity.merged`, the reason code `same_entity`, and the read `listEntityMerges`.

- **The merge row.** `EntityMerge` is a core schema in `packages/core/src/entity-merge.ts`, in `INTERFACES.md` and the parity test, whose count rises to 26.
- **The audit entry** targets the entity merged from, with `detail` `{ intoEntityId, mergeId }`.
- **The migration** is `0005_add_entity_merge.sql`, sha256 `97d6364d7f5526a2ecefb4a34fcdea65ac22b4ccf73433d993252de0b101bd24`. It holds the table, with `from <> into` and `undone_at >= merged_at` checks, a partial unique index so that an entity is merged into at most one other at a time, and an index for resolution. Its triggers refuse a delete and every update but setting `undone_at` once, so FL-063 needs no migration. It carries the comment on Postgres. The purge inventory of FL-061 required its six columns to be classified, and they are listed as not content.

Resolution through the merges in force is done in the store, in both:

- **SQLite.** The fragments are in `packages/storage/src/entity-resolution-sql.ts`, each filtering on the namespace. A subject filter and a touching filter of `listFacts` expand to every identifier merged with the ones asked for. `withSources` shows `subject` and `objectEntity` as the entity merged into, so both lanes and every read return the same resolution. The single-value query of `commit` expands the subject the same way.
- **The in-memory store** follows the same rules.

The fact rows keep their own identifiers; the read methods do not change shape.

Contract cases, against both stores, in the group "single-value rule and namespaces":

- **M1:**
  - after merging `e-twin` into `e-repo`, `listFacts` by either identifier returns the facts of both, with `subject` `e-repo`;
  - both lanes return the twin's fact with `subject` `e-repo`;
  - a touching filter on `e-repo` finds it.
- **M2:** the entity rows and every fact row, read with `time: 'all'`, are byte for byte the same before and after the merge.
- **M3:** entities of different types merge and are read together.
- **M4:** after the merge, an open-ended value recorded against `e-twin` for a single-valued predicate fails with `conflict` naming `e-repo`'s `pg16`.
- **M5:** a self-merge is `invalid_input`; merging an entity already merged is `already_exists`; a merge into a merged entity is `invalid_input`; an entity of the other namespace is `not_found`.
- **M6:** one audit entry, operation `merge`, action `entity.merged`.
- **M7:** `listEntityMerges` returns the merge with a null `undone_at`, and nothing for the other namespace.

The count of the group is 26 for the in-memory store and 27 for SQLite.

SQLite adapter tests, in `entity-merge-migration.test.ts`:

- **Triggers.** A delete and an update of `into_entity_id` or `merged_at` are refused. Setting `undone_at` is accepted once, and refused the second time.
- **Upgrade.** A database built by the first four migrations, with a fact, opens with the fifth applied and reads the fact unchanged.

`mergeEntities` has 4 unit tests with the in-memory store: the merge recorded and returned; the trigger and reason code in the audit entry; a self-merge refused with nothing recorded; a missing entity.

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| SQLite's subject filter not resolved | M1, M3 |
| SQLite's results not shown under the entity merged into | M1 |
| SQLite's single-value rule not resolved | M4 |
| The in-memory store's resolution turned off | M1, M3, M4 |
| The in-memory store accepts a merge into a merged entity | M5 |

`pnpm check`:

```text
 Test Files  88 passed (88)
      Tests  926 passed (926)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the third commit: https://github.com/Johnmark-Tech/factloom/actions/runs/43997138148.

`INTERFACES.md`, `SCHEMA.md` ("Added by later migrations", the lists of operations, actions and reason codes, and "Planned additions", which keeps only `entity_alias`) and `SYSTEM-BOUNDARIES.md` record the names.

Differences from the item:

- **`findEntities`** is not resolved: it finds entity rows by name, and the item's list of resolved reads does not name it.
- **Merge identifiers** are unique, and a repeated one is `already_exists`.

### FL-063: Undo a merge and refuse a conflicting merge

| | |
|---|---|
| Status | Completed |
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
- [x] A contract case, against both stores, shows that after `undoEntityMerge`, `listFacts` by each identifier returns exactly the facts recorded against it, including one recorded while the merge was in force.
- [x] A contract case shows the number and content of entity rows and fact rows are identical before the merge, after it, and after its undo.
- [x] A contract case shows a chain: A merged into B, then B into C; `listFacts` by A returns the facts of all three under C, and each search lane returns them with the same `subject`.
- [x] A contract case shows that undoing the merge of B into C leaves the facts of A and B read under B, and those of C under C.
- [x] A contract case shows a merge is refused with `conflict`, with both facts in `relatedFactIds`, when the two entities hold different current values for a single-valued predicate, and that `listEntityMerges` then returns no merge.
- [x] A contract case shows two entities of different types that hold different current values for a single-valued predicate are refused in the same way, and are merged when they do not.
- [x] A contract case for an adapter that keeps its data in a file: one connection commits a merge while a second commits a conflicting fact for the other entity. Exactly one of the two commits succeeds.
- [x] Contract cases cover the other refusals: a second undo is `already_exists`; an unknown merge is `not_found`; a merge in another namespace is `not_found`; a cycle is `invalid_input`.
- [x] A contract case shows one audit entry for the undo, with operation `merge` and action `entity.merge_undone`.
- [x] `pnpm check` exits 0.

**Validation.** The contract suite against both stores. Unit tests of the two operations with the in-memory store. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the section of `INTERFACES.md` that records the answer to technical requirement 5.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in three commits:

1. `docs: settle in INTERFACES.md the single-value rule after a merge`, written before the code, as technical requirement 5 asks;
2. `feat(core): resolve chains of merges, refuse conflicting merges and undo merges in both stores`;
3. `feat(core): add the undoEntityMerge operation`.

The answer to technical requirement 5 is in `INTERFACES.md`, "The single-value rule after a merge":

- **The refusal.** A merge is refused when the two entities, each with everything already merged into it, hold live facts for a single-valued predicate with different objects as stored and overlapping valid periods.
- **Same objects.** Two such facts with the same object stay, both live, restating each other.
- **Later commits.** The store's rule inside `commit` keeps checking only the facts a change set records, so a later different value is still refused.

Built:

- **The changes.** `merge_entities` now carries `singleValuedPredicates`, which `mergeEntities` takes from its domain, as `singleValued` reaches the store for a recorded fact. A new change, `undo_entity_merge`, with the action `entity.merge_undone` and `detail` `{ mergeId }`, sets `undone_at` once. `undoEntityMerge` reads the merge, refuses an unknown one with `not_found` and an undone one with `already_exists`, and commits it.
- **Chains.** Resolution follows whole chains of merges. In SQLite it is one recursive query per fragment, in `entity-resolution-sql.ts`: up the chain from the identifiers asked, to the ends of the chains, then down to everything merged into them. The in-memory store follows the same chain.
- **Cycles.** FL-052's interim refusal of chains is removed. A merge whose target resolves to the entity merged from would make a cycle and is `invalid_input`, which also bounds the chains.
- **The conflict check** is a query inside the commit's transaction, in both stores.

Contract cases, against both stores:

- **M8:** after an undo, each identifier reads exactly its own facts, a fact recorded during the merge included.
- **M9:** the entity and fact rows are the same before a merge, after it, and after its undo.
- **M10:** a chain, A into B and B into C; a read by A returns the facts of all three under C, and both lanes return A's fact with `subject` C.
- **M11:** undoing B into C leaves the facts of A and B under B, and C's under C.
- **M12:** different current values for `uses_database_version` refuse the merge with `conflict`, naming both facts, and no merge is recorded.
- **M13:** two entities of different types with the same current value are merged, and both facts stay live under the entity merged into; a third entity with a different value is refused.
- **M14:** a second undo is `already_exists`; an unknown merge, and a merge asked for in the other namespace, are `not_found`.
- **M15:** one audit entry, operation `merge`, action `entity.merge_undone`, and `undoneAt` set.
- **M5, rewritten:** a cycle is `invalid_input`, where a chain used to be refused.
- **P2, for SQLite with two stores on one file:** the second store commits a conflicting fact for the entity to be merged, then the first commits the merge; exactly one succeeds, and the other is `conflict`.

The count of the group is 35 for the in-memory store and 37 for SQLite. `undoEntityMerge` has 3 unit tests with the in-memory store.

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| SQLite skips the merge conflict check | M12, M13, P2 |
| SQLite resolves one step of a chain only | M10 |
| SQLite skips the cycle check | M5 |
| The in-memory store skips the merge conflict check | M12, M13 |

P2 at first ran the merge before the fact, and passed with the merge's check removed, because the fact's own single-value check then refused it. It now commits the fact first, so that only the check inside the merge's commit can refuse, which is the case technical requirement 1 names.

`pnpm check`:

```text
 Test Files  91 passed (91)
      Tests  960 passed (960)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the third commit: https://github.com/Johnmark-Tech/factloom/actions/runs/43999339047.

Differences from the item:

- **The undo change** carries the merged-from entity, so that its audit entry can target it without a read in the store. The store checks that it matches the merge.
- **Objects are compared as stored**, not resolved through merges, as the restatement rule compares them.

### FL-053: Duplicate entity detection by name

| | |
|---|---|
| Status | Completed |
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
- [x] The decision on the alias table is recorded in a decision record that names the use, or says there is none.
- [x] Contract suite cases for `listEntities` pass against both stores: paging returns every entity once; no entity of another namespace is returned.
- [x] A unit test for stage 1 passes with an LLM client and an embedder that both fail if called: two entities whose names differ only in punctuation and case are merged under `automatic`, into the one created earlier.
- [x] A unit test shows two entities with equal names and different types are not compared.
- [x] A unit test shows that under `human_approval` the same pair is reported and no merge row is written.
- [x] A unit test shows a pair with an undone merge is not merged again. The store given to the job is wrapped so that `listEntityMerges` returns one merge of the pair with `undone_at` set.
- [x] A unit test shows a merge refused with `conflict` is counted as flagged and the run continues. The store given to the job is wrapped so that the commit of the merge returns `conflict`.
- [x] A unit test shows a second run over the same memory makes no further merge.
- [x] Unit tests of the stricter normalisation pass with these names: "treats names that differ only in punctuation as equal", "treats compatibility forms of a character as equal", "keeps names with different letters apart".
- [x] Every merge made by the job has an audit entry with trigger `maintenance`.
- [x] `pnpm check` exits 0.

**Validation.** Unit tests with failing LLM and embedder clients and the in-memory store. The contract suite for the new read. `pnpm check`.

**Completion evidence.** The commit; the decision record on the alias table; the passing check output.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in seven commits and this record:

1. `docs: add ADR 0021, no alias table because merges serve as aliases`;
2. `docs: drop the planned alias table from SCHEMA.md and the watch list`;
3. `docs: add listEntities to the MemoryStore of INTERFACES.md`;
4. `feat(core): add listEntities, paged by identifier, in both stores`;
5. `feat(maintenance): add duplicate entity detection by strict name, with stages FL-064 can extend`;
6. `feat(mcp-server): run duplicate entity detection in maintenance`;
7. `docs(mcp-server): describe the duplicate entity job`;

The item was started while FL-048, on which it depends, was `Under Review`. Only the owner's run of the session start hooks remains there, and this item changes neither hook.

**The alias table.** [ADR 0021](../../architecture/adr/0021-no-alias-table-merges-serve-as-aliases.md) records that no use was found that merge resolution does not serve, and the table is not built:

- the entity merged from keeps its row and name;
- resolution at write time finds it by name;
- reads resolve it to the entity merged into;
- no work item writes an alias.

Stage 2 is therefore left out, and requirement 7 does not apply. The planned row is removed from `SCHEMA.md`, and the watch list in `OPEN-QUESTIONS.md`, section C, points to the decision.

Built:

- **`listEntities`.** Added to `MemoryStore` in both stores, paged by a limit and the identifier after which to start, in identifier order. In SQLite it is one query on the primary key. Contract cases:
  - **X1:** paging two at a time returns every entity once;
  - **X2:** a limit below 1 is `invalid_input`;
  - **N11:** no entity of the other namespace is returned.

  The counts are now 81 for group 1, and 38 (in-memory) and 40 (SQLite) for group 2.
- **`normaliseNameStrictly`** in `@factloom/maintenance`: NFKC, then `normaliseEntityName`, then every punctuation mark, symbol and space removed.
- **The job.** `findDuplicateEntities`:
  - reads every entity page by page, and the merges;
  - compares pairs of the same type among the entities not merged into another, leaving out any pair whose merge was undone;
  - runs the stages in order, passing on the pairs no stage decided; the only stage now is `NAME_STAGE`, and FL-064 adds its two after it;
  - under `automatic`, merges a pair found the same into the entity created earlier with `mergeEntities`, trigger `maintenance` and reason `same_entity`;
  - under `human_approval`, reports the pair as flagged;
  - flags a merge refused with `conflict`, with the facts in the way, and counts any other refusal as failed;
  - skips any pair whose entity this run merged into another.

  It is registered as `find_duplicate_entities`, after the anchor repair.

Unit tests, each with an LLM client and an embedder that fail if called:

- **Stage 1:** `Node.js` and `nodejs` are merged into the earlier one, with an audit entry with trigger `maintenance`.
- **Types:** equal names of two types are not compared.
- **Policy:** `human_approval` reports the pair and writes no merge.
- **Undone merges:** a store wrapped so that `listEntityMerges` returns an undone merge of the pair makes no merge.
- **Conflicts:** a store wrapped so that the merge's commit returns `conflict` gives one flagged pair, `merge_conflict: f-1, f-2`, and the next pair is still merged.
- **A second run** makes no further merge.
- **The strict normalisation:** the three named tests, "treats names that differ only in punctuation as equal", "treats compatibility forms of a character as equal" (full-width letters and the ligature ﬁ) and "keeps names with different letters apart".

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| Merge into the later entity | the stage 1, conflict and second-run tests |
| Compare entities of different types | the different-types test |
| Ignore undone merges | the undone-merge test |
| Ignore `human_approval` | the human-approval test |

`pnpm check`:

```text
      Tests  1045 passed (1045)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the sixth commit: https://github.com/Johnmark-Tech/factloom/actions/runs/44005684674.

Differences from the item:

- **No alias stage, and no alias table**, by ADR 0021.
- **A flagged pair's identifier** is written `<merged from>-><merged into>`. Its reason is `same_entity` under `human_approval`, or `merge_conflict:` followed by the facts in the way.

### FL-064: Duplicate entity detection by similarity

| | |
|---|---|
| Status | Completed |
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
5. The eval runs the four stages over the pair set with the real local embedder and with the LLM replayed by the wrapper of FL-028. Because it needs the real embedding model, it runs under `pnpm eval` and in the eval job of FL-002, not under `pnpm check` ([`TESTING.md`](../../architecture/TESTING.md), "Four kinds of test"). It prints, for each stage, how many pairs it decided, and the over-merge count (expected different, decided same) and under-merge count (expected same, not decided same).
6. The stable part of the prompt is in `instructions` and the pair is in `input`. No model name is written in `maintenance`.

**Constraints.**
- [`INTERFACES.md`](../../architecture/INTERFACES.md): a merge can be refused, and product 2 does not force it.
- [ADR 0013](../../architecture/adr/0013-claude-behind-a-one-method-interface.md): the stage sees only `LlmClient`.
- `.claude/rules/testing.md`, "Evals": replayed responses; a missing recording fails the run.

**Acceptance criteria.**
- [x] A unit test shows a pair above the threshold is sent to the LLM and a pair below it is not, with the fake embedder and a scripted LLM.
- [x] A unit test shows an "unsure" answer and a "different" answer from a scripted LLM both leave the pair unmerged, and a "same" answer merges it under `automatic`.
- [x] A unit test shows that without an LLM client no pair from stage 3 is merged, and the candidates are in the report.
- [x] A unit test shows a pair of different types with equal names reaches the LLM stage and is merged on "same".
- [x] A unit test shows the call limit: with the limit set to 2 and five candidates, two calls are made.
- [x] A unit test shows a failed LLM call leaves the pair unmerged and counts it as failed.
- [x] By hand, once, by the owner in the session: with `ANTHROPIC_API_KEY` set in the environment and nowhere else, the owner runs the entity pair eval in record mode from `apps/mcp-server` (`pnpm run record:entities`, which wraps the Anthropic client with the wrapper of FL-028 in record mode), reads the diff of the new recordings for secrets, and records the model identifier. A replayed run fails while a recording is missing, so the code and the recordings are committed together after this step, and the item is not `Completed` before it.
- [x] The entity pair eval runs under `pnpm eval` in replay and fails on a missing recording. Its output shows an over-merge count of 0 for pairs decided by stages 1 and 2. The over-merge and under-merge counts of stage 4 are printed and recorded; this item sets no target for them.
- [x] A second labeller who has not seen the expected answers labels every pair blind, and the result is recorded. The owner reviews the pairs where the two disagree or the second labeller is unsure, and records "reviewed" and the date.
- [x] Every merge made by the two stages has an audit entry with trigger `maintenance`.
- [x] `pnpm check` exits 0 with no network access and no embedding model in the cache.

**Validation.** Unit tests with scripted and failing LLM clients, the fake embedder and the in-memory store, on every check. The entity pair eval in replay under `pnpm eval`. One live run by hand: the owner runs the eval with recording on and the real embedder, and records the counts and the two similarity distributions.

**Completion evidence.** The commit; the eval output; the threshold's value and the distributions it was chosen from; the model identifier the recordings were made with; Q-56 in `OPEN-QUESTIONS.md` brought up to date.

**Recorded evidence.** Prepared on 2026-11-17 on Linux x64 with Node.js v22.23.4, in seven commits and this record:

1. `docs: add the LLM task entity_matching to INTERFACES.md`;
2. `feat(core): add the LLM task entity_matching, with its model in the task map`;
3. `feat(maintenance): add the similarity and LLM stages of duplicate entity detection`;
4. `feat(mcp-server): run the similarity and LLM stages in duplicate entity detection`;
5. `test(mcp-server): add the entity pair set and its eval, recorded with the owner's key`;
6. `docs: record the first data on entity matching in Q-56`;
7. `docs(mcp-server): describe the similarity and LLM stages of duplicate detection`;

and, after the set was grown to 50 pairs, four more:

8. `fix(maintenance): keep + and # in the strict normalisation of entity names`;
9. `test(mcp-server): grow the entity pair set to 50 pairs, recorded with the owner's key`;
10. `docs(maintenance): record the 50-pair measurements beside the similarity threshold`;
11. `docs: record the 50-pair measurements of entity matching in Q-56`;

The item is `Under Review`: the owner reviews the pairs that the blind second labelling below leaves in doubt, and records "reviewed" and the date. That criterion is the owner's and is not ticked.

Built:

- **The task.** `LlmTask` gains `entity_matching`, in `INTERFACES.md`, the parity test and the task map, where it is `claude-haiku-5-5`.
- **Stage results.** A duplicate stage now returns `same`, `candidate` (reported as `similar_name`), `failed`, `deferred` (counted as undecided) or null.
- **Cross-type pairs.** A stage marked `crossType` is also offered pairs of two types whose names are equal under the strict normalisation of FL-053. The name stage is not, so FL-053's test that such a pair is not compared still holds with the name stage alone.
- **The similarity stage.** `createSimilarityStage` holds stages 3 and 4.
  - **Stage 3** embeds the names with `Embedder.embed` during the run and keeps them in memory, with no table. A pair of one type below `SIMILARITY_THRESHOLD` passes on.
  - **Stage 4** asks the LLM, with the stable `ENTITY_MATCH_INSTRUCTIONS` and the two names, types and up to `FACTS_PER_ENTITY` (5) live facts each in `input`. Only `same` merges, `unsure` is reported, and `different` passes. A cross-type pair goes straight to stage 4.
  - **No LLM client:** candidates are reported, not merged.
  - **The call limit:** `MAX_ENTITY_MATCH_CALLS_PER_RUN` (20); candidates beyond it wait.
  - **A failed call** is counted as failed. A pair decided `same` is merged or reported as in FL-053.
- **The wiring.** The composition root runs the name stage and then the similarity stage, made anew for each run, with the key's LLM or none.

**The threshold.** `SIMILARITY_THRESHOLD` = 0.65. It was first chosen on 24 pairs, just below the lowest true pair (0.669), and measured again on 50 pairs with `bge-small-en-v1.5`, before any LLM call:

| Pairs | Similarities |
|---|---|
| Expected the same, past stage 1, of one type (19) | 0.583, 0.654, 0.669, 0.685, 0.736, 0.741, 0.756, 0.758, 0.774, 0.785, 0.845, 0.863, 0.875, 0.878, 0.881, 0.883, 0.907, 0.910, 0.923 |
| Expected different, of one type (23) | 0.591, 0.595, 0.633, 0.693, 0.718, 0.736, 0.745, 0.755, 0.762, 0.782, 0.785, 0.803, 0.826, 0.830, 0.840, 0.841, 0.844, 0.848, 0.862, 0.880, 0.882, 0.906, 0.946 |

The two ranges overlap from 0.591 to 0.923, so a threshold on names cannot separate them, as the research expected; the LLM decides. The lowest true pair, OpenTelemetry and OTel at 0.583, is now below 0.65. Lowering the threshold to reach it was measured against the cost in calls: of the 3,196 pairs of unrelated names in the set, 57% score 0.57 or more, 13% score 0.65 or more and 1% score 0.75 or more. A threshold of 0.57 would send most pairs in a memory to the LLM, against a limit of 20 calls a run, so 0.65 is kept and the one under-merge accepted.

**The pair set.** Fifty pairs in `apps/mcp-server/evals/entity-pairs/`, written by the agent, 25 expected the same and 25 different. They include:

- the research's two examples, "Postgres" and "PostgreSQL", and two different things called "Java";
- short names (TS, JS, TF, OTel), abbreviations and their long forms (k8s and Kubernetes, AWS S3 and Amazon S3, GCP and Google Cloud);
- two versions of one product (Python 2 and 3, Angular and AngularJS);
- one thing under two types (squash merges as a convention and a decision), and two things of different types under one name (Mercury);
- names that differ only in a sign that carries meaning (C, C++ and C#), and near names of different things (Java and JavaScript, Docker and Docker Hub, MongoDB and Mongoose);
- five pairs that stage 1 decides.

Writing the C pairs showed that the strict normalisation of FL-053 removed `+` and `#`, so that C, C++ and C# became one name and stage 1 would have merged them. Commit 8 keeps the two signs, with a test that C, C++, C# and F# give four names.

**The eval.** `entity-pairs.eval.test.ts` runs under `pnpm eval`, with the real embedder and the LLM replayed. With one recording removed, it failed with `No recording for the key …` and named the record command. The recordings were made in this session with the owner's key, set for the one command `pnpm run record:entities`: model `claude-haiku-5-5`, 41 recordings (the 19 of the first set unchanged and 22 new), no key, token or password pattern in the files. The output on 50 pairs:

```text
Stage 1, name: decided 5, over-merges 0.
Stages 3 and 4, similarity and LLM: decided 17, over-merges 0.
Under-merges, all stages: 3.
```

On the first 24 pairs it was 2 and 10 decided, with no over-merge and no under-merge. The three under-merges on 50 pairs:

- **OpenTelemetry and OTel**, 0.583, below the threshold;
- **RabbitMQ and Rabbit**, 0.758, and **Terraform and TF**, 0.654, which the LLM answered `unsure`. They are reported as candidates, so a person sees them.

Of the pairs expected different that reached the LLM, 20 of one type and the two cross-type pairs, it answered `same` for none. No stage 2 exists ([ADR 0021](../../architecture/adr/0021-no-alias-table-merges-serve-as-aliases.md)), so the eval runs three stages, not four. Q-56 is brought up to date with this data, and stays open until the owner has reviewed the pairs and real memory has been tried.

Unit tests, with a hand-placed embedder, scripted LLMs and the in-memory store:

- **The threshold:** a pair above it reaches the LLM and a pair below it does not; the scripted LLM has one answer, so a second call would throw.
- **The answers:** `same` merges with an audit entry with trigger `maintenance`; `different` and `unsure` do not, and `unsure` is reported.
- **No client:** nothing is merged and the candidate is reported.
- **Cross-type:** a pair of two types with equal names reaches the LLM and is merged on `same`.
- **The call limit:** with a limit of 2 and five candidates, two calls are made and three pairs are undecided.
- **A failed call:** counted as failed, nothing merged.

`pnpm check` passes with no network and no embedding model, because the eval file is named `*.eval.test.ts` and runs only under `pnpm eval`.

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| No threshold | the threshold test, the call-limit test |
| `unsure` merges | the different-and-unsure test |
| No LLM client merges on similarity | the no-client test |
| A recording removed | the entity pair eval |

`pnpm check`:

```text
      Tests  1121 passed (1121)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the seventh commit: https://github.com/Johnmark-Tech/factloom/actions/runs/44029997298. The entity pair eval runs under `pnpm eval`, which the workflow runs only weekly or by hand. Started by hand on the 50-pair set at the eleventh commit, the eval job passed on Linux x64 with the same counts and similarities as here: https://github.com/Johnmark-Tech/factloom/actions/runs/44036447389.

**The blind second labelling.** Added on 2026-11-20, with the owner's approval, in place of the owner reading all 50 pairs: two labellers who agree independently are stronger evidence than one person rereading the author's answers, and the owner's time goes to the pairs in doubt. A fresh agent was given only the names, types and facts of each pair, under neutral identifiers and in shuffled order, with neither the file names nor the expected answers, and answered same or different, confident or unsure, with a reason. It agreed with the expected answer on all 50 pairs, and was unsure of one:

- **squash merges, as a convention and as a decision** (`squash-merges-two-types.yaml`, expected same): "the same practice recorded under two types, though a decision record and the convention could be modelled apart."

That pair is what the owner reviews.

Differences from the item:

- **The recordings were made by the agent in this session**, with the owner's approval to use the key, the key set for that command only.
- **Three stages, not four**, by ADR 0021.
- **An `unsure` answer is reported** as a candidate, not passed silently, so that a person sees the uncertain pairs.
- **The pair set has 50 pairs**, grown from the first 24 with the owner's approval to use the key again.
- **The owner's review is narrowed to the pairs a blind second labelling leaves in doubt**, with the owner's approval on 2026-11-20. The criterion was reworded to say so.

**Owner's review.** On 2026-11-25 the owner reviewed the one pair the blind second labelling left in doubt, squash merges as a convention and as a decision, and confirmed its expected answer `same` in the session ("yes to all confirmed"): reviewed, 2026-11-25. The item is `Completed`.

### FL-054: Anchor repair for moved and renamed files

| | |
|---|---|
| Status | Completed |
| Phase | 3 |
| Depends on | FL-050 |
| Requirements | REQ-22, REQ-24 |
| Components | `packages/maintenance` (repository interface, job), `apps/mcp-server` (git implementation), fixture repositories |

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
- [x] Fixture "renamed": a fact anchored to a file that a later commit renames without changing it. After a maintenance run that includes FL-050's job and this one: the fact has the same identifier and is live; it has a second source with the new path and the `HEAD` commit; its latest verification is `confirmed`; `listOrphanedFacts` does not return it.
- [x] Fixture "renamed and edited": as above, with the file also changed in the renaming commit so that git still reports a rename. The latest verification is `inconclusive` and the fact is not on the orphaned list.
- [x] Fixture "renamed twice": the new source carries the final path.
- [x] Fixture "deleted": no source is attached, the fact is live, `listOrphanedFacts` returns it, and the report counts it as flagged.
- [x] A second run over the "renamed" fixture attaches no further source and writes no audit entry for the fact.
- [x] The number of fact rows is the same before and after every fixture run.
- [x] Every audit entry written by the job has trigger `maintenance` and reason code `anchor_moved`.
- [x] All fixture runs pass with an LLM client that fails if called.

**Validation.** Unit tests of the job with the fake repository reader and the in-memory store. Fixture repository tests with the git implementation and the SQLite adapter on both CI platforms. `pnpm check`.

**Completion evidence.** The commit; the passing check output on Linux and macOS arm64; the git commands used, each with its documentation citation.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4 and git 2.43.0, in five commits:

1. `docs: settle in INTERFACES.md how a moved anchor is repaired`;
2. `feat(core): add the reason code anchor_moved`;
3. `feat(maintenance): add the anchor repair job, and the git lookup of where a file was renamed`;
4. `feat(mcp-server): run the anchor repair after verification in maintenance`;
5. `docs(mcp-server): describe the anchor repair job`.

Technical requirement 1 is settled in `INTERFACES.md`, "A moved anchor is repaired by restatement". `recordFacts` accepts no drafts with the fact in `restatedFactIds`. That commits a `record_source` and an `attach_source` change under the operation `remember`, with trigger `maintenance` and the new reason code `anchor_moved`. The verification that follows carries the same reason code.

Built:

- **The job.** `repairMovedAnchors` in `@factloom/maintenance`:
  - reads `HEAD` first, and fails before changing anything if the repository cannot be read;
  - takes the facts from `listOrphanedFacts` that have a file anchor, which are exactly those whose latest verification is `source_missing`, because a purged source keeps no locator;
  - follows renames, up to 10 steps, until a path exists at `HEAD`.
- **A repair.** It attaches a source of kind `file` at the new path and the `HEAD` commit, with no content, and records `confirmed` or `inconclusive` from the content identifiers.
- **No rename.** If git shows none, the fact is flagged with the reason `source_missing` and nothing changes.
- **`findAnchor`** moved to its own file, shared by both jobs.
- **The reader.** `RepositoryReader` gains `findRenamedPath`, one step of check 4.2.
- **The order.** The job is registered after `verify_anchored_facts`, so a file found missing in a run is looked for in the same run.

The git commands of check 4.2:

| Step | Command | Documentation |
|---|---|---|
| The commit that removed the path | `git log --no-renames --diff-filter=D --format=%H -1 HEAD -- <path>` | git-log, https://git-scm.com/docs/git-log: `--diff-filter` with `D` selects deleted paths, `-n` limits the commits shown, `%H` is the commit hash, `-- <path>` shows "only commits that are enough to explain how the files that match the specified paths came to be". `--no-renames` turns rename detection off "even when the configuration file gives the default to do so" |
| Where it went | `git show -M --name-status --format= <commit>` | git-show, https://git-scm.com/docs/git-show: for commits it shows "the log message and textual diff"; `-M` detects renames, with a default similarity index of 50%; the raw output format of git-diff (https://git-scm.com/docs/git-diff) gives a rename as `R` with a score, then the old and new path |

`--no-renames` is an addition to the research's command. Without it, a user whose `diff.renames` setting differs could see the removal reported in another way. Where the documentation was read only as a summary of the page (the `--diff-filter`, `%H`, `-M` and `--name-status` wording), the behaviour was confirmed by running it: the reader's test on a fixture repository finds `renamed.md` for a renamed file, and nothing for a deleted file or one never removed. The empty `--format=` was not found in the pages read; it was confirmed by the same run, because the parsed lines start with the status letter.

Tests:

- **The job, with a fake reader and the in-memory store.** Four unit tests: a renamed file is repaired and confirmed, a file git shows no rename for is flagged, a fact not orphaned is left, and an unreadable repository fails the job.
- **The fixtures of the acceptance criteria, with the git reader and the SQLite adapter, after FL-050's job in one maintenance run.**
  - "renamed": same identifier, a second source with the new path and the `HEAD` commit, verifications `source_missing` then `confirmed`, off the orphaned list, fact rows unchanged, and the job's audit entries `fact.source_attached` and `fact.verified`, each with trigger `maintenance` and reason `anchor_moved`.
  - "renamed and edited": `inconclusive`, off the orphaned list.
  - "renamed twice": the new source has the final path.
  - "deleted": no source, flagged, on the orphaned list, fact rows unchanged.
  - A second run over "renamed": the same sources and the same audit entries.
- **The fixture helpers** of FL-050's run test moved to `testing/maintenance-fixture.ts`, shared by both run tests.
- **No LLM call.** Every run receives the dependencies of `createTestDeps`, whose LLM client fails if called.

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| The job follows one rename only | "renamed twice" |
| The job also skips facts whose latest verification is not `source_missing` | none, because `listOrphanedFacts` already returns only those; the check was removed as redundant |
| The rename lookup leaves out `--diff-filter=D` | none: when a path is gone at `HEAD`, the last commit that touched it is the one that removed it. The filter stays as the research's command, as a guard |

`pnpm check`:

```text
 Test Files  100 passed (100)
      Tests  1030 passed (1030)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the fourth commit, with the git fixture tests on both: https://github.com/Johnmark-Tech/factloom/actions/runs/44004845502.

Differences from the item:

- **`--no-renames`** was added to the research's `git log` command, as above.
- **The attached source has no content.** The file is the source, named by its path and commit.

### FL-055: Usage tracking

| | |
|---|---|
| Status | Under Review |
| Phase | 3 |
| Depends on | FL-015, FL-031, FL-058 |
| Requirements | REQ-23 |
| Components | `@factloom/core` (interface, in-memory store), `@factloom/storage` (migration, adapter, contract suite), `apps/mcp-server` (usage step after `recall`) |

**Objective.** Record which facts recall returns, without making recall a write, so that archiving has something to decide by.

**Background.** An **archived fact** is a live fact left out of recall by default because it has not been used. [`SCHEMA.md`](../../architecture/SCHEMA.md), "Planned additions", describes a `fact_usage` table and the record that a fact is archived, and says they were kept out of phase 1 so that recall stays a pure read and that archiving by disuse starts counting when it is introduced. [`INTERFACES.md`](../../architecture/INTERFACES.md) states the rule and its one exception: "Reads never write. Recall does not update a counter or a timestamp. From phase 3, how often a fact is recalled is recorded by the caller after the read, in a usage table outside `commit` and with no audit entry: usage counts are bookkeeping, not memory." The original item was split: this one records usage, FL-065 archives and unarchives, and FL-073 leaves archived facts out of recall and runs the archiving job. The [research on decay](../../research/technical/memory-decay-and-consolidation.md) gives the position this item follows: archiving is about tidiness and never changes what Factloom believes; usage is counted when a fact is returned to the caller, in one batched write after the response is produced, and a lost update is acceptable. It also names the main risk: a true fact that is rarely used. Two questions are open in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md): Q-11, whether usage writes cause contention, and Q-57, what period suits code memory. The research's 180 days is a placeholder.

**Outcome.** For every fact, memory's bookkeeping shows when it was last returned by recall and how often. `recall` is still a pure read, and the audit log holds no entry for a recall. The archiving job of FL-073 reads these counts to decide what to archive.

**Scope.**
- The migration that adds `fact_usage`.
- One write method on `MemoryStore` for usage, outside `commit` and with no audit entry, and one read of a fact's usage, in both stores.
- The step in `apps/mcp-server` that records usage after `recall` has returned.
- The measurement that open question Q-11 asks for.

**Non-goals.**
- Archiving and unarchiving: FL-065. The archiving job: FL-073.
- Any use of usage or age in ranking. The research lists it under "Do not build yet".
- A retrieval log, a pinned flag, and an importance value. Section C of `OPEN-QUESTIONS.md` questions each, and nothing in this item reads one.
- An audit entry for a recall. Usage counts are bookkeeping, not memory.
- A job in the maintenance run. This item registers none, so it does not need the run of FL-048; the run gains the archiving job in FL-073.

**Functional requirements.**
1. The `recall` use case (FL-031) remains a pure read. It writes nothing, with or without usage tracking.
2. After `recall` has produced its result, the caller records usage for the facts in that result with the store's usage method (proposed: `recordFactUsage`): for each fact, the time and a count increased by one, in one write.
3. The usage write is not a change to memory. It does not go through `commit`, builds no `ChangeSet`, and writes no audit entry. It touches no row of `fact`, `source`, `entity` or `audit_log`.
4. A failure to record usage never fails or delays the recall result. It is logged to standard error and dropped. A lost update is acceptable.
5. Usage is recorded by the `recall` tool only. `get_fact_history`, the fact operations and the evals record none.
6. A fact that does not exist in the namespace is skipped by the usage write, without an error.
7. The read returns, for a fact, the time it was last recalled and its count, or nothing when it was never recalled. It never returns usage from another namespace.
8. Each store keeps the time at which its usage tracking began, so that the archiving job of FL-073 can tell "never used" from "not yet counted".

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
- [x] A unit test of `recall` with the in-memory store shows the store's whole content, usage included, is identical before and after the call. A SQLite adapter test shows the same by comparing a dump of every table before and after the lane queries.
- [x] A test of the `recall` tool handler shows that after a call the usage of each returned fact has a count of 1 and the time of the call, and after a second call a count of 2.
- [x] A test of the `recall` tool handler with a store whose usage write always fails shows the tool result is returned unchanged and without error.
- [x] A contract suite case, against both stores, shows that recording usage for three facts sets their time and raises each count by one, in one call, and that `listAuditEntries` for each fact returns the same entries as before.
- [x] A contract case shows usage recorded for a fact of another namespace, or for an unknown fact, changes nothing and returns no error.
- [x] A SQLite adapter test shows the row counts of `fact`, `source`, `entity` and `audit_log` are unchanged by a usage write.
- [x] A test shows `get_fact_history` records no usage.
- [x] The test over stdio of the `recall` tool (FL-058) still passes.
- [ ] The owner records the two timings of technical requirement 5 in `OPEN-QUESTIONS.md`.
- [x] `pnpm check` exits 0.

**Validation.** Unit tests of `recall` and of the handler. The contract suite against both stores. The stdio test of the `recall` tool. The owner's timing run. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the updated `INTERFACES.md`, `SCHEMA.md` and `MCP-TOOLS.md`; the timings added to `OPEN-QUESTIONS.md`.

**Recorded evidence.** Done on 2026-11-17 on Linux x64 with Node.js v22.23.4, after `feat(storage): add the fact usage migration`, in three commits, each checked on its own: `feat(core): add usage tracking to both stores`, `feat(mcp-server): record the usage of recalled facts after recall`, and `docs: record the first usage timings in Q-11`. The item is `Under Review` until the owner repeats the timing of technical requirement 5; the agent ran it once in process.

The migration is `0006_add_fact_usage.sql`, sha256 `239231e00a1f217b00cad12954da7f9c8dc27c40cfa4148a16b7e2661c0da2c0`. It adds `fact_usage`, one row per fact updated in place, and `fact_usage_tracking`, the time of a namespace's first usage write, which tells "never used" from "not yet counted". The purge inventory classifies their five text columns as not content.

`MemoryStore` gains three methods, in both stores, in `INTERFACES.md` and the parity test, with the core schema `FactUsage`:

- **`recordFactUsage({ namespace, factIds, recalledAt })`** writes, outside `commit` and with no audit entry. In SQLite it is one batched `INSERT ... ON CONFLICT DO UPDATE` over the facts of the namespace, plus the first-write time, in one transaction. The in-memory store keeps usage beside its state, not in it.
- **`getFactUsage`** reads one fact's usage.
- **`getUsageTrackingStart`** reads when counting began.

The `recall` tool calls `recordFactUsage` after its result is produced, without waiting, and logs and drops a failure. No other tool, operation or eval calls it. `MCP-TOOLS.md`, "What a handler does", says so.

Tests:

- **`recall` is still a pure read.** A unit test records the shop timeline and recalls: every fact row, every fact's audit entries and usage, and the tracking start are identical before and after. A SQLite adapter test dumps every row of every table, and the dump is the same before and after the keyword lane, the vector lane and a touching read.
- **The tool handler, in `recall-usage.test.ts`.** After one call the returned fact has a count of 1 and the call's time; after a second, 2. With a store whose usage write fails, the tool result is the same as without the failure and is not an error. `get_fact_history` records no usage.
- **Contract cases, against both stores:**
  - **W1:** three facts recorded twice have a count of 2 and the second time; their audit entries are unchanged; the tracking start is the first write's time.
  - **W2:** an unknown fact changes nothing.
  - **W3:** a fact never recalled has none.
  - **N8:** a fact of the other namespace is skipped, and usage is not read across namespaces.

  The counts rise to 66 and to 27 and 28.
- **Row counts.** A SQLite adapter test shows the rows of `fact`, `source`, `entity`, `fact_source`, `fact_embedding` and `audit_log` unchanged by a usage write.
- **Over stdio.** The recall tool's test over stdio (FL-058) still passes.

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| SQLite's usage write ignores the namespace | N8 |
| SQLite's count is not raised | W1 |
| The recall tool records no usage | The count test of the handler |

The timing of technical requirement 5 was run once by the agent, in process, not with a separate server:

- **Setup.** A SQLite file in WAL mode with 10,000 facts from the benchmark's synthetic namespace; 100 `recall` tool calls through an in-process MCP client, in three alternating rounds after a warm-up.
- **Off:** 1,844, 1,915 and 1,940 ms.
- **On:** 2,107, 2,197 and 2,114 ms, about 2 ms or 10% more per call.
- **Limits.** One process wrote, so this measures the cost of the write, not contention. The numbers are in Q-11, labelled as one run by the agent, and the script was not kept.

`pnpm check`:

```text
 Test Files  90 passed (90)
      Tests  940 passed (940)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the third commit: https://github.com/Johnmark-Tech/factloom/actions/runs/43998180414.

For the owner's review: repeat the timing with the server running against a database of 10,000 facts, on the Mac, and record both numbers in Q-11.

### FL-065: Archive and unarchive operations

| | |
|---|---|
| Status | Completed |
| Phase | 3 |
| Depends on | FL-055, FL-058 |
| Requirements | REQ-23, REQ-24 |
| Components | `@factloom/core` (operations, in-memory store), `@factloom/storage` (migration, adapter, contract suite) |

**Objective.** Add the operations that archive and unarchive facts, audited and reversible, with the record of archiving kept beside the fact row.

**Background.** An **archived fact** is a live fact left out of recall by default because it has not been used ([`GLOSSARY.md`](../../../GLOSSARY.md)). FL-055 records when each fact was last recalled. The [research on decay](../../research/technical/memory-decay-and-consolidation.md) gives the position this item follows: archiving is about tidiness and never changes what Factloom believes. Unlike a usage count, archiving changes what recall returns, so it goes through `commit` and has audit entries.

The original item was split to fit one session. This one adds the operations and their storage. Leaving archived facts out of recall, the `recall` option and tool input, and the archiving job are FL-073. A fact is unarchived only by the explicit operation: recalling an archived fact does not unarchive it, because that would put a rule about facts into the `recall` handler ([`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "What a handler does").

**Outcome.** A caller can archive live facts and unarchive one, and every read can tell whether a fact is archived. Nothing about the fact row changes, and the audit log shows each step.

**Scope.**
- The migration that adds the record of archiving.
- Operations that archive and unarchive (proposed: `archiveFacts`, `unarchiveFact`), with `Change` kinds, an `Operation` name (proposed: `archive`), `AuditAction` values (proposed: `fact.archived`, `fact.unarchived`) and reason codes (proposed: `unused`, `requested`).
- The archived state on a returned fact (proposed: an `archivedAt` value beside the fact).

**Non-goals.**
- Recording usage: FL-055.
- Leaving archived facts out of recall, the `recall` option, and the archiving job: FL-073. In this item every read still returns archived facts.
- Unarchiving a fact when it is recalled. A fact is unarchived only by `unarchiveFact`.
- Any use of usage or age in ranking.
- Removing archived facts from the keyword and vector entries, or removing any row.
- An MCP tool to archive or unarchive.

**Functional requirements.**
1. `archiveFacts` marks live facts as archived, in one commit, with one audit entry for each. `unarchiveFact` reverses it, with an audit entry. Neither changes the fact row, its identifier, its `invalidated_at` or its valid time. Errors: `invalid_input`, `not_found`, `already_invalidated`, `storage_failed`; archiving an archived fact, or unarchiving one that is not, is `already_exists`.
2. Every read returns archived facts in this item, and a returned fact says whether it is archived and since when.
3. An archived fact still counts for the single-value rule: a commit that records a second open-ended value for a single-valued predicate still fails with `conflict` when the existing fact is archived.
4. The reason code of an archive or unarchive is given by the caller: `unused` for the job of FL-073, `requested` otherwise.

**Technical requirements.**
1. Archiving and unarchiving are changes to what recall returns and go through `commit`, each with an audit entry ([ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md)).
2. The record of archiving is rows in a side table, added and closed like `entity_merge`, so that the fact row stays immutable and the history of archiving is kept.
3. The in-memory store implements the same behaviour, so the contract suite runs against both stores.
4. The schema inventory test of FL-061 classifies the new columns as "not content".
5. The migration carries a comment on what the Postgres version will do differently.

**Constraints.**
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md): archiving is not a change to the fact row, and is not an invalidation.
- [`GLOSSARY.md`](../../../GLOSSARY.md): an archived fact is still a live fact.

**Acceptance criteria.**
- [x] A contract case, against both stores, shows archive then unarchive leaves the fact row unchanged, writes two audit entries with operation `archive`, and that `getFact` reports the fact archived after the first and not after the second.
- [x] A contract case shows a commit that records a second open-ended value for a single-valued predicate still fails with `conflict` when the existing fact is archived.
- [x] Contract cases cover the refusals: archiving an archived fact is `already_exists`; unarchiving a fact that is not archived is `already_exists`; archiving an invalidated fact is `already_invalidated`; a fact in another namespace is `not_found`.
- [x] A SQLite adapter test opens a database created by the earlier migrations only, applies the new one, and archives an existing fact.
- [x] `git grep -n "unarchiveFact" -- apps/mcp-server/src` shows no call in the `recall` tool handler.
- [x] `pnpm check` exits 0.

**Validation.** The contract suite against both stores. A SQLite adapter test of the migration. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the updated `INTERFACES.md` and `SCHEMA.md`.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in three commits:

1. `docs: design archiving and unarchiving facts in INTERFACES.md`;
2. `feat(core): add archiving and unarchiving of facts in both stores`;
3. `docs: describe fact_archive in SCHEMA.md`.

The item was started while FL-055, on which it depends, was `Under Review`. FL-055's code is complete: only the owner's repeat of the usage timing remains, and this item does not change usage.

Built:

- **The vocabulary.** `Operation` `archive`; `AuditAction` `fact.archived` and `fact.unarchived`; reason codes `unused` and `requested`; the changes `archive_fact` and `unarchive_fact`.
- **The operations.** `archiveFacts` archives several live facts in one commit, with one audit entry each. `unarchiveFact` ends one archiving. Both are in `@factloom/core`, and the caller gives the reason code.
- **The returned fact.** `FactWithSources.archivedAt` is the start of the archiving in force, or null. Every read in both stores returns it. In SQLite it is one extra query per read, for any number of facts. The parity test of `INTERFACES.md` covers it.
- **The migration.** `0008_add_fact_archive.sql`, sha256 `851c3802f02121f2db63ba6a362ce81082fa982f0aeb1d9f4d9dd0bdab06bbaf`, holds:
  - the table;
  - a partial unique index so that a fact has at most one archiving in force;
  - a trigger that refuses a delete, and one that refuses every update but setting `unarchived_at` once;
  - the comment on Postgres.

  The purge inventory of FL-061 lists its five columns as not content.
- **The fact row is not changed** by either operation. The single-value rule still reads only fact rows, so an archived fact keeps counting.

Contract cases, against both stores:

- **H1:** archive and then unarchive leaves the fact row as it was. It writes two audit entries with operation `archive` and the same `archiveId`. `getFact` and `listFacts` report the fact archived, and `getFact` reports it not archived after the unarchive.
- **H2:** with `pg16` archived, recording a second open-ended database version fails with `conflict`.
- **H3:** archiving an archived fact is `already_exists`.
- **H4:** unarchiving a fact that is not archived is `already_exists`.
- **H5:** archiving an invalidated fact is `already_invalidated`, naming its successor.
- **N12:** archiving or unarchiving a fact of the other namespace is `not_found`.

The counts are 86 for group 1, and 39 (in-memory) and 41 (SQLite) for group 2.

Other tests:

- **SQLite, in `fact-archive-migration.test.ts`:** the triggers refuse a delete, a change of `archived_at` and a second unarchive. A database made by migrations 1 to 7, with a fact in it, takes migration 8 and the fact is archived.
- **The operations, with the in-memory store:** two facts are archived in one commit and one is unarchived. A batch that names a missing fact archives nothing.
- **The handler check:** `git grep -n "unarchiveFact" -- apps/mcp-server/src` finds nothing (exit 1).

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| The in-memory store archives an invalidated fact | H5 |
| The in-memory store archives a fact twice | H3 |
| SQLite reads leave out `archivedAt` | H1, H3 |
| SQLite unarchives a fact that is not archived | H4 |

`pnpm check`:

```text
      Tests  1061 passed (1061)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the third commit, which holds the code of the second, with both clean installs: https://github.com/Johnmark-Tech/factloom/actions/runs/44006607723.

Differences from the item:

- **The archived state is `archivedAt` on `FactWithSources`**, beside the fact, as proposed. The `Fact` itself is not changed.
- **The audit entries carry `{ archiveId }`.** The unarchive entry names the archiving it ends.

### FL-073: Archived facts left out of recall, and the archiving job

| | |
|---|---|
| Status | Completed |
| Phase | 3 |
| Depends on | FL-065, FL-048, FL-058 |
| Requirements | REQ-23, REQ-03, REQ-24 |
| Components | `@factloom/core` (in-memory store), `@factloom/storage` (lanes, one read, contract suite), `@factloom/graph-rag` (`recall` option), `packages/maintenance` (job), `apps/mcp-server` (`recall` tool input, wiring) |

**Objective.** Leave archived facts out of recall by default, let a caller include them, and archive facts that have gone unused for a configured period with a job in the maintenance run.

**Background.** This item is the second part of FL-065, which added the operations `archiveFacts` and `unarchiveFact` and the record of archiving. FL-055 records when each fact was last recalled, and the maintenance run of FL-048 is where the job is registered. The [research on decay](../../research/technical/memory-decay-and-consolidation.md) names the main risk of archiving: a true fact that is rarely used. Open question Q-57 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) asks what period suits code memory; the research's 180 days is a placeholder. A fact comes back to default recall only when it is unarchived by the explicit operation, never because it was recalled.

**Outcome.** Default recall stops offering facts nobody has used for a long time. Nothing is lost: an archived fact is still live, still in fact history, still returned when asked for with a date or with the option, and comes back to default recall when it is unarchived.

**Scope.**
- The retrieval lanes leaving out archived facts when the caller asks only about now, in both stores.
- An option on `recall` to include them, and the matching input of the `recall` tool.
- One read of facts to consider for archiving, in both stores.
- The archiving job, registered in the maintenance run, and the archiving period as configuration.

**Non-goals.**
- Unarchiving a fact when it is recalled. A fact is unarchived only by `unarchiveFact` (FL-065).
- Any use of usage or age in ranking.
- Verifying a fact before archiving it.
- An MCP tool to archive or unarchive.

**Functional requirements.**
1. The three retrieval lanes leave out archived facts when the caller asks only about now. `recall` includes them when an as-of or known-at date is given, or when its new option is set (proposed: `includeArchived`, `include_archived` on the tool, default false).
2. Every other read returns archived facts: `getFact`, `listFacts` for conflict candidates and fact history, `listStaleFacts`.
3. A `recall` result that includes an archived fact says so, with the `archivedAt` value of FL-065.
4. The job archives a fact when all of these hold: it is a current fact; it is not archived; it was recorded more than the archiving period ago; and it has no usage within the period.
5. No fact is archived for disuse until a full archiving period has passed since usage tracking began in that database, which the store of FL-055 keeps.
6. Under policy `human_approval` the job archives nothing and reports the facts it would have archived, counted as flagged.
7. Changes made by the job carry the trigger `maintenance` and the reason code `unused`.
8. The `recall` tool handler only translates `include_archived` and calls the use case. It records usage as FL-055 specifies and calls no other operation.

**Technical requirements.**
1. The archiving period is configuration with a default of 180 days, labelled in the configuration table of `MCP-TOOLS.md` as a placeholder until Q-57 is answered.
2. Requirement 5 is met inside each store. The job is given no date to pass.
3. The job reads the facts to consider through one read method added to `MemoryStore` in both stores (proposed: `listUnusedFacts`, with a date and a limit), which is one indexed query in the SQLite adapter.
4. Leaving archived facts out is a further filter in the lanes, applied with the time predicate before the limit, as [ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md) requires of the time filter.

**Constraints.**
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "The time predicate": archiving does not alter the four conditions. It is a further filter in the lanes, used only for a question about now.
- [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "What a handler does": the handler holds no rule about facts.
- [`GLOSSARY.md`](../../../GLOSSARY.md): an archived fact is still a live fact.

**Acceptance criteria.**
- [x] Contract cases, against both stores, with a fixed clock: an archived fact is not returned by either search lane or by `listFacts` with `touchingEntityIds` when archived facts are excluded, and is returned by each when they are included; `getFact` returns it; `listFacts` by subject and predicate returns it.
- [x] A contract case shows that with a limit of 1, a lane returns a matching fact that is not archived although an archived fact matches better: the filter runs before the limit.
- [x] A unit test of `recall` shows an archived fact is left out by default, returned with `includeArchived`, and returned when an as-of date is given.
- [x] A test of the `recall` tool handler shows that an archived fact returned with `include_archived` is still archived afterwards, and that no audit entry was written by the call.
- [x] Unit tests of the job with a fixed clock: a current fact recorded 200 days ago with no usage is archived; one recalled 10 days ago is not; an ended fact is not; a fact recorded 10 days ago is not.
- [x] A unit test shows that in a store whose usage tracking began 30 days ago, a fact recorded 200 days ago is not archived.
- [x] A unit test shows that under `human_approval` nothing is archived and the fact is counted as flagged.
- [x] Every audit entry written by the job has trigger `maintenance` and reason code `unused`.
- [x] A test of the tool list shows the `recall` tool's input schema includes `include_archived` with a description, and the stdio test of the `recall` tool (FL-058) still passes.
- [x] `pnpm check` exits 0.

**Validation.** Unit tests of `recall`, the handler and the job. The contract suite against both stores. `pnpm check`.

**Completion evidence.** The commit; the passing check output; the updated `INTERFACES.md`, `SCHEMA.md` and `MCP-TOOLS.md`.

**Recorded evidence.** Completed on 2026-11-17 on Linux x64 with Node.js v22.23.4, in eight commits and this record:

1. `docs: design leaving archived facts out of recall and listing unused facts in INTERFACES.md`;
2. `feat(core): leave archived facts out of the lanes on request, and add listUnusedFacts, in both stores`;
3. `feat(graph-rag): leave archived facts out of recall for a question about now, unless includeArchived`;
4. `feat(mcp-server): add include_archived to the recall tool and archived_at to its output`;
5. `feat(maintenance): add the job that archives unused facts`;
6. `feat(mcp-server): run the archiving job in maintenance, after FACTLOOM_ARCHIVE_AFTER_DAYS`;
7. `docs: add include_archived, archived_at and FACTLOOM_ARCHIVE_AFTER_DAYS to MCP-TOOLS.md`;
8. `docs(mcp-server): describe the archiving job`;

The item was started while FL-048, on which it depends, was `Under Review`. Only the owner's run of the session start hooks remains there.

Built:

- **The filter in the lanes.** `searchFactsByVector`, `searchFactsByKeyword` and `listFacts` take an optional `excludeArchived`. The stores apply it with the time predicate, before the limit: in SQLite it is a `NOT EXISTS` on the archiving in force in the same query; in `listFacts` it is one more fixed fragment of the query's shape. Every other read returns archived facts.
- **`recall`** gains `includeArchived`. It passes `excludeArchived` to all three lanes, the graph lane included, only when neither an as-of nor a known-at date is given and `includeArchived` is not set. The result's facts carry `archivedAt` from FL-065.
- **The tool.** `recall` takes `include_archived`, with a description, and returns `archived_at` for each fact. The handler only translates the option and records usage, as FL-055 specifies.
- **`listUnusedFacts`**, added to `MemoryStore` in both stores, returns the current facts at a moment that are not archived, were recorded before a date and were not recalled since it. It returns nothing until usage tracking began on or before that date, so requirement 5 is met inside each store. In SQLite it is one query.
- **The job.** `archiveUnusedFacts` archives each fact `listUnusedFacts` returns, one commit each, with trigger `maintenance` and reason `unused`. Under `human_approval` it archives nothing and reports each one as flagged. It is registered last, as `archive_unused_facts`.
- **The period.** `FACTLOOM_ARCHIVE_AFTER_DAYS`, a whole positive number with a default of 180, is labelled in `MCP-TOOLS.md` as a placeholder until Q-57 is answered.

Contract cases, against both stores, with a fixed clock (as of now and known at now):

- **Y1:** with `pg16` archived, the keyword lane, the vector lane and `listFacts` with `touchingEntityIds` leave it out when asked, and return it otherwise. `getFact` returns it with its `archivedAt`, and `listFacts` by subject and predicate returns it.
- **Y2:** with a limit of 1, the vector lane returns `node22` although the archived `pg16` is nearer.
- **Y3:** `listUnusedFacts` returns nothing before usage tracking began, `pg16` once tracking began before the date, nothing for a date before tracking began, and nothing once `pg16` is archived.

The count of group 1 is now 89.

Other tests:

- **`recall`, unit tests:** an archived fact is left out by default, and returned with `includeArchived` and with an as-of date. A second test, with only the graph lane weighted, shows the graph lane leaves it out too; the default weights give that lane 0, so no other test could see it.
- **The tool:**
  - an archived fact is left out by default;
  - with `include_archived` it is returned with its `archived_at`;
  - it is still archived afterwards, and the call wrote no audit entry;
  - the tool list shows `include_archived` with a description;
  - the stdio test of FL-058 still passes.
- **The job, unit tests with a fixed clock:**
  - a current fact recorded 200 days ago and never recalled is archived, with trigger `maintenance` and reason `unused`;
  - none is archived that was recalled 10 days ago, has ended, or was recorded 10 days ago;
  - nothing is archived when tracking began 30 days ago;
  - under `human_approval` nothing is archived and the fact is flagged.
- **The configuration:** `FACTLOOM_ARCHIVE_AFTER_DAYS` is read, and a value that is not a whole positive number is refused with `invalid_input`.

Rules broken by hand, each then restored:

| Break | Tests that failed |
|---|---|
| `recall` leaves archived facts out of dated questions too | the recall unit test |
| The graph lane ignores the filter | the graph-lane unit test |
| The job ignores `human_approval` | the human-approval test |
| The in-memory store ignores when tracking began | the 30-day test and Y3 |
| The in-memory store ignores recent usage | the 200-day test, the human-approval test and Y3 |

The first graph-lane break passed the default-settings test. That is why the test with only the graph lane weighted was added.

`pnpm check`:

```text
      Tests  1074 passed (1074)
```

The workflow run on Linux and macOS arm64, with Node.js 22 and 26, passed at the sixth commit, which holds all of the code: https://github.com/Johnmark-Tech/factloom/actions/runs/44008028719.

Differences from the item:

- **The filter is an optional input** of the three store reads, `excludeArchived`, so that their other callers are unchanged.
- **`archived_at` is in the `recall` output only.** The other tools' fact output is unchanged.
- **The archiving is one commit per fact**, so that a fact invalidated meanwhile does not stop the others.
