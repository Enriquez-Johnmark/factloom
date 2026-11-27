# EPIC-03: SQLite storage

| | |
|---|---|
| Status | Pending |
| Phases | 0-1 |
| Packages | `packages/storage` |
| Requirements | REQ-01, REQ-02, REQ-03, REQ-04, REQ-06, REQ-07, REQ-08, REQ-09, REQ-11, REQ-15, REQ-25, REQ-35 |

Nothing in this epic is implemented. Terms are used as defined in [`GLOSSARY.md`](../../../GLOSSARY.md).

## Outcome

Memory persists in one SQLite file. `@factloom/storage` implements `MemoryStore` on that file: one commit writes facts, sources, embeddings and audit entries together and enforces the single-value rule, and every read applies the same time predicate. One contract suite defines what any `MemoryStore` must do, and both the in-memory store and the SQLite adapter pass it, so a use case tested against one behaves the same on the other.

## Scope

- The storage contract suite, `describeMemoryStoreContract`, which is also Layer A of the eval set ([`TESTING.md`](../../architecture/TESTING.md)).
- The migration runner and the first migration, with the DDL of [`SCHEMA.md`](../../architecture/SCHEMA.md).
- `openSqliteMemoryStore`: connection settings, `commit`, the structural reads, the keyword lane and the vector lane.
- Adapter tests for what the interface does not describe: migrations, triggers, connection settings.

## Out of scope

- Redesigning the schema. The DDL in `SCHEMA.md` was run with 31 passing checks ([spike](../../../spikes/fact-schema/README.md)); this epic builds the adapter around it.
- Decisions about facts. The adapter enforces rules and makes no choice: operations in [EPIC-02](EPIC-02.md), use cases in EPIC-04 and EPIC-05.
- The graph lane and rank fusion. The graph lane is `listFacts` with `touchingEntityIds`, called by `recall` (FL-031); fusion is FL-030.
- The tables of later phases: `fact_confidence` (FL-045), `feedback` (FL-046), purge (FL-061), `fact_verification` (FL-049), `entity_merge` (FL-052), `fact_usage` (FL-055) and the record of archiving (FL-065).
- A Postgres adapter: EPIC-10.
- An approximate vector index. [ADR 0008](../../architecture/adr/0008-vector-search-on-a-plain-table.md) says when to measure again.

## Boundaries and constraints

- **`storage` imports `@factloom/core`, `better-sqlite3` and `sqlite-vec`**, and never `@factloom/graph-rag` or an LLM, embedding or MCP library ([`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md)). Its one export is `openSqliteMemoryStore`.
- **SQLite first, hand-written SQL, no ORM** ([ADR 0005](../../architecture/adr/0005-sqlite-first-with-hand-written-sql.md)). Parameters are always bound, and each statement is prepared once ([data rules](../../../.claude/rules/data.md)).
- **A fact row changes only by being invalidated once** ([ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md)). No trigger is weakened or dropped.
- **Timestamps are fixed-width UTC text**, passed in as parameters and never produced in SQL ([ADR 0007](../../architecture/adr/0007-timestamps-as-fixed-width-utc-text.md)).
- **The vector lane runs on an ordinary table** with `vec_distance_cosine()` and the time predicate in the same query ([ADR 0008](../../architecture/adr/0008-vector-search-on-a-plain-table.md)).
- **One commit is one transaction**, and the single-value rule is checked inside it ([ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md)).
- **Every query filters on the namespace** ([ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md)).
- **The time filter is applied inside each lane, before the limit** ([ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md)).
- **Migrations are numbered, forward only, and never changed after release** ([`SCHEMA.md`](../../architecture/SCHEMA.md), "Migrations").

## Dependencies

- [EPIC-01](EPIC-01.md): the workspace (FL-001).
- [EPIC-02](EPIC-02.md): the `Result` type (FL-004) and timestamps (FL-005), which the migration runner uses; the `MemoryStore` interface, the change-set schema, `normaliseEntityName` and the in-memory store with its two lanes (FL-007, FL-056), which the contract suite runs against first.

## Deliverables

- `describeMemoryStoreContract`, with the numbered cases of FL-012 and FL-067.
- `0001_initial.sql` and the migration runner.
- `openSqliteMemoryStore`, passing every group of the contract suite.
- Adapter tests for migrations, triggers and connection settings, and a test with two processes writing to one file.

## Success criteria

- Every case of the contract suite passes against the in-memory store and against the SQLite adapter, in `pnpm check`.
- Historical accuracy on Layer A is 1: every time-table case passes ([`TESTING.md`](../../architecture/TESTING.md), "What is measured").
- Two stores opened on one database file cannot both commit a different open-ended value for the same subject and single-valued predicate: exactly one commit succeeds and the other returns `conflict`.
- A file written by one process is read by another after the first has closed: the facts, sources and audit entries are the same.
- The budgets of REQ-35 for `recall` and `record_fact` are met on namespaces of 10,000 and 100,000 facts, as measured by the benchmark of FL-066 in EPIC-07.
- `git grep -n -i "DELETE FROM\|datetime('now')\|CURRENT_TIMESTAMP" -- packages/storage` shows no match outside test files that prove a trigger refuses.

## Work items

| ID | Title | Phase | Depends on | Status |
|---|---|---|---|---|
| FL-012 | Storage contract suite: fixture, time, reads, commit and refusals | 0 | FL-007 | Completed |
| FL-067 | Storage contract suite: single-value rule, namespaces and search lanes | 0 | FL-012, FL-056 | Completed |
| FL-013 | Migration runner and the first migration | 1 | FL-001, FL-004, FL-005 | Completed |
| FL-014 | SQLite store: opening, connection settings and commit | 1 | FL-002, FL-012, FL-013 | Completed |
| FL-068 | SQLite single-value rule, error mapping and two writers on one file | 1 | FL-014, FL-067 | Completed |
| FL-015 | SQLite structural reads with the time predicate | 1 | FL-014, FL-068 | Completed |
| FL-016 | Keyword lane on FTS5 | 1 | FL-015 | Completed |
| FL-017 | Vector lane on a plain table, with model checking | 1 | FL-002, FL-015 | Completed |
| FL-086 | Two processes opening a new database at once | 1 | FL-013, FL-014, FL-068 | Completed |
| FL-087 | The lock error on first open on macOS | 1 | FL-086 | Completed |

### FL-012: Storage contract suite: fixture, time, reads, commit and refusals

| | |
|---|---|
| Status | Completed |
| Phase | 0 |
| Depends on | FL-007 |
| Requirements | REQ-02, REQ-03, REQ-04, REQ-06, REQ-07, REQ-08, REQ-09, REQ-30 |
| Components | `packages/storage` |

**Objective.** Write the first half of the one test suite that defines what any `MemoryStore` must do: its fixture, and the cases for time, structural reads, commit and refusals. Pass it against the in-memory store.

**Background.** [`TESTING.md`](../../architecture/TESTING.md), "Contract tests", lists the least the suite must cover. The same cases are Layer A of the eval set: about 30 cases with facts written directly and no LLM, which is enough to judge phase 1 on time semantics. The [fact-schema spike](../../../spikes/fact-schema/README.md) proved the time predicate and the overlap query with hand-written SQL on a toy timeline. It did not prove that a write path calls them. This suite turns the spike's assertions into cases that go through `commit` and the read methods, so they hold for every adapter.

The suite lives in `@factloom/storage`, where a test framework is already a development dependency, and moves to a shared place when a second adapter exists. The suite was split to fit one session. This item needs `commit` and the structural reads of the in-memory store (FL-007). The cases for the single-value rule, namespaces and the two lanes are FL-067, which also needs the lanes of FL-056.

**Outcome.** An engineer who writes a storage adapter gets the first half of its specification as a runnable suite, with the fixture and the group options that FL-067 extends. The SQLite adapter (FL-014 to FL-017) is built against it.

**Scope.**
- `describeMemoryStoreContract(name, createStore, options)`, internal to `storage`.
- A fixture builder that writes the spike's timeline through `commit`.
- The cases listed below, each a test whose name is a sentence.
- A test file that runs the suite against `createInMemoryStore()`.
- Corrections to the in-memory store where the suite finds it wrong.

**Non-goals.**
- The cases for the single-value rule, namespaces, two stores on one file, the keyword lane and the vector lane: FL-067.
- Running against SQLite: FL-015 to FL-017 turn the groups on.
- Tests of migrations, triggers and connection settings. They are adapter tests: FL-013 and FL-014.
- Cases for phase 2 and 3 changes.
- Fact operations and use cases. The suite calls only `MemoryStore` methods.

**Functional requirements.**

1. The fixture is the spike's timeline in the namespace `repo:example`, written with three commits. Vectors have four dimensions.
   - 2026-01-10, `remember`: the entity `example` of type `repository`; a source; `pg14`, PostgreSQL 14, valid from 2025-06-01, open; `node20`, Node 20, start unknown, open. Both predicates are single-valued.
   - 2026-04-02, `succession`: a second source; `pg14-ended`, the copy of `pg14` ending 2026-03-15, with both sources and the vector copied from `pg14`; `pg14` invalidated and linked to `pg14-ended`; `pg16`, valid from 2026-03-15, open.
   - 2026-05-01, `correction`: a third source; `node22`, start unknown, open; `node20` invalidated and linked to `node22`.
2. The suite is split into four groups, so that an adapter under construction can turn them on one by one: time, reads, commit and refusals; single-value rule and namespaces; keyword lane; vector lane. `options` names the groups to run and defaults to all. An adapter is complete only when it runs all four. This item writes the first group and the option; FL-067 writes the other three.
3. Group "time, reads, commit and refusals" has these cases.

   Time table, read with `listFacts` for the namespace. Every case states both dates. "Now" is 2026-11-13.

   | Case | As-of date | Known-at date | Facts returned |
   |---|---|---|---|
   | T1 | now | now | `node22`, `pg16` |
   | T2 | 2026-02-01 | now | `node22`, `pg14-ended` |
   | T3 | 2026-03-15, the day of the upgrade | now | `node22`, `pg16` |
   | T4 | 2026-02-01 | 2026-02-01 | `node20`, `pg14` |
   | T5 | 2026-04-01 | 2026-04-01 | `node20`, `pg14` |
   | T6 | 2026-04-10 | 2026-04-10 | `node20`, `pg16` |
   | T7 | 2026-01-01 | 2026-01-01 | none |
   | T8 | 2026-04-02 | 2026-04-02T00:00:00.000Z, the instant of the succession | `node20`, `pg16` |

   T3 is the boundary of valid time: a fact is not valid at its own `validTo`. T8 is the boundary of recorded time: a fact is believed from its `createdAt` and no longer at its `invalidatedAt`.

   Structural reads:
   - R1. `getFact` returns an invalidated fact, with its supersession link.
   - R2. `getFact` returns a fact with its subject and all its sources: `pg14-ended` has two.
   - R3. `getFact` returns `null` for an unknown identifier.
   - R4. `listFacts` with `'all'` for the database predicate returns `pg14`, `pg14-ended` and `pg16`.
   - R5. `listFacts` with `supersededByFactId: pg14-ended` and `'all'` returns `pg14`.
   - R6. `listFacts` with a subject and a predicate returns only facts that match both.
   - R7. `listFacts` with `touchingEntityIds` returns a fact whose object is that entity and a fact whose subject is that entity. This case adds one fact with an entity as its object, and its result carries `objectEntity`.
   - R8. `listFacts` returns facts with different `createdAt` newest first, and no more than `limit`.
   - R9. `findEntities` matches the normalised name: `"  EXAMPLE "` finds `example`. With `type: null` it returns entities of every type that have the name.
   - R10. A read with a limit below 1 returns `invalid_input`.
   - R11. `listFacts` with `'live'` for the database predicate returns `pg14-ended` and `pg16`, and not `pg14`: every live fact at any valid time, and no invalidated one.
   - R12. `getSource` returns the second source of the fixture by its identifier, with its kind, locator, version, content and times.
   - R13. `getSource` returns a source that no fact is linked to. This case commits one source alone.
   - R14. `getSource` returns `null` for an unknown identifier.

   Commit:
   - C1. A change set whose last change fails applies none of its changes: no entity, source, fact or audit entry from it can be read afterwards.
   - C2. The succession commit wrote one audit entry per change, in the order the change set lists them, sharing one operation identifier, and the receipt's count equals the number of changes.
   - C3. `listAuditEntries` for `pg14` returns its `fact.recorded` and `fact.invalidated` entries in order, the second with the operation `succession` and the detail `{ supersededByFactId: pg14-ended }`.
   - C7. `detail` is as `INTERFACES.md` fixes it for each action: `{ revisesFactId: pg14 }` on the `fact.recorded` entry of `pg14-ended`; `null` on the `fact.recorded` entry of `pg16`; `{ sourceId }` on a `fact.source_attached` entry; `null` on `entity.created` and `source.recorded` entries.
   - C8. Changes apply in the order given: a change set that lists a fact before the entity it refers to returns `not_found`.
   - C4. Attaching a source to a live fact writes no fact and one audit entry, and the fact then has one more source.
   - C5. A fact recorded with `copyFromFactId` can be read, and a commit that copies from a missing fact returns `not_found`.
   - C6. The number of facts returned by `listFacts` with `'all'` never goes down: it is 5 after the fixture, and every later commit in the suite leaves it equal or higher.

   Refusals, each asserting the error code and that memory is unchanged:
   - F1. Invalidating a missing fact: `not_found`.
   - F2. Invalidating a fact twice: `already_invalidated`, with the superseding fact in `relatedFactIds`.
   - F3. Attaching a source to a fact that is no longer live: `already_invalidated`.
   - F4. A fact with no source: `invalid_input`.
   - F5. A fact whose valid period is reversed or empty: `invalid_input`.
   - F6. A change whose row carries another namespace than the change set: `invalid_input`.
   - F7. A second entity with the same type and normalised name: `already_exists`.
   - F8. A fact whose identifier is already used: `already_exists`.
   - F9. A fact whose subject entity does not exist: `not_found`.
   - F10. A fact whose source does not exist: `not_found`.

**Technical requirements.**
1. `createStore` is an asynchronous factory that returns a new, empty `MemoryStore`. Each test gets its own store and closes it.
2. The suite builds every change set by hand, with fixed identifiers and timestamps. It does not call a fact operation, a clock or an identifier generator.
3. Test names are sentences ([testing rules](../../../.claude/rules/testing.md)), and each failure asserts the error code, not the message.
4. The suite is not exported from the package entry.
5. If a case shows that [`INTERFACES.md`](../../architecture/INTERFACES.md) is silent or ambiguous, the case and the document are settled together. A case is not weakened to pass.

**Constraints.**
- [`TESTING.md`](../../architecture/TESTING.md), "Contract tests" and "Layer A".
- [Testing rules](../../../.claude/rules/testing.md): "Storage adapters share one contract suite", "Time cases are explicit".
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): `storage` may import `core`; the suite is internal.

**Acceptance criteria.**
- [x] `pnpm test` runs the first group against the in-memory store, and every case listed above passes: T1 to T8, R1 to R14, C1 to C8 and F1 to F10. The count of passing cases is recorded.
- [x] Each of the eight time-table cases is a separate test whose name states the as-of date and the known-at date.
- [x] A test of the option passes: with a group left out of `options`, none of its cases is registered.
- [x] Every correction made to the in-memory store while writing the suite is covered by a case and named in the commit message.
- [x] `pnpm check` exits 0.

**Validation.** Contract tests, run by `pnpm test` in `storage` against the in-memory store.

**Completion evidence.** The commit, the passing `pnpm check` output, and the number of contract cases run.

**Recorded evidence.** Completed on 2026-11-14, in the commit `test(storage): add the first group of the storage contract suite`. The suite is `packages/storage/src/memory-store-contract.ts`; `in-memory-store.contract.test.ts` runs it against the in-memory store.

`pnpm check`, on Linux x64 with Node.js v22.23.4, ended with:

```text
 Test Files  16 passed (16)
      Tests  209 passed (209)
```

Contract cases run against the in-memory store: 41, all passing. They are T1 to T8, R1 to R14, C1 to C8, and F1 to F10 with F5 written as two cases, one for an empty valid period and one for a reversed one. Two further tests cover the option: a store that runs the group registers 41 cases, and one with every group left out registers none.

What was found on the way:

- The suite found nothing to correct in the in-memory store.
- Vitest treats a `describe` block with no test as an error. With no group selected, the suite therefore registers nothing at all.
- `describeMemoryStoreContract` returns the number of cases each group registered. That is how the option is tested without a second test runner.
- The fixture builders (`at`, `entity`, `source`, `fact`, `recordFact`, `changeSet`, `writeTimeline`, `listFactIds`) are exported from the suite's file, inside the package, for FL-067 and for the adapter's own tests.

### FL-067: Storage contract suite: single-value rule, namespaces and search lanes

| | |
|---|---|
| Status | Completed |
| Phase | 0 |
| Depends on | FL-012, FL-056 |
| Requirements | REQ-03, REQ-04, REQ-15, REQ-25, REQ-30 |
| Components | `packages/storage` |

**Objective.** Complete the storage contract suite with the cases for the single-value rule, namespaces, two stores on one file, the keyword lane and the vector lane, and pass them against the in-memory store.

**Background.** FL-012 wrote the fixture, the group option and the first group of `describeMemoryStoreContract`. [`TESTING.md`](../../architecture/TESTING.md), "Contract tests", lists what the suite must cover as a minimum; this item covers the rest of that list. The single-value cases are the five periods the [fact-schema spike](../../../spikes/fact-schema/README.md) checked by hand, now made through `commit`. The lane cases need the two lanes of the in-memory store (FL-056). Together the two items are Layer A of the eval set.

**Outcome.** The contract suite is complete. An adapter that runs all four groups has shown everything `MemoryStore` promises in phase 1.

**Scope.**
- Three groups of the suite: single-value rule and namespaces; keyword lane; vector lane.
- The registration of the case for two stores on one file.
- The mapping from the list in `TESTING.md` to case identifiers.
- Corrections to the in-memory store where the cases find it wrong.

**Non-goals.**
- Running against SQLite: FL-015 to FL-017 turn the groups on.
- Proving that a commit waits for a lock held by another process. Case P1 proves the check inside the commit; the lock is proved by the adapter test of FL-068, with a second process.
- Ranking quality in the lanes. The suite asserts which facts a lane returns and, for the vector lane, the order of facts at clearly different distances.
- Cases for phase 2 and 3 changes.
- Fact operations and use cases. The suite calls only `MemoryStore` methods.

**Functional requirements.**
1. Every case starts from the fixture of FL-012.
2. Group "single-value rule and namespaces" has these cases.

   The single-value rule refuses, with `conflict` and the overlapping fact in `relatedFactIds`. Each records one fact for the database predicate with `singleValued: true`:
   - S1. A second open-ended value, from 2026-06-01: overlaps `pg16`.
   - S2. An older fact arriving late, 2024-01-01 to 2025-09-01: overlaps `pg14-ended`.
   - S3. A fact dated in the future, from 2027-01-01: overlaps `pg16`.
   - S4. An unknown start, ending 2025-07-01: overlaps `pg14-ended`.
   - S5. The same value again, open-ended. The store does not compare objects.
   - S6. Two overlapping facts recorded in one change set.

   The single-value rule allows:
   - A1. Periods that only touch: 2024-01-01 to 2025-06-01 is accepted.
   - A2. A multi-valued predicate: two open-ended facts with `singleValued: false` are both accepted.
   - A3. A change set that invalidates a fact and records its replacement together, which the fixture's correction already is.
   - A4. An open-ended fact for the same subject and another predicate.

   Namespaces. The fixture is written a second time in `repo:other`, with its own identifiers:
   - N1. No read in one namespace returns a row of the other: `listFacts`, `getFact`, `findEntities`, `getSource`, `listAuditEntries`.
   - N2. Invalidating a fact of the other namespace returns `not_found`.
   - N3. A fact whose subject, object or source belongs to the other namespace returns `not_found`.
   - N4. A supersession link to a fact of the other namespace returns `not_found`.
   - N5. The same entity name and type in both namespaces is accepted, and S1 in one namespace is not caused by a fact in the other.

   Two stores on one file. This case is registered only when `options` supplies a function that opens two stores on the same database file, so it does not exist in a run against the in-memory store:
   - P1. Each store commits a different open-ended value for the same subject and single-valued predicate, one after the other. Exactly one commit succeeds, and the other returns `conflict`. The two commits are sequential in one process, so this case proves that the check reads what another connection committed. It does not prove the write lock.

3. Group "keyword lane":
   - K1. For the text `postgresql`, now: `pg16` and no other fact.
   - K2. The same text as of 2026-02-01, known now: `pg14-ended`.
   - K3. The same text as of 2026-02-01, known at 2026-02-01: `pg14`.
   - K4. A text that matches nothing returns an empty list.
   - K5. Nothing is returned from the other namespace.
4. Group "vector lane", with the query vector of `pg14`:
   - V1. Now, with a limit of 1: `pg16`, although `pg14` and `pg14-ended` are nearer. The time filter is applied before the limit.
   - V2. As of 2026-02-01, known now, limit 1: `pg14-ended`.
   - V3. Now, with a limit of 10: `pg16` before `node22`.
   - V4. Nothing is returned from the other namespace.
   - V5. A query vector of the wrong size returns `invalid_input`.
   - V6. A commit with a vector whose size differs from the vectors already held returns `embedding_model_mismatch`, and memory is unchanged.

**Technical requirements.**
1. The cases use the factory, the fixture builder and the group option of FL-012, and follow its rules: change sets built by hand, test names that are sentences, the error code asserted and not the message.
2. Each refusal case also asserts that memory is unchanged: `listFacts` with `'all'` returns the same facts as before.
3. If a case shows that [`INTERFACES.md`](../../architecture/INTERFACES.md) is silent or ambiguous, the case and the document are settled together. A case is not weakened to pass.

**Constraints.**
- [`TESTING.md`](../../architecture/TESTING.md), "Contract tests" and "Layer A".
- [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md): the key and the overlap rule.
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md) and [ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md).
- [Testing rules](../../../.claude/rules/testing.md): "Storage adapters share one contract suite", "Time cases are explicit".

**Acceptance criteria.**
- [x] `pnpm test` runs all four groups against the in-memory store, and every case passes: those of FL-012, and S1 to S6, A1 to A4, N1 to N5, K1 to K5 and V1 to V6. The count of passing cases is recorded.
- [x] Case P1 is absent from the output of the run against the in-memory store, and `git grep -n "P1" -- packages/storage` shows it in the suite.
- [x] Each case in the list of [`TESTING.md`](../../architecture/TESTING.md), "The suite covers, as a minimum", maps to one or more case identifiers of FL-012 or of this item. The mapping is recorded in the suite's header comment.
- [x] Every correction made to the in-memory store while writing the cases is covered by a case and named in the commit message.
- [x] `pnpm check` exits 0.

**Validation.** Contract tests, run by `pnpm test` in `storage` against the in-memory store.

**Completion evidence.** The commit, the passing `pnpm check` output, and the number of contract cases run. [`TESTING.md`](../../architecture/TESTING.md) is corrected if the suite's signature differs from the one it shows.

**Recorded evidence.** Completed on 2026-11-14, in the commit `test(storage): add the single-value, namespace, keyword and vector groups to the contract suite`.

`pnpm check`, on Linux x64 with Node.js v22.23.4, ended with:

```text
 Test Files  16 passed (16)
      Tests  235 passed (235)
```

Contract cases run against the in-memory store, all passing:

| Group | Cases |
|---|---|
| Time, reads, commit and refusals | 41 |
| Single-value rule and namespaces | 15: S1 to S6, A1 to A4, N1 to N5 |
| Keyword lane | 5: K1 to K5 |
| Vector lane | 6: V1 to V6 |
| Total | 67 |

P1, two stores on one file, is written and is registered only when the options give a function that opens two stores on one file. The in-memory store has no file, so P1 did not run here. Its first run is against the SQLite adapter (FL-068). Any acceptance criterion of this item that depends on P1 running is met only as far as that: the case exists and is not yet exercised.

What was found on the way:

- The suite found nothing to correct in the in-memory store.
- The fixture can now be written a second time in another namespace, with a prefix on every identifier. The namespace cases and the "nothing from the other namespace" cases of both lanes use it.
- K5 and V4 assert both directions: a search in one namespace returns none of the other's facts, and a search in the other returns only its own.
- The suite's file has grown to about 1,200 lines after formatting. It is one file per the item's scope; splitting it by group is a tidy-up worth doing when the SQLite adapter starts to use it.

### FL-013: Migration runner and the first migration

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-001, FL-004, FL-005 |
| Requirements | REQ-01, REQ-02, REQ-06, REQ-08, REQ-11, REQ-25 |
| Components | `packages/storage` |

**Objective.** Create the database schema from numbered SQL files, record what was applied, and refuse a database whose history does not match the files.

**Background.** The rules are in [`SCHEMA.md`](../../architecture/SCHEMA.md), "Migrations". The DDL of the first migration is in the same document under "Tables". It is the file the [fact-schema spike](../../../spikes/fact-schema/README.md) ran, with 31 checks passing on SQLite 3.54.1 on Linux. The spike's refusals were run from a script outside the workspace; this item keeps them as adapter tests, so that a later migration cannot weaken a trigger unnoticed.

**Outcome.** Opening a new file yields the full phase 1 schema. Opening an existing file applies only what is missing. A migration file that was changed after it was applied stops the adapter with a clear error.

**Scope.**
- `better-sqlite3` and `sqlite-vec` as dependencies of `storage`, pinned exactly.
- `0001_initial.sql`, in `packages/storage/migrations/`.
- An internal migration runner and the `schema_migration` table it creates itself.
- Adapter tests of the runner, and of every refusal that the DDL enforces.

**Non-goals.**
- Changing the DDL. A difference from `SCHEMA.md` is a defect in one of the two and is settled in that document first.
- `openSqliteMemoryStore`, connection settings and `commit`: FL-014.
- Down migrations. There are none.
- Migrations for later phases, and Postgres migration files.
- A command-line tool for migrations.

**Functional requirements.**
1. Migration files are named with a four-digit number and a name: `0001_initial.sql`. The runner applies pending files in number order, each in its own transaction.
2. For each applied file the runner records its number, its name, the SHA-256 of the file's bytes and the time, in `schema_migration`.
3. On every open, the runner compares each recorded hash with the file of the same number. If they differ, or the file is missing, it applies nothing and returns `storage_failed` with a message that names the migration.
4. If the database records a migration number that no file has, the runner returns `storage_failed`: the file was written by a newer version.
5. If a migration fails part way, its transaction is rolled back, nothing is recorded for it, and later files are not applied.
6. Running the runner twice on the same database applies nothing the second time.
7. After `0001_initial.sql`, the database holds the tables, indexes, triggers and the FTS5 table of `SCHEMA.md`, and refuses everything in the list under acceptance criteria.

**Technical requirements.**
1. The versions of `better-sqlite3` and `sqlite-vec` are those the spikes ran, recorded in the [spike README](../../../spikes/sqlite-vec-fts5/README.md), "What is pinned", or newer versions read from the registry and cited, in which case the two spikes are run again with them first.
2. `0001_initial.sql` is the DDL of `SCHEMA.md` without change. It carries a comment saying what the Postgres version will do differently, as the [data rules](../../../.claude/rules/data.md) require; the content is the table "What differs in Postgres".
3. The runner takes the database handle, the directory of migration files and the current time as arguments. The time is a `Timestamp` from `core` (FL-005); no SQL function produces it. Tests point the runner at a temporary directory of files.
4. The runner returns a `Result` from `core` (FL-004). It catches what the driver throws and returns `storage_failed` with the cause.
5. Tests of the triggers and checks run SQL directly against a migrated database. This is the only place outside the adapter's own statements where a test writes SQL.
6. The runner is internal: it is not exported from the package entry.

**Constraints.**
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "Migrations" and "Rules the schema enforces".
- [ADR 0005](../../architecture/adr/0005-sqlite-first-with-hand-written-sql.md), [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md), [ADR 0007](../../architecture/adr/0007-timestamps-as-fixed-width-utc-text.md).
- [Data rules](../../../.claude/rules/data.md), "Migrations".
- [Engineering principles](../../../.claude/rules/engineering-principles.md): pinned versions, each dependency with a stated reason.

**Acceptance criteria.**
- [x] Adapter test "applies pending migrations in number order" passes, with two files in a temporary directory.
- [x] Adapter test "applies nothing when every migration is already recorded" passes.
- [x] Adapter test "refuses to continue when an applied migration file was changed" passes with `storage_failed`.
- [x] Adapter test "refuses a database that records a migration it does not have" passes.
- [x] Adapter test "leaves no trace of a migration that fails part way" passes.
- [x] Adapter test "records the number, name, hash and time of each migration" passes.
- [x] A comparison test passes: the SQL statements of `0001_initial.sql` equal the statements in the "Tables" block of `SCHEMA.md`, comments and white space aside.
- [x] Adapter tests pass for each refusal the spike checked, one test per line: a fact cannot be deleted; a fact's statement, valid period or confidence cannot be changed; a fact cannot be invalidated twice or made live again; a supersession link needs an invalidation; a fact cannot supersede itself; a fact cannot be superseded from another namespace; the row number of a fact cannot be changed; a timestamp in any of the four other forms the spike uses is rejected; `valid_from` must be before `valid_to`; a fact has exactly one kind of object; a fact must refer to an existing entity when foreign keys are on; the same entity cannot be created twice in a namespace; an entity, a source and a source link cannot be changed or deleted; an audit entry cannot be changed or deleted.
- [x] Adapter test "keeps the keyword index in step with inserted facts" passes: after a fact is inserted, a `MATCH` on `fact_fts` for a word of its statement returns its row.
- [x] `pnpm check` exits 0.

**Validation.** Adapter tests in `storage`, on an in-memory SQLite database and, for the runner, a temporary directory.

**Completion evidence.** The commit and the passing `pnpm check` output, with the versions of `better-sqlite3`, `sqlite-vec` and SQLite that the tests printed.

**Recorded evidence.** Completed on 2026-11-15, in four commits: `build(storage): add better-sqlite3 13.1.1 and sqlite-vec 0.1.9`, `feat(storage): add the first migration`, `feat(storage): add the migration runner` and `test(storage): check the first migration against SCHEMA.md and its refusals`. The code is `packages/storage/migrations/0001_initial.sql` and `packages/storage/src/run-migrations.ts`, with the tests in `run-migrations.test.ts` and `initial-migration.test.ts`.

Versions. `better-sqlite3` 13.1.1 and `sqlite-vec` 0.1.9 are the versions the spikes ran. On 2026-11-15 the npm registry listed `better-sqlite3` 13.2.0 as the latest (`npm view better-sqlite3 version`); the workspace stays on 13.1.1 until the spikes are run again with a newer one. A test asserts what the migrated database reports: SQLite 3.54.1 and sqlite-vec v0.1.9. The driver ships no type declarations, so `@types/better-sqlite3` 9.6.0 was added for development; whether its declarations match the driver everywhere is open question Q-82. pnpm 12.18.0 installed both packages from their prebuilt binaries with no build step and no warning, on Linux x64.

Besides the named tests, the runner is tested for applying only a newly added file and for refusing a file name with no number. With the history check removed and the order reversed by hand, four runner tests failed; both were restored. The refusal tests were not each broken by hand: the migration is the DDL the spike already ran, and the comparison test fails if it differs from `SCHEMA.md`.

Run on macOS arm64 after this was written: the workflow run https://github.com/Enriquez-Johnmark/factloom/actions/runs/43706673063 passed on both operating systems, with Node.js 22 and 26. It is the first run of the native SQLite modules on Apple Silicon inside the workspace.

`pnpm check`, on Linux x64 with Node.js v22.23.4. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 87 files. No fixes applied.
$ biome lint .
Checked 87 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  25 passed (25)
      Tests  332 passed (332)
```

### FL-014: SQLite store: opening, connection settings and commit

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-002, FL-012, FL-013 |
| Requirements | REQ-01, REQ-02, REQ-06, REQ-07, REQ-08, REQ-11, REQ-25 |
| Components | `packages/storage` |

**Objective.** Open a SQLite file as a `MemoryStore` and implement the write path of `commit`: every change kind and its audit entry in one transaction, with everything rolled back on a failure.

**Background.** [`INTERFACES.md`](../../architecture/INTERFACES.md), "Storage", defines `commit`. [`SCHEMA.md`](../../architecture/SCHEMA.md), "Connection settings", says what every connection does and why: each host session starts its own server, so several processes can have one file open. The item was split to fit one session. It keeps opening, the settings and the write path. The single-value check inside the commit, the mapping of each failure to its error code, and the test with two writers on one file are FL-068.

**Outcome.** `openSqliteMemoryStore` returns a store that writes a change set to a file as rows, all or none. The first run of the native SQLite modules on macOS arm64 inside the workspace is on record.

**Scope.**
- `openSqliteMemoryStore(options)`, the one export of `@factloom/storage`, returning `Result<MemoryStore>` after applying pending migrations.
- The connection settings of `SCHEMA.md`, and loading `sqlite-vec`.
- `commit` for the five change kinds, with audit entries and rollback.
- `close`.
- Adapter tests that read the rows with SQL.

**Non-goals.**
- The single-value check, the error codes `not_found`, `already_invalidated`, `already_exists` and `conflict`, and two writers on one file: FL-068. In this item a commit that the database refuses returns `storage_failed`.
- The read methods: FL-015, FL-016 and FL-017. Until FL-015 the contract suite cannot observe a commit on this adapter, so this item's tests assert on the rows with SQL.
- Refusing a vector of the wrong size or model, and the tests of `copyFromFactId` through the vector lane: FL-017. This item writes the embedding row for both forms of `embedding`.
- Any change to the DDL or the triggers.
- Retrying a commit that failed. The caller decides.
- A Postgres adapter.

**Functional requirements.**
1. `openSqliteMemoryStore` opens the file at the given path, creating it if needed, applies the settings, loads `sqlite-vec`, runs the migration runner, and returns the store. Any failure is `storage_failed` with the cause. The path `:memory:` gives a private database for tests.
2. Every connection has `foreign_keys = ON`, `journal_mode = WAL` and a `busy_timeout`. A file database reports `wal`; an in-memory database cannot use WAL and is exempt.
3. `commit` validates the change set with `ChangeSetSchema` from `core` and returns `invalid_input` when it fails, before it opens a transaction.
4. `commit` runs as one transaction started with `BEGIN IMMEDIATE`, so the write lock is taken before any read. Changes apply in the order the change set lists them, not sorted by kind. Any failure rolls back everything.
5. `create_entity` writes `name_key` with `normaliseEntityName` from `core`.
6. `record_fact` inserts the fact row, one `fact_source` row per source, and the `fact_embedding` row. For `{ copyFromFactId }` the vector is copied from that fact's embedding row in the same namespace. The keyword index is filled by the trigger.
7. `invalidate_fact` sets `invalidated_at` to the change set's `occurredAt` and the supersession link, with a statement that matches the identifier, the namespace and `invalidated_at IS NULL`, as in the [data rules](../../../.claude/rules/data.md).
8. One `audit_log` row is written per change, in the order of the changes, with the change set's operation identifier, operation, trigger, reason code, explaining source and time. Its `detail` is the one `INTERFACES.md` fixes for the action: `{ supersededByFactId }` for `fact.invalidated`; `{ revisesFactId }` for `fact.recorded` when the fact is a copy made by a revision, and `null` otherwise; `{ sourceId }` for `fact.source_attached`; `null` for `entity.created` and `source.recorded`. The rule for "a copy made by a revision" is the one of the in-memory store (FL-007).
9. In this item, anything the database or the driver refuses inside the transaction is `storage_failed` with the cause. FL-068 replaces that with the codes of the error table.
10. `close` closes the connection. A call on a closed store returns `storage_failed`.

**Technical requirements.**
1. The options are the file path and the embedding model's name and dimensions, as [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md) gives them under "`@factloom/storage`". The model name and the number of dimensions are written to every `fact_embedding` row.
2. The busy timeout is a named constant of 5,000 ms, the value the [SQLite research](../../research/technical/sqlite.md) ran. It is not an option.
3. Each statement is prepared once per connection and reused. Every value is bound. No SQL is built by joining strings with values.
4. `better-sqlite3` is synchronous, so the whole commit runs without an `await` inside the transaction ([ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md)). How the driver starts an immediate transaction is read from its documentation and cited in the commit.
5. A `Float32Array` is stored as the bytes of its 32-bit floats, the form the spikes passed to `vec_distance_cosine()`.
6. The adapter catches what the driver throws and returns a `Result`. It throws only for a bug.
7. The read methods exist on the returned object, as the interface requires, and are completed by FL-015 to FL-017. The contract suite is not run against this adapter in this item, and the item says so in its completion evidence.

**Constraints.**
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md): one commit, all or nothing.
- [ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md), [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md).
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "Connection settings".
- [Data rules](../../../.claude/rules/data.md).
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): one export; nothing above `storage` sees a row or a statement.

**Acceptance criteria.**
- [x] Adapter test "a connection has foreign keys on, write-ahead logging and a busy timeout" passes, reading the three settings back from a store opened on a file.
- [x] Adapter test "writes the fixture's succession as rows" passes: after the three fixture commits of FL-012, SQL shows 5 fact rows, 5 embedding rows, the supersession links of the fixture, 2 source links for `pg14-ended`, and the audit rows of the succession in order with one operation identifier.
- [x] Adapter test "writes the detail fixed for each action" passes: the audit rows of the fixture hold `{ supersededByFactId }`, `{ revisesFactId }` and `null` where requirement 8 says, read back with SQL.
- [x] Adapter test "rolls back every row when the last change fails" passes: row counts in `entity`, `source`, `fact`, `fact_source`, `fact_embedding` and `audit_log` are unchanged.
- [x] Adapter test "returns invalid_input for a change set that fails its schema" passes, and the database's change count is unchanged.
- [x] Adapter test "copies a vector for a fact recorded with copyFromFactId" passes: the two embedding rows hold equal bytes.
- [x] Adapter test "returns storage_failed when the file cannot be opened" passes, with a path inside a directory that does not exist.
- [x] Adapter test "returns storage_failed after the store is closed" passes.
- [x] `git grep -n -E "\\$\\{" -- packages/storage/src` shows no template value inside a SQL string, apart from fixed fragments. Each match is listed in the completion evidence with the reason it is safe.
- [x] `pnpm check` exits 0, on Linux and on macOS arm64 in the workflow of FL-002. The address of that run is recorded: it is the first run of the native SQLite modules on Apple Silicon inside the workspace.

**Validation.** Adapter tests in `storage`, on temporary files and in-memory databases. The contract suite is turned on for this adapter in FL-015.

**Completion evidence.** The commit, the passing `pnpm check` output, the address of the workflow run on both operating systems, and a statement that the contract suite does not yet run against the adapter.

**Recorded evidence.** Completed on 2026-11-15, in two commits: `feat(storage): open a SQLite store and write a change set with commit` and `refactor(mcp-server): wire the placeholder from the storage adapter's real export`. The code is in `packages/storage/src`: `open-connection.ts`, `create-commit.ts` and `open-sqlite-memory-store.ts`, with the tests in `open-sqlite-memory-store.test.ts`.

The contract suite does not yet run against this adapter. Its read methods return `storage_failed` until FL-015 to FL-017 build them, so the tests here read the rows with SQL through a second, read-only connection to the same file.

What differs from a plain reading of the requirements:

- The audit rows of a commit are written after the rows of all its changes, in the order of the changes. Written one by one, the first entry of the fixture's first commit failed its foreign key: it points to the explaining source, which a later change of the same change set records.
- The time recorded for an applied migration is read from the system clock inside `openSqliteMemoryStore`, because the options are the path and the embedding model only. It is not part of memory.
- The immediate transaction was confirmed by reading the driver's source, not by a test: `lib/methods/transaction.js` of `better-sqlite3` 13.1.1 prepares `BEGIN IMMEDIATE` for the `immediate` form. A test cannot tell it from a deferred transaction with one connection; FL-068 tests two writers.
- Left to FL-068, as the non-goals say: this adapter does not yet check that the entities and sources a change names are in the change set's namespace. The contract suite's namespace cases cover it when it is turned on.

With the `revisesFactId` detail and the check of the invalidation's row count each removed by hand, two tests failed; both were restored.

Template values in `packages/storage/src` (`git grep -n -E "\$\{"`, plus the same search over the new files): in `create-commit.ts`, `open-sqlite-memory-store.ts` and `run-migrations.ts` every match is in an error message, none in SQL. In the tests, `initial-migration.test.ts` builds three `INSERT` statements from constants written in the test, and `open-sqlite-memory-store.test.ts` counts rows with `FROM ${table}`, where `table` is one of six names in a fixed list. No value from outside reaches a SQL string.

The workflow run on Linux and macOS arm64, with Node.js 22 and 26: https://github.com/Enriquez-Johnmark/factloom/actions/runs/43710999572. The native modules first ran on Apple Silicon inside the workspace one push earlier, in the run recorded under FL-013.

`pnpm check`, on Linux x64 with Node.js v22.23.4. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 90 files. No fixes applied.
$ biome lint .
Checked 90 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  25 passed (25)
      Tests  343 passed (343)
```

### FL-068: SQLite single-value rule, error mapping and two writers on one file

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-014, FL-067 |
| Requirements | REQ-11, REQ-15, REQ-25 |
| Components | `packages/storage` |

**Objective.** Make the SQLite commit enforce the single-value rule inside its transaction, return the documented error code for every refusal, and show with a second process that two writers on one file cannot both commit conflicting facts.

**Background.** FL-014 writes a change set as rows and returns `storage_failed` for anything the database refuses. [`INTERFACES.md`](../../architecture/INTERFACES.md), "Errors from `commit`", gives the codes a caller acts on. The single-value rule is rule 8 of [`SCHEMA.md`](../../architecture/SCHEMA.md): a query the adapter runs inside each commit, after applying the change set. The [fact-schema spike](../../../spikes/fact-schema/README.md) showed that the query is right on five cases, by hand. It did not show that an adapter calls it, and two processes writing to one file has never been run (`SCHEMA.md`, "Not yet run"; open question Q-10). This item closes both. The cases S1 to S6 and A1 to A4 of the contract suite (FL-067) are the specification of the rule.

`better-sqlite3` is synchronous. Inside one thread, a second commit cannot wait for a lock that the same thread holds: it would block the event loop until the busy timeout and fail. A test of the write lock therefore needs a second process.

**Outcome.** Two server processes that share a file cannot leave two overlapping live facts for a single-valued predicate. A caller of `commit` on SQLite gets the same error codes as on the in-memory store.

**Scope.**
- The single-value check inside `commit`.
- The mapping of each refusal to its code, with `relatedFactIds`.
- An adapter test with two writers, one of them in a child process.
- An adapter test of a second process reading what the first wrote.

**Non-goals.**
- The read methods: FL-015 to FL-017. This item's tests assert on results and on rows read with SQL.
- Refusing a vector of the wrong size or model: FL-017.
- Retrying a commit that failed. The caller decides.
- Any change to the DDL or the triggers.

**Functional requirements.**
1. After the changes are applied, for each fact recorded with `singleValued: true`, the adapter runs the overlap query of the [spike](../../../spikes/fact-schema/check.mjs): another fact in the namespace with the same subject and predicate, not invalidated, whose valid period overlaps. A missing bound is open. Periods that only touch do not overlap. If a row is found, the transaction is rolled back and the result is `conflict` with the overlapping facts in `relatedFactIds`.
2. A missing fact, entity or source in the namespace is `not_found`, decided by a lookup that filters on the namespace, not by parsing a foreign-key message. This includes the fact named by `copyFromFactId`.
3. A fact to invalidate, or to attach a source to, that is no longer live is `already_invalidated`, with its superseding fact in `relatedFactIds` if there is one.
4. A second entity with the same type and `name_key`, or an identifier already used, is `already_exists`.
5. Anything else the driver throws, including a lock that outlasts the timeout, is `storage_failed`.
6. Every refusal leaves the database unchanged.
7. A commit issued while another process holds the write lock waits for it, up to the busy timeout, and then runs its check against what that process committed.

**Technical requirements.**
1. The check and the lookups run inside the `BEGIN IMMEDIATE` transaction of FL-014, so no other writer can change what they read before the commit.
2. The two-writer test starts a child process that opens the same file, begins an immediate transaction, records an open-ended value for a single-valued predicate, waits a fixed short time, commits and exits. While the child holds the lock, the test's own store commits a different open-ended value for the same subject and predicate. How the test knows the child holds the lock, for example a line the child prints, is described in the test's comment.
3. The child process uses the adapter through its public export. It is a small script kept beside the test.
4. Each statement is prepared once, and every value is bound, as in FL-014.

**Constraints.**
- [ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md): the rule is checked in the store, inside the commit.
- [ADR 0010](../../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md): the key and the overlap rule.
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md): a lookup never matches a row of another namespace.
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "Connection settings".

**Acceptance criteria.**
- [x] Crash-safety test passes: a second process starts a commit of several changes on a database file and is killed before it finishes. When the file is opened again, every read returns what it returned before that commit, and a new commit succeeds. The test also covers a process killed just after a commit returned: its changes are all present.
- [x] Adapter test "refuses the four overlapping periods and accepts the touching one" passes, with the five periods of the spike's single-value checks, which are those of cases S1 to S4 and A1 of FL-067.
- [x] Adapter test "does not apply the single-value rule to a multi-valued predicate" passes, and "accepts a change set that invalidates a fact and records its replacement" passes.
- [x] Adapter test "returns each documented error code" passes, with one case each for `not_found`, `already_invalidated`, `already_exists` and `conflict`, each asserting unchanged row counts.
- [x] Adapter test "returns not_found for an identifier that exists only in another namespace" passes, for a fact to invalidate, a subject entity and a source.
- [x] Adapter test "two stores on one file cannot both commit facts that break the single-value rule" passes with two stores in one process, one commit after the other: exactly one result is `ok`, the other is `conflict` and names the committed fact, and a SQL count of rows for that subject and predicate with `invalidated_at IS NULL` is 1.
- [x] Adapter test "a commit waits for a writer in another process and then returns conflict" passes, as technical requirement 2 describes: the result is `conflict`, not `storage_failed`, and the SQL count is 1.
- [x] Adapter test "a second process reads what the first wrote" passes: a child process opens a file, commits the fixture and exits; a store opened afterwards on the same file shows the same row counts by SQL.
- [x] `pnpm check` exits 0 on Linux and on macOS arm64 in the workflow of FL-002, which FL-014 already requires.

**Validation.** Adapter tests in `storage`, on temporary files, two of them with a child process. The contract suite is turned on for this adapter in FL-015.

**Completion evidence.** The commit and the passing `pnpm check` output. "Not yet run: two processes writing to one file" in [`SCHEMA.md`](../../architecture/SCHEMA.md) is replaced by the result, and Q-10 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) is updated.

**Recorded evidence.** Completed on 2026-11-15, in two commits: `feat(storage): enforce the single-value rule and return the error codes in the SQLite commit` and `test(storage): run two processes on one database file`. The code is `packages/storage/src/create-commit.ts`. The tests are `sqlite-commit-rules.test.ts` and `sqlite-two-processes.test.ts`, with the second process in `second-process.child.ts`.

What differs from a plain reading of the requirements:

- **The process that holds the lock uses the driver directly, not the adapter.** Technical requirement 3 asks for the adapter's public export, and technical requirement 2 asks the child to hold the lock for a fixed time. The adapter's commit is one synchronous call, so nothing can hold its lock open between two steps. In the two modes that hold a lock, the child starts `BEGIN IMMEDIATE` on its own connection and inserts a fact with SQL. In the two modes that commit, it uses `openSqliteMemoryStore` and `commit`.
- **The child commits a small fixture of its own**, one entity, one source and one fact, not the fixture of FL-012. That fixture lives in a file that imports the test runner, which a plain Node.js process should not load.
- **The crash-safety test compares row counts read with SQL**, not "every read", because the read methods do not exist until FL-015.
- **The wait is shown by the result, not by a timing.** The commit in the first process returns `conflict` naming the child's fact, which is visible only after the child has committed. Without the wait it would return `storage_failed` or succeed.
- The test of FL-014 that expected `storage_failed` for a fact already invalidated now expects `already_invalidated`. That is the change of behaviour this item makes.

Not run: more than two writers, a lock held longer than the busy timeout of 5,000 ms, and a process killed by power loss and not by a signal.

With the single-value check removed and one namespace filter inverted by hand, all ten tests of the two files failed; both were restored. The two-process file was then run five times in a row and passed each time.

The workflow run on Linux and macOS arm64, with Node.js 22 and 26: https://github.com/Enriquez-Johnmark/factloom/actions/runs/43715483592. `SCHEMA.md` now records the result in place of "Not yet run", and Q-10 is closed.

`pnpm check`, on Linux x64 with Node.js v22.23.4. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 94 files. No fixes applied.
$ biome lint .
Checked 94 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  27 passed (27)
      Tests  353 passed (353)
```

### FL-015: SQLite structural reads with the time predicate

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-014, FL-068 |
| Requirements | REQ-02, REQ-03, REQ-04, REQ-06, REQ-08, REQ-09, REQ-15, REQ-25 |
| Components | `packages/storage` |

**Objective.** Implement the reads that find facts by structure, each with the full time predicate, and the read of a source by identifier, and pass the first two groups of the contract suite against SQLite.

**Background.** Every read that returns facts applies the same four conditions ([`SCHEMA.md`](../../architecture/SCHEMA.md), "The time predicate"). The two exceptions are `listFacts` with `time: 'all'`, which serves fact history, and `getFact` by identifier. A third form of `time`, `'live'`, keeps only the condition that the fact is not invalidated and returns every live fact at any valid time ([`INTERFACES.md`](../../architecture/INTERFACES.md), "Storage"). `listFacts` serves three callers: conflict candidates (FL-011) through `'live'`, the graph lane of `recall` (FL-031) through `touchingEntityIds`, and fact history (FL-032) through `supersededByFactId` and `'all'`. Fact history also reads the explaining source of each audit entry with `getSource`, which returns a source whether or not a fact is linked to it.

With these reads in place, the single-value check and the error codes of FL-068 can be observed through the interface, so this item also turns on the contract group "single-value rule and namespaces" of FL-067, with the case P1 for two stores on one file.

**Outcome.** The contract groups "time, reads, commit and refusals" (FL-012) and "single-value rule and namespaces" (FL-067) pass against the SQLite adapter. From here on a commit to SQLite can be observed through the interface, and the use cases of EPIC-04 and EPIC-05 can run on a file.

**Scope.**
- `findEntities`, `getFact`, `listFacts`, `getSource` and `listAuditEntries` on the SQLite adapter.
- Row mappers from rows to `Entity`, `Fact`, `Source`, `AuditEntry` and `FactWithSources`.
- One shared SQL fragment for the time predicate.
- Running the two contract groups against SQLite, with the option that opens two stores on one file, so that P1 is registered.

**Non-goals.**
- The keyword lane (FL-016) and the vector lane (FL-017).
- Resolving identifiers through entity merges: FL-052.
- Returning a later confidence from `fact_confidence`: FL-045. A fact's confidence here is the one in its row.
- Paging beyond `limit`.

**Functional requirements.**
1. `listFacts` with a `TimeFilter` applies the four conditions with `validAt` and `knownAt`. With `'live'` it applies only `invalidated_at IS NULL`. With `'all'` it applies none of them.
2. `listFacts` applies every filter that is given and ignores a filter that is null: subject, predicate, `touchingEntityIds` (the subject or the object entity is one of them), `supersededByFactId`.
3. `listFacts` returns the newest first by `created_at`, then by a second fixed column so the order is the same on every run, and at most `limit`.
4. `getFact` returns the fact whatever its time, or `null`.
5. Each returned fact comes as `FactWithSources`: the fact, its subject entity, its object entity or `null`, and all its sources.
6. `findEntities` matches `name_key` to the query name normalised with `normaliseEntityName` from `core`, in the namespace, for one type or for every type.
7. `listAuditEntries` returns the entries for one target in the order of `audit_log.id`, with `detail` parsed from JSON.
8. `getSource` returns the source with that identifier in the namespace, whether or not a fact is linked to it, or `null`.
9. Every query filters on the namespace. A read with a limit below 1 returns `invalid_input`. A read that finds nothing returns an empty list or `null`. Anything the driver throws is `storage_failed`.
10. No read writes: no counter, no timestamp, no row.

**Technical requirements.**
1. The time predicate is written once, as a constant SQL fragment with named parameters, and used by every query that takes a `TimeFilter`, including those of FL-016 and FL-017.
2. Rows are parsed into core types at this edge, with the schemas of `core`. A row that does not parse is `storage_failed`, because it means the database holds something the code does not understand.
3. The sources and entities of a list of facts are loaded with a bounded number of queries, not one query per fact per relation.
4. `touchingEntityIds` holds a variable number of identifiers. They are bound as parameters. The way a list is bound, for example through `json_each`, is read from the SQLite documentation and cited in the commit.
5. A lookup by subject and predicate uses the index `fact_subject_predicate`, and a lookup by object entity uses `fact_object_entity`.

**Constraints.**
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "The time predicate" and "How the three retrieval lanes use the schema".
- [Data rules](../../../.claude/rules/data.md): "Every read that returns facts applies the whole time predicate".
- [ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md).
- [TypeScript rules](../../../.claude/rules/typescript.md): parse at the edge; no cast to silence an error.

**Acceptance criteria.**
- [x] The contract group "time, reads, commit and refusals" of FL-012 runs against the SQLite adapter and every case passes, including the eight time-table cases and R12 to R14 for `getSource`. The count is recorded.
- [x] The contract group "single-value rule and namespaces" of FL-067 runs against the SQLite adapter and every case passes, including N1 for `getSource` and P1, which is registered for this adapter. The count is recorded.
- [x] The same two groups still pass against the in-memory store.
- [x] Adapter test "uses the subject and predicate index" passes: `EXPLAIN QUERY PLAN` for the `listFacts` query with a subject and a predicate names `fact_subject_predicate`.
- [x] Adapter test "uses the object entity index for facts that point at an entity" passes in the same way for `fact_object_entity`.
- [x] Adapter test "a read leaves the database unchanged" passes: the total change count of the connection is the same before and after each read method is called.
- [x] `git grep -c "invalidated_at IS NULL OR" -- packages/storage/src` shows the time predicate written in one source file.
- [x] `pnpm check` exits 0.

**Validation.** Contract tests against both stores; adapter tests for the query plans and for reads not writing.

**Completion evidence.** The commit, the passing `pnpm check` output, and the number of contract cases that pass against each store.

**Recorded evidence.** Completed on 2026-11-15, in two commits: `feat(storage): read facts by structure with the time predicate on SQLite` and `test(storage): run two groups of the contract suite against SQLite`. The code is in `packages/storage/src`: `time-predicate.ts`, `row-mappers.ts` and `create-reads.ts`. The tests are `sqlite-memory-store.contract.test.ts` and `sqlite-reads.test.ts`.

Contract cases that pass:

| Group | In-memory store | SQLite store |
|---|---|---|
| Time, reads, commit and refusals | 41 | 41 |
| Single-value rule and namespaces | 15 | 16, with P1 for two stores on one file |
| Keyword lane | 5 | Not run: FL-016 |
| Vector lane | 6 | Not run: FL-017 |

All 57 cases passed against SQLite on the first run, with no change to the commit of FL-014 and FL-068.

What differs from a plain reading of the requirements:

- **`listFacts` has one SQL text per combination of filters**, built from fixed fragments and prepared the first time the combination is used. One text with `(@subject IS NULL OR ...)` for every filter would keep SQLite from choosing an index. Every value is still bound.
- **`touchingEntityIds` is two selects joined with `UNION`**, one on the subject and one on the object entity, so that each uses its own index and a fact that both find is returned once.
- **A list of identifiers is bound as one JSON array and read with `json_each`.** The SQLite documentation says the JSON functions are built in by default since 3.38.0 (https://www.sqlite.org/json1.html, section 2, read 2026-11-15). The section on `json_each` itself could not be read in full from this environment; that it returns each element in a `value` column was confirmed by running the queries on SQLite 3.54.1.
- **"A read leaves the database unchanged" compares `PRAGMA data_version`** read through a second connection before and after, not the change count of the store's own connection, which the interface does not expose.
- **Sources of a fact are returned in the order they were recorded**, by `source.created_at` and then row order. `fact_source` has no row order of its own, so the order in which sources were attached is not kept. The in-memory store returns attachment order; the contract compares the sources as a set.
- **The storage package does not import `zod`**, as the boundaries require, so the row mappers describe the one method of a core schema they call, `safeParse`, with a small type of their own.

With the boundary instant of the time predicate changed by hand, case T3 failed, and it was restored. With the namespace filter of `getFact` removed by hand, no case failed: the entities and sources of the fact are loaded with their own namespace filter, which returned nothing. The filter was restored; the namespace is checked twice on that path.

`git grep -c "invalidated_at IS NULL OR" -- packages/storage/src` prints one file, `time-predicate.ts`.

The workflow run on Linux and macOS arm64, with Node.js 22 and 26: https://github.com/Enriquez-Johnmark/factloom/actions/runs/43726897285.

`pnpm check`, on Linux x64 with Node.js v22.23.4. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 99 files. No fixes applied.
$ biome lint .
Checked 99 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  29 passed (29)
      Tests  418 passed (418)
```

### FL-016: Keyword lane on FTS5

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-015 |
| Requirements | REQ-03, REQ-04, REQ-05 |
| Components | `packages/storage` |

**Objective.** Implement `searchFactsByKeyword` on the FTS5 index, with the time predicate inside the query, and pass the keyword group of the contract suite.

**Background.** The keyword lane is what finds identifiers, paths and version numbers ([ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md)). The index is the external-content FTS5 table `fact_fts`, kept in step by an insert trigger, and the query is `MATCH` joined to `fact`, ordered by `bm25()` ([`SCHEMA.md`](../../architecture/SCHEMA.md), "How the three retrieval lanes use the schema"). The [spike](../../../spikes/sqlite-vec-fts5/README.md) ran that query with the time filter and compared tokenisers on code identifiers. The text of a recall question is free text from an agent, and FTS5 reads some characters and words in a query as operators, so the text cannot be passed to `MATCH` as it is.

**Outcome.** A question that names `better-sqlite3`, a file path or a version number finds the facts whose statements hold those words, limited to what was true and believed at the given dates.

**Scope.**
- `searchFactsByKeyword` on the SQLite adapter.
- Turning free text into a safe FTS5 query.
- The keyword group of the contract suite against SQLite, and adapter tests for query safety.

**Non-goals.**
- Changing the tokeniser or the FTS5 table definition. That would be a new migration, justified by the retrieval eval (FL-033). Open question Q-71 lists the options not yet examined.
- Phrase queries, prefix queries or operators chosen by the caller.
- Rank fusion and lane weights: FL-030 and FL-057.
- Highlighting or snippets.

**Functional requirements.**
1. The text is split into terms, each term is quoted so that FTS5 reads it as a literal, and the terms are joined so that a fact matching any of them is a candidate. The spike's hybrid query joined terms with `OR` for the same reason: a natural-language question rarely has every word in one statement.
2. Results are ordered best match first by `bm25(fact_fts)`, with a fixed second key so the order is the same on every run.
3. The namespace filter and the time predicate are in the same query as the `MATCH`, and the limit is applied after them.
4. A text with no term returns an empty list. A limit below 1 returns `invalid_input`.
5. No text makes the query fail: double quotes, an asterisk, a leading minus, a colon, parentheses, and the words `AND`, `OR`, `NOT` and `NEAR` are all read as literals.
6. Each result is a `FactWithSources`, built by the mappers of FL-015.

**Technical requirements.**
1. The time predicate is the shared fragment of FL-015.
2. The rule for quoting a term is read from the FTS5 documentation, section on query syntax, and cited in a comment beside the function.
3. The function that builds the query string from text is pure and has its own unit tests. The built string is bound as one parameter of `MATCH`.
4. The statement is prepared once.

**Constraints.**
- [ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md): the time filter inside the lane.
- [ADR 0005](../../architecture/adr/0005-sqlite-first-with-hand-written-sql.md): FTS5, hand-written SQL.
- [Data rules](../../../.claude/rules/data.md): always bind parameters.

**Acceptance criteria.**
- [x] The contract group "keyword lane" of FL-067, K1 to K5, passes against the SQLite adapter and still passes against the in-memory store.
- [x] Adapter test "applies the time filter before the limit" passes: with three facts that match a word, of which only the weakest match is current, a query for now with a limit of 1 returns that fact.
- [x] Adapter test "reads query operators as plain words" passes, with one case per character and word in functional requirement 5, each returning `ok`.
- [x] Adapter test "finds a statement by an identifier with an underscore" passes, with `user_repository`, and "finds a statement by a package name with a hyphen" passes, with `better-sqlite3`.
- [x] Adapter test "finds a fact when only some words of the question are in its statement" passes.
- [x] Adapter test "ranks a statement with more matching terms first" passes.
- [x] Adapter test "finds a copy made by ending a fact" passes: the ended copy written with the same statement is returned for an as-of date inside its period.
- [x] Unit tests of the query-building function pass, including "returns no query for text with no term".
- [x] `pnpm check` exits 0.

**Validation.** Contract tests against both stores; adapter tests and unit tests in `storage`.

**Completion evidence.** The commit and the passing `pnpm check` output.

**Recorded evidence.** Completed on 2026-11-16, in two commits: `feat(storage): build a safe FTS5 query from free text` and `feat(storage): add the keyword lane on FTS5`. The code is `packages/storage/src/build-keyword-query.ts` and the keyword statement in `create-reads.ts`. The tests are `build-keyword-query.test.ts`, `sqlite-keyword-lane.test.ts` and the keyword group in `sqlite-memory-store.contract.test.ts`.

K1 to K5 pass against SQLite and against the in-memory store. SQLite now runs 62 contract cases: 41, 16 and 5.

How the query is built, and where it comes from:

- The quoting rule was read in the FTS5 documentation on 2026-11-16, section 3.1, "FTS5 Strings" (https://www.sqlite.org/fts5.html): a string is enclosed in double quotes, and a double quote inside it is written twice. `AND`, `OR` and `NOT` are operators only as barewords, so a quoted one is a literal.
- The text is split on white space. A term with no letter and no digit is dropped, because the tokeniser keeps nothing of it.
- A term that the tokeniser splits into several tokens, such as `better-sqlite3` or `user_repository`, is matched as a phrase: its tokens in that order. That was observed in the tests on SQLite 3.54.1; the section of the documentation on phrases was not read.

Besides the tests the work item names, the operator test also covers a caret and a text made only of operators, and one test covers a limit below 1 and a text with no term. With the quoting removed by hand, twelve tests failed; it was restored.

Not examined, as the non-goals say: the tokeniser. The default tokeniser is in use, and open question Q-71 stays open for the retrieval eval.

`pnpm check`, on Linux x64 with Node.js v22.23.4. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 102 files. No fixes applied.
$ biome lint .
Checked 102 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  31 passed (31)
      Tests  446 passed (446)
```

### FL-017: Vector lane on a plain table, with model checking

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-002, FL-015 |
| Requirements | REQ-03, REQ-04, REQ-05, REQ-11, REQ-27 |
| Components | `packages/storage` |

**Objective.** Implement `searchFactsByVector` with `vec_distance_cosine()` on the ordinary `fact_embedding` table, refuse vectors from another model or of another size, and pass the vector group of the contract suite.

**Background.** [ADR 0008](../../architecture/adr/0008-vector-search-on-a-plain-table.md) decides that the vector lane orders the rows of an ordinary table by `vec_distance_cosine()` and does not use the `vec0` virtual table, so that the lane uses the same `WHERE` clause as every other read. The [measurement](../../../spikes/sqlite-vec-fts5/README.md), "Recorded output: `node spike-plain-table-knn.mjs`", was taken on Linux, in memory, with random vectors. The plain table returned the same ten nearest rows as `vec0`. At 100,000 rows of 384 dimensions it took 82.0 ms with the time filter and 87.8 ms without, against 43.7 ms for `vec0` with no filter. ADR 0008 accepts that cost at the size of one repository's memory. Timings on a file database and on Apple Silicon were not measured (open question Q-09). The benchmark of FL-066 measures them with the budgets of REQ-35, so this item records no timing of its own.

A database holds vectors from one model, and the adapter refuses to start with another ([`SCHEMA.md`](../../architecture/SCHEMA.md), notes on `fact_embedding`). An ended fact's copy carries a copied vector, so the nearest rows to a question can all be superseded copies. That is why the time filter must run before the limit.

**Outcome.** A question finds facts by meaning, limited to what was true and believed at the given dates. A database built with one embedding model cannot be written to or searched with another without an error that says so.

**Scope.**
- `searchFactsByVector` on the SQLite adapter.
- The check of model and dimensions when a store is opened and when a vector is committed.
- The tests of `copyFromFactId` through the lane.
- The vector group of the contract suite against SQLite.

**Non-goals.**
- The `vec0` virtual table or any approximate index. ADR 0008 says to measure again before a namespace approaches a few hundred thousand facts.
- Embedding text. The store receives vectors: the local embedder is FL-026.
- Re-embedding a database with a new model.
- Choosing lane weights or list lengths: FL-057.
- Timing the lane. The benchmark of FL-066 measures `recall` on namespaces of 10,000 and 100,000 facts.

**Functional requirements.**
1. `searchFactsByVector` returns facts ordered by cosine distance to the query vector, nearest first, with a fixed second key for equal distances.
2. The namespace filter and the time predicate are in the same query as the distance, and the limit is applied after them.
3. A query vector whose size differs from the database's returns `invalid_input`. A limit below 1 returns `invalid_input`.
4. `commit` returns `embedding_model_mismatch` for a `record_fact` whose vector size differs from the dimensions the store was opened with. Nothing is written.
5. `openSqliteMemoryStore` returns `embedding_model_mismatch` when the database already holds an embedding row whose model or dimensions differ from the options. The message names both models.
6. A fact recorded with `{ copyFromFactId }` gets the same vector, model and dimensions as the fact it names, in the same namespace. A fact named in another namespace, or one that does not exist, is `not_found`.
7. Each result is a `FactWithSources`, built by the mappers of FL-015.

**Technical requirements.**
1. The query is the one in [`SCHEMA.md`](../../architecture/SCHEMA.md): `ORDER BY vec_distance_cosine(e.embedding, :query) LIMIT :k` over `fact JOIN fact_embedding`, with the shared time predicate of FL-015 in `WHERE`.
2. The query vector is bound as the bytes of its 32-bit floats, as in the spike.
3. The check at open reads the distinct model and dimensions held, which is one query. It does not scan vectors.
4. The statement is prepared once.

**Constraints.**
- [ADR 0008](../../architecture/adr/0008-vector-search-on-a-plain-table.md).
- [ADR 0014](../../architecture/adr/0014-local-embeddings-with-bge-small.md): 384 dimensions for the default model; model and dimensions kept with every vector.
- [ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md): the time filter inside the lane.
- [Data rules](../../../.claude/rules/data.md), "Vectors".

**Acceptance criteria.**
- [x] The contract group "vector lane" of FL-067, V1 to V6, passes against the SQLite adapter and still passes against the in-memory store. With this, all four groups run against SQLite with no group turned off, and the count of passing cases for each store is recorded.
- [x] Adapter test "returns current facts when every nearer vector belongs to a superseded copy" passes: a fact is ended and its copy ended again, so three rows share one vector; a query for now with a limit of 1 returns the one that is current.
- [x] Adapter test "refuses to open a database built with another model" passes, and "refuses to open a database built with another number of dimensions" passes, both with `embedding_model_mismatch`.
- [x] Adapter test "opens an empty database with any model" passes.
- [x] Adapter test "gives a copied fact the vector of the fact it copies" passes: the two embedding rows hold equal bytes, model and dimensions.
- [x] Adapter test "does not copy a vector across namespaces" passes with `not_found`.
- [x] `pnpm check` exits 0 on Linux and on macOS arm64 in the workflow of FL-002. The address of that run is recorded: it is the first run of `sqlite-vec`'s distance function on Apple Silicon inside the workspace.

**Validation.** Contract tests against both stores; adapter tests in `storage`.

**Completion evidence.** The commit, the passing `pnpm check` output with the contract case counts for both stores, and the address of the workflow run. Q-09 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) stays open until FL-066.

**Recorded evidence.** Completed on 2026-11-16, in the commit `feat(storage): add the vector lane and the embedding model checks`, with `test(storage): remove an unused import from the vector lane tests` after it. The code is `packages/storage/src/embedding-model.ts`, the vector statement in `create-reads.ts`, and the checks in `create-commit.ts` and `open-sqlite-memory-store.ts`. The tests are `sqlite-vector-lane.test.ts` and the vector group in `sqlite-memory-store.contract.test.ts`.

Contract cases that pass, with no group turned off for either store:

| Group | In-memory store | SQLite store |
|---|---|---|
| Time, reads, commit and refusals | 41 | 41 |
| Single-value rule and namespaces | 15 | 16, with P1 for two stores on one file |
| Keyword lane | 5 | 5 |
| Vector lane | 6 | 6 |
| Total | 67 | 68 |

Notes:

- **Equal distances** are ordered by the row order of the fact, oldest first, which is what the in-memory store does.
- **The check at open** reads the distinct model and dimensions in `fact_embedding` with one query. It does not look at the vectors themselves, so a row whose bytes do not match its recorded dimensions would not be noticed there.
- **A query vector of another size** is refused before the query runs, by comparing its length with the dimensions the store was opened with.
- The first push of this item left an unused import in the test file, which the lint step reported as a warning without failing the check. It was removed in the commit after.

With the time predicate removed from the vector statement and the check at open disabled by hand, seven tests failed: V1 to V4, the superseded-copy test and the two refusals at open. Both were restored.

No timing was taken, as the work item says. Q-09 stays open until FL-066.

The workflow run on Linux and macOS arm64, with Node.js 22 and 26: https://github.com/Enriquez-Johnmark/factloom/actions/runs/43786537244. It is the first run of `sqlite-vec`'s distance function on Apple Silicon inside the workspace.

`pnpm check`, on Linux x64 with Node.js v22.23.4. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 104 files. No fixes applied.
$ biome lint .
Checked 104 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  32 passed (32)
      Tests  459 passed (459)
```

### FL-086: Two processes opening a new database at once

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-013, FL-014, FL-068 |
| Requirements | REQ-11 |
| Components | `packages/storage` |

**Objective.** Let any number of processes open the same database file at the same moment, when the file does not exist yet, and have every one of them succeed with the schema up to date.

**Background.** FL-084's run with Factloom, on the owner's Mac on 2026-11-27, failed at the start of eight of ten first sessions ([EPIC-06](EPIC-06.md), FL-084). Claude Code starts the MCP server and the maintenance command at once, and both open the same new file. Seven failed with `storage_failed: The database … could not be opened. database is locked`, one with `could not be brought up to date while applying the migration 0001_initial.sql. table entity already exists`. Four processes started at once on a new file in this repository reproduce the second message, and the same for later migrations, such as `duplicate column name: purged_at` in `0004_purge.sql`: about one process in six fails on Linux.

The runner of FL-013 reads `schema_migration` outside a transaction, then applies each file in a deferred transaction. Two processes can both read that nothing is applied, and the second then applies what the first already has. FL-068 tested two writers on one file, but never two processes opening a new one.

**Outcome.** The first session in a new repository starts with its maintenance hook working, and no user meets a race they can do nothing about.

**Scope.**
- The migration runner: each file is applied in an immediate transaction that first checks, inside it, whether the file is already recorded.
- An adapter test with several child processes opening one new file at once.
- The connection settings of FL-014, if the test shows a lock error on open.

**Non-goals.**
- Retrying a commit: FL-068 leaves that to the caller.
- A lock held longer than the busy timeout of 5,000 ms.
- Any change to a migration file or to the DDL.

**Functional requirements.**
1. Several processes that open the same new file at once each get a store, and the file records each migration once.
2. A process that finds a migration already applied by another skips it, and applies the ones after it that are not.
3. The checks of FL-013 stay: a recorded migration with no file or a changed file is refused, and a failed migration is rolled back with later files not applied.

**Technical requirements.**
1. The applied list that decides whether to apply a file is read inside that file's `BEGIN IMMEDIATE` transaction, so no other writer can change it before the file is applied.
2. The test starts the processes through `second-process.child.ts`, each opening and closing the store, and runs several rounds, each on a new file.

**Constraints.**
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "Migrations": each migration in its own transaction, forward only, never edited.
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "Connection settings", and the busy timeout of FL-014.

**Acceptance criteria.**
- [x] Adapter test "several processes opening one new file at once all succeed" passes, and fails with the runner as it was.
- [x] After that test, `schema_migration` holds each migration file once.
- [x] The tests of FL-013's runner still pass.
- [x] `pnpm check` exits 0 on Linux and on macOS arm64.

**Validation.** Adapter tests in `storage` on temporary files, with child processes.

**Completion evidence.** The commits, the test seen failing before the fix, and the passing `pnpm check`. `SCHEMA.md`, "Migrations", says that opening is safe from several processes at once.

**Recorded evidence.** Completed on 2026-11-27, in `cda1791` (`fix(storage): let several processes open a new database at once`), with `SCHEMA.md` in its own commit and Q-86 in another. The code is `packages/storage/src/run-migrations.ts`; the test is the last of `sqlite-two-processes.test.ts`, with the mode `open-and-exit` in `second-process.child.ts`.

- **The test was seen failing first.** With the runner as it was, it failed in its first run: one of five processes exited with 1 (`expected [ +0, +0, +0, +0, 1 ] to deeply equal [ +0, +0, +0, +0, +0 ]`). With the fix it passed three runs in a row and in `pnpm check`.
- **The test runs six rounds of five processes**, each round on a new file, and reads `schema_migration` after each round: one row per migration file. Four processes failed about one time in six before the fix, so six rounds of five fail almost surely without it.
- **Under more load, by hand, with the fix:** 60 rounds of six processes and 30 rounds of twelve, 720 processes, all exited with 0.
- **What differs from the work item: the connection settings are unchanged.** In FL-084's run seven of eight failures were `could not be opened. database is locked`, from `openConnection`, before any migration. On Linux, before the fix, that message came from 4 of 132 processes started four at a time, and never from the probes that ran each step of opening on its own, so the step was not caught. After the fix it did not appear in the 720 processes. That it had the same cause is likely, not shown, and it was never seen on macOS here; it is Q-86 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md), answered by the owner's next first session in a new repository.

Not run: the owner's Mac, and FL-084's comparison again.

The workflow runs on Linux and macOS arm64, with Node.js 22 and 26: https://github.com/Enriquez-Johnmark/factloom/actions/runs/45976221910 and https://github.com/Enriquez-Johnmark/factloom/actions/runs/45976375752.

`pnpm check`, on Linux x64 with Node.js v22.23.4. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 839 files. No fixes applied.
$ biome lint .
Checked 839 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  136 passed (136)
      Tests  1438 passed (1438)
```

### FL-087: The lock error on first open on macOS

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-086 |
| Requirements | REQ-11 |
| Components | `packages/storage`, `spikes/` |

**Objective.** Stop a new database from refusing to open with `database is locked` when the server and the maintenance command open it at once on macOS.

**Background.** FL-086 fixed the race in the migration runner. In the owner's second run of FL-084's comparison, after FL-086, the maintenance hook still failed in five of ten first sessions on the Mac, each with `storage_failed: The database … could not be opened. database is locked`, and in no second session ([EPIC-06](EPIC-06.md), FL-084; Q-86 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md)). The message comes from `openConnection`, before any migration, and does not say which of its steps failed. On Linux it was never seen after FL-086, and two probes in which another process held the write lock, or held the file in exclusive locking mode, both waited for the lock and then opened.

SQLite's documentation lists cases in which a WAL database returns `SQLITE_BUSY` although writers do not block readers: while the last connection that is closing cleans up the WAL and shared-memory files, while a new connection runs recovery after a crash, and while another connection holds the file in exclusive locking mode. It says that "applications should be prepared for that happenstance" (https://www.sqlite.org/wal.html, section 9, read on 2026-11-27). Which case applies here is not known.

**Outcome.** The first session in a new repository records the map before the agent starts, on macOS as on Linux.

**Scope.**
- The error of `openConnection` names the step that failed.
- A spike in `spikes/first-open-lock/` that the owner runs on the Mac: it starts the server and the maintenance command at once on a new database, round after round, and counts the maintenance runs that fail to open it, by step. It uses the app as built, with no LLM key and no agent.
- The fix of the step the spike shows, with a unit test.

**Non-goals.**
- A lock held longer than the busy timeout of 5,000 ms.
- Any change to the migrations: FL-086.

**Functional requirements.**
1. When opening fails, the message names the step: opening the file, a connection setting, or loading the vector extension.
2. A process that meets `SQLITE_BUSY` while it opens a database, in one of the cases SQLite documents, opens it once the other process is done, within the busy timeout.

**Technical requirements.**
1. The spike starts the processes as Claude Code does: the server over stdio, kept open, and `maintenance` at the same moment, with the same variables as the comparison's runner.
2. The fix is chosen from what the spike shows, and the work item's evidence says which step it was.

**Constraints.**
- [`SCHEMA.md`](../../architecture/SCHEMA.md), "Connection settings", and the busy timeout of FL-014.
- `spikes/` holds throwaway scripts; the spike is not part of `pnpm check`.

**Acceptance criteria.**
- [x] A test shows that a failed open names its step.
- [x] The spike, run by the owner on the Mac before the fix, shows the failure and its step.
- [x] A unit test covers the fix of that step.
- [x] The spike, run by the owner on the Mac after the fix, shows no failure in as many rounds.
- [x] `pnpm check` exits 0 on Linux and on macOS arm64.

**Validation.** The spike on the owner's Mac, before and after; adapter or unit tests in `storage`.

**Completion evidence.** The commits, the spike's output before and after, and the passing `pnpm check`. Q-86 is closed.

**Recorded evidence.** Completed on 2026-11-27, in `74efd1f` (`feat(storage): name the step of opening that failed`), `6b8f4ef` (the spike), `f0ebdeb` (`fix(storage): retry setting the journal mode while the database is busy`) and `6674b36` (the spike's result on macOS), with `SCHEMA.md` and Q-86 in their own commits. The code is `packages/storage/src/open-connection.ts` and `retry-while-busy.ts`.

- **The step, named.** A failed open ends with the step, for example `database is locked, while setting the journal mode to WAL`. Test: "names the step of opening that failed", with a path whose directory does not exist.
- **The spike before the fix,** on the owner's MacBook Air (Apple M1, Darwin 25.5.0, Node.js v26.13.1): 30 rounds, 12 of 90 processes failed in 10 rounds, all with `database is locked, while setting the journal mode to WAL`: the server 6 times, maintenance 4, the recall hook 2. No other step failed, and no migration. On Linux, 10 rounds had no failure.
- **The fix.** `journal_mode = WAL` is tried again every 25 ms while it throws SQLite's busy error, up to 200 attempts, the same 5,000 ms as the busy timeout. Any other error is thrown at once. Three unit tests in `retry-while-busy.test.ts`: it returns once the step stops reporting busy, it throws another error at once, and it throws the busy error when no attempt is left. With the retry removed by hand, the first and the third failed; it was restored.
- **The spike after the fix,** on the same Mac: 30 rounds, none of the 90 processes failed.
- **What differs from the work item:** the spike is the test that failed before the fix, on the platform that fails; the unit tests cover the retry with an error of SQLite's form, because no way was found to make the statement report busy on Linux.

Not run: FL-084's comparison a third time, and a first session in a new repository with Claude Code after the fix.

The workflow run on Linux and macOS arm64, with Node.js 22 and 26: https://github.com/Enriquez-Johnmark/factloom/actions/runs/46006535654.

`pnpm check`, on Linux x64 with Node.js v22.23.4. The lint step prints the same informational note as in FL-008:

```text
$ biome format .
Checked 841 files. No fixes applied.
$ biome lint .
Checked 841 files. No fixes applied.
Found 1 info.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  137 passed (137)
      Tests  1442 passed (1442)
```
