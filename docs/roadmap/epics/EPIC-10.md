# EPIC-10: Generic core, Postgres and HTTP API

| | |
|---|---|
| Status | Pending |
| Phases | 4 |
| Packages | `packages/adapters` (new), a Postgres storage adapter (new), `apps/api` (new), `packages/graph-rag`, `packages/storage`, `apps/mcp-server` |
| Requirements | REQ-31, REQ-32 |

Nothing in this epic is implemented, and it has no work items yet. Terms are used as defined in [`GLOSSARY.md`](../../../GLOSSARY.md).

## Outcome

Factloom stops assuming one domain, one database and one transport. The software development **domain** leaves `graph-rag` and becomes a **domain adapter**, so that nothing outside an adapter knows a domain. A second storage adapter, on Postgres with pgvector, passes the same storage contract suite as the SQLite adapter. An HTTP API reaches the same use cases the MCP tools reach, with routes that hold no rules about facts.

## Scope

- **The software development domain as an adapter.** This is decided, not open: the domain moves to its own adapter package in this phase, ahead of the second domain ([`INTERFACES.md`](../../architecture/INTERFACES.md), "Domain"; [`ARCHITECTURE.md`](../../architecture/ARCHITECTURE.md), "Packages"). Move `softwareDevelopmentDomain` out of `@factloom/graph-rag` into `packages/adapters`, behind the `Domain` type in [`INTERFACES.md`](../../architecture/INTERFACES.md). The composition root chooses the domain and passes it in. `graph-rag` keeps no entity type or predicate name of its own.
- **A Postgres adapter.** A second implementation of `MemoryStore`, with pgvector for the vector lane and Postgres full-text search for the keyword lane, following the translation table under "What differs in Postgres" in [`SCHEMA.md`](../../architecture/SCHEMA.md). Its migrations have the same numbers and names as the SQLite ones.
- **The storage contract suite in a shared place.** `describeMemoryStoreContract` moves out of `@factloom/storage` when the second adapter exists, and runs against the in-memory store, the SQLite adapter and the Postgres adapter ([`TESTING.md`](../../architecture/TESTING.md)).
- **An HTTP API application.** `apps/api`, a second composition root. Each route translates its input, calls one use case, and translates the `Result`.
- **Shared LLM and embedder implementations.** The Anthropic `LlmClient` and the local `Embedder` live in `apps/mcp-server` in phases 1 to 3. They move to a package when the second app needs them, and not before.

## Out of scope

- A document domain, a worker for PDF files and scans, the approval flow, and several client organisations on one deployment: [EPIC-11](EPIC-11.md).
- Adapters for further domains and what they need from the core, such as per-fact access control, retention locks and signatures: [EPIC-12](EPIC-12.md).
- Changing what a use case does. Phase 4 changes where things live and what they run on, not the rules about facts.
- Replacing SQLite. The single local file stays the default for coding agents ([ADR 0005](../../architecture/adr/0005-sqlite-first-with-hand-written-sql.md)).
- A hosted service. This epic makes one possible; it does not operate one.

## Boundaries and constraints

- **Dependencies point inward** ([ADR 0003](../../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md), [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md)). The Postgres adapter imports `core` and its database libraries, and never `graph-rag`. `packages/adapters` imports `core` only. The import table and the lint rules are extended for every new package in the same change that creates it.
- **No abstraction without two real uses** ([engineering principles](../../../.claude/rules/engineering-principles.md)). `packages/adapters` is created in this phase, as the owner's phase plan places it, with the software development domain as its first adapter and the document domain of phase 5 as its second; the shared LLM and embedder package is created only when `apps/api` needs those implementations.
- **`MemoryStore` does not change shape for Postgres.** It already returns promises and has one coarse `commit` for that reason ([ADR 0009](../../architecture/adr/0009-one-commit-writes-everything.md)). If the Postgres adapter needs a change to the interface, that is a new ADR, not an adapter detail.
- **Both adapters enforce the same rules**: the single-value rule inside the commit, one audit entry per change, facts that change only by invalidation ([ADR 0006](../../architecture/adr/0006-facts-change-only-by-invalidation.md)), and no read or link across namespaces ([ADR 0011](../../architecture/adr/0011-namespace-on-every-row.md)).
- **The time filter stays inside each lane**, applied before the limit ([ADR 0017](../../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md)). Rank fusion works on ranks, so the lanes may rank differently in Postgres without changing `graph-rag`.
- **Hand-written SQL, no ORM**, as for SQLite ([ADR 0005](../../architecture/adr/0005-sqlite-first-with-hand-written-sql.md)).
- **A route holds no rule about facts** ([architecture rules](../../../.claude/rules/architecture.md), [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md), "What a handler does").
- **What is known about Postgres is from documentation only.** The pgvector facts were read in its README and nothing was run; several differences are labelled "likely" ([SQLite research](../../research/technical/sqlite.md), "What would differ in Postgres with pgvector"; [bi-temporal research](../../research/technical/bi-temporal-modelling.md), "Database support"). They are open questions Q-67 and Q-69 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md), and each is verified by a spike before a work item relies on it.

## Dependencies

| Epic | Why |
|---|---|
| [EPIC-02](EPIC-02.md) | The `MemoryStore` interface, the `Domain` type and the fact operations the adapters serve |
| [EPIC-03](EPIC-03.md) | The storage contract suite (FL-012, FL-067) that the Postgres adapter must pass, and the SQLite migrations whose numbers and names it mirrors |
| [EPIC-04](EPIC-04.md) | The software development domain (FL-018) and the Anthropic LLM client (FL-019) that move |
| [EPIC-05](EPIC-05.md) | The local embedder (FL-026) that moves, and the retrieval eval (FL-033, FL-057) that is run again on Postgres |
| [EPIC-07](EPIC-07.md) | The timeline scenarios and their runner (FL-027, FL-039), and the benchmark (FL-066), which are run again on Postgres |
| [EPIC-06](EPIC-06.md) | The handler pattern and the composition root that `apps/api` repeats |
| [EPIC-08](EPIC-08.md), [EPIC-09](EPIC-09.md) | Each adds tables, operations and read methods in phases 2 and 3. The Postgres adapter must implement all of them, so it is built after them |

## Deliverables

- `packages/adapters`, holding the software development domain adapter, with `graph-rag` free of domain names.
- A Postgres storage adapter package with its migrations.
- The storage contract suite in a shared place, running against three stores.
- `apps/api`, with one route per use case.
- A package for the LLM client and the embedder, if `apps/api` needs them.
- ADRs for each decision listed under "Open decisions", and updated [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md), [`SCHEMA.md`](../../architecture/SCHEMA.md) and [`TESTING.md`](../../architecture/TESTING.md).

## Success criteria

- `pnpm check` runs the storage contract suite against the Postgres adapter and every case passes, including the single-value cases and the case in which two connections try to commit conflicting facts and exactly one succeeds.
- A search of `packages/graph-rag` and `packages/core` for the entity types and predicate names of the software development domain finds none outside test data.
- A test adds an import of `@factloom/graph-rag` to the Postgres adapter and an import of `@factloom/storage` to `packages/adapters`, shows `pnpm check` fail on each, and removes them.
- A smoke test starts `apps/api` on a temporary database, records a fact through a route, restarts the process, and recalls the fact through a route, with an as-of date and a known-at date giving the same answers as the MCP smoke test.
- The timeline scenarios of [EPIC-07](EPIC-07.md) give the same results on the Postgres adapter as on SQLite.
- The retrieval eval is run on Postgres and its recall figures are recorded beside the SQLite figures.
- The MCP server still passes its own smoke test on SQLite, unchanged in behaviour.

## Work items

None yet. Work items for this epic are written when phase 4 is near, after the decisions below are made. They follow the template in the [roadmap guide](../README.md) and take the next unused `FL` identifiers.

## Open decisions

Each must be decided, and recorded in an ADR where it is a design decision, before work items can be written.

| Decision | What is known |
|---|---|
| How the single-value rule is enforced in Postgres: a query inside the commit, as in SQLite, or an exclusion constraint | [`SCHEMA.md`](../../architecture/SCHEMA.md) leaves it to this epic. PostgreSQL 18 has `WITHOUT OVERLAPS` constraints on range columns; whether such a constraint can be partial, which "live facts only" needs, is unverified (Q-67) |
| The lowest supported PostgreSQL and pgvector versions | Research read the PostgreSQL 18 documentation and the pgvector 0.8.7 README. Nothing was run |
| The Postgres driver, and whether a connection pool is needed | Not researched. Chosen from current documentation, pinned, with a stated reason |
| Exact vector scan or an HNSW index, and how the time filter stays ahead of the limit | With an approximate index, pgvector filters after the index scan unless iterative scans are enabled ([SQLite research](../../research/technical/sqlite.md)). The contract suite requires that a lane returns no fact outside the time filter and does not spend its limit on such facts |
| How the keyword lane ranks | Postgres full-text ranking differs from BM25 (labelled "likely", Q-69). Whether the lane weights from FL-057 hold on Postgres is decided by running the retrieval eval there |
| How `Timestamp` values map to `timestamptz` | [`SCHEMA.md`](../../architecture/SCHEMA.md) says the text format casts directly. That a value read back is the same fixed-width text has not been run |
| Where the storage contract suite lives | [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md) says "a shared place". It needs a test framework, which `core` must not import |
| How Postgres is provided to `pnpm check` locally and in CI | Not decided. The check must stay one command |
| Whether data moves from an existing SQLite file to Postgres | Not required by REQ-32. If it is wanted, it is its own work item |
| The HTTP framework, or none | Not researched |
| How a request names its namespace and proves who is calling | The MCP server takes its namespace at start-up and has no caller identity. An API serving several callers needs both. This also prepares [EPIC-11](EPIC-11.md) |
| Whether read-access auditing belongs in the API layer or in the core | Left open by the [research on other domains](../../research/industries/other-industries.md). Needed by some domains in [EPIC-12](EPIC-12.md), not by this epic |
| Whether phase 4 also gives the MCP server an HTTP transport | [ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md) defers an HTTP transport to phase 4 "with the API". REQ-32 names only the HTTP API |
| Which package holds the LLM client and the embedder, and whether `apps/api` needs them at all | They move only when a second app needs them |
| Whether private deployment and row-level security are part of this phase | The [research on other domains](../../research/industries/other-industries.md) says both are "already planned for phase 4". REQ-32 does not include them |
