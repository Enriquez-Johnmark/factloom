# Requirements

The consolidated list of what Factloom must do, with the epics and work items that deliver each requirement. Terms are used as defined in [`GLOSSARY.md`](../../GLOSSARY.md).

**Status of everything on this page: nothing is implemented yet.** Every work item named here is `Pending`. A requirement counts as met only when its work items are `Completed` with the evidence described in the [roadmap guide](../roadmap/README.md).

## How to read the inventory

- **Identifiers** `REQ-01` to `REQ-35` are permanent. A requirement is never renumbered; one that is withdrawn keeps its number and is marked withdrawn.
- **Source** says where the requirement came from. "prompt" is the owner's project brief, cited by section; "checkpoint 1 decision", "grilling Q7" and "architecture review" are the owner's decisions and reviews made during the design stage. Those four are not files in this repository. "A1" to "A5" are the proposed advantages in section 6 of the [competitive analysis](../research/evaluations/competitive-analysis.md). ADRs are in [`docs/architecture/adr/`](../architecture/adr/).
- **Mandatory** says whether the phase can be called complete without the requirement. Every requirement here is mandatory for its phase. For phases 4 to 6 that means "mandatory when the phase is built"; the content of those phases is reviewed before their work items are written.
- **Epics** are the owning epics, in [`docs/roadmap/epics/`](../roadmap/epics/).
- **Work items** are the `FL` identifiers whose scope delivers the requirement, taken from the roadmap. A work item from an epic that is not an owner is listed when it supplies a necessary part. Epics 10 to 12 have no work items yet.

## Inventory

### Product 1 (phase 1)

| ID | Requirement | Source | Mandatory | Epics | Work items |
|---|---|---|---|---|---|
| REQ-01 | Knowledge is stored as entities and facts; each fact has a confidence | prompt s.2 | Yes | EPIC-02, EPIC-03 | FL-006, FL-007, FL-008, FL-013, FL-014, FL-045 |
| REQ-02 | Facts are bi-temporal (`valid_from`, `valid_to`, `created_at`, `invalidated_at`) from the first migration | prompt s.4.1 | Yes | EPIC-02, EPIC-03 | FL-005, FL-006, FL-010, FL-012, FL-013, FL-014, FL-015, FL-044 |
| REQ-03 | Default recall returns only current facts | prompt s.2, competitive analysis A1 | Yes | EPIC-03, EPIC-05 | FL-012, FL-067, FL-015, FL-016, FL-017, FL-031, FL-056, FL-058, FL-073 |
| REQ-04 | Recall answers "what was true on a date" and "what was believed on a date", in every retrieval lane | prompt s.2, A2 | Yes | EPIC-03, EPIC-05, EPIC-06 | FL-012, FL-067, FL-015, FL-016, FL-017, FL-031, FL-056, FL-058 |
| REQ-05 | Recall combines vector, keyword and graph retrieval and merges their rankings | prompt s.2 | Yes | EPIC-05 | FL-016, FL-017, FL-030, FL-031, FL-033, FL-057 |
| REQ-06 | Invalidate, never delete; a superseded fact stays on record and links to its replacement | prompt s.4.1, A1, A3 | Yes | EPIC-02, EPIC-03 | FL-007, FL-009, FL-010, FL-012, FL-013, FL-014, FL-015, FL-025, FL-044 |
| REQ-07 | Every fact points to at least one source | prompt s.4.1 | Yes | EPIC-02, EPIC-03 | FL-006, FL-007, FL-008, FL-012, FL-014 |
| REQ-08 | Every change is in the audit log: what changed, when, why and what triggered it | prompt s.4.1 | Yes | EPIC-02, EPIC-03 | FL-006, FL-007, FL-008, FL-009, FL-010, FL-012, FL-013, FL-014, FL-015, FL-025 |
| REQ-09 | A fact's history can be read back with its sources | A3 | Yes | EPIC-02, EPIC-03, EPIC-05, EPIC-06 | FL-007, FL-012, FL-015 (the `getSource` read); FL-032, FL-036 |
| REQ-10 | Claude Code and Codex use Factloom through an MCP server whose tools are described and annotated | prompt s.2, s.3 | Yes | EPIC-06 | FL-034, FL-058, FL-035, FL-036, FL-038, FL-059 |
| REQ-11 | The server runs from one SQLite file with no other service, and memory persists across restarts | prompt s.3, A4 | Yes | EPIC-03, EPIC-06 | FL-003, FL-013, FL-014, FL-068, FL-017, FL-034, FL-037 |
| REQ-12 | A clean install is started in CI, and the MCP and LLM SDK versions are pinned | A4 | Yes | EPIC-01, EPIC-06 | FL-001, FL-003, FL-019, FL-034, FL-037 |
| REQ-13 | A structured fact can be recorded with no LLM call | competitive analysis | Yes | EPIC-04, EPIC-06 | FL-020, FL-024, FL-035 |
| REQ-14 | A restated fact is stored once and gains the new source | competitive analysis | Yes | EPIC-02, EPIC-04 | FL-008, FL-020, FL-023, FL-024 |
| REQ-15 | The single-value rule holds at all times: no two live facts for one subject and single-valued predicate overlap in valid time | architecture review | Yes | EPIC-02, EPIC-03 | FL-007, FL-011, FL-067, FL-068, FL-015, FL-044, FL-052, FL-063 |
| REQ-35 | Performance budgets are measured by a benchmark and enforced: `recall` answers within 150 ms at the 95th percentile on a namespace of 10,000 facts and within 500 ms on 100,000; `record_fact` takes at most 50 ms excluding embedding; the server starts within 2 seconds once the embedding model is downloaded. The numbers are targets until the first benchmark run confirms or revises them | owner request, 2026-11-14 | Yes | EPIC-03, EPIC-05, EPIC-06, EPIC-07 | FL-066 |

### Product 2 (phases 2 and 3)

| ID | Requirement | Source | Mandatory | Epics | Work items |
|---|---|---|---|---|---|
| REQ-16 | New information that conflicts with a stored fact is detected at write time, with candidates chosen without an LLM and bounded in number, and the old fact is ended or invalidated and linked | prompt s.2, s.3 | Yes | EPIC-08 | FL-011, FL-041, FL-042 |
| REQ-17 | Correction policy is set per domain: automatic, or proposed for human approval | prompt s.4.1 | Yes | EPIC-08 | FL-042, FL-043, FL-070 |
| REQ-18 | Feedback on a recalled fact is recorded and acted on as a correction signal | prompt s.3 | Yes | EPIC-08 | FL-045, FL-046, FL-059, FL-060 |
| REQ-19 | Content can be purged for erasure or a stored secret, leaving a record; writes containing a recognisable secret are refused | checkpoint 1 decision, grilling Q7 | Yes | EPIC-04, EPIC-08 | FL-022, FL-023, FL-024, FL-025 (phase 1); FL-047, FL-061, FL-072 (phase 2) |
| REQ-20 | Duplicate entities are merged on a schedule, and a merge can be undone | prompt s.2 | Yes | EPIC-09 | FL-048, FL-052, FL-063, FL-053, FL-064 |
| REQ-21 | Stale and low-confidence facts are verified against their sources; anchored code facts are verified with no LLM call | prompt s.2, A5 | Yes | EPIC-09 | FL-048, FL-049, FL-050, FL-071, FL-062, FL-051 |
| REQ-22 | Broken links to moved or renamed files are repaired or flagged | prompt s.2, appendix A | Yes | EPIC-09 | FL-054 |
| REQ-23 | Unused facts are archived | prompt s.2 | Yes | EPIC-09 | FL-055, FL-065, FL-073 |
| REQ-24 | Product 2 changes memory only through operations that product 1 exposes | prompt s.2 | Yes | EPIC-02, EPIC-08, EPIC-09 | FL-004, FL-008, FL-009, FL-010, FL-011, FL-040, FL-042, FL-044, FL-045, FL-046, FL-060, FL-061, FL-048, FL-049, FL-050, FL-071, FL-062, FL-051, FL-052, FL-063, FL-053, FL-064, FL-054, FL-065, FL-073 |

### Across the system (phases 0 to 2)

| ID | Requirement | Source | Mandatory | Epics | Work items |
|---|---|---|---|---|---|
| REQ-25 | Memory is partitioned by namespace; nothing is read or linked across namespaces | ADR 0011 | Yes | EPIC-02, EPIC-03, EPIC-06 | FL-006, FL-007, FL-067, FL-013, FL-014, FL-068, FL-015, FL-034 |
| REQ-26 | The LLM sits behind an interface in core, with Claude as the default | prompt s.3 | Yes | EPIC-02, EPIC-04 | FL-006, FL-019, FL-021, FL-023, FL-069 |
| REQ-27 | Embeddings sit behind an interface in core, with a local model as the default | prompt s.3, ADR 0014 | Yes | EPIC-02, EPIC-05 | FL-006, FL-017, FL-026 |
| REQ-28 | Package boundaries are enforced automatically, and one command runs format check, lint, type check and tests | prompt s.4.2, s.4.3 | Yes | EPIC-01 | FL-001, FL-002, FL-040 |
| REQ-29 | Native modules and the SQLite extension work on macOS with Apple Silicon | prompt s.3 | Yes | EPIC-01, EPIC-06 | FL-002, FL-003, FL-038 |
| REQ-30 | An eval set covers extraction and "fact changed over time" cases, and runs deterministically | prompt s.6 | Yes | EPIC-04, EPIC-07 | FL-012, FL-067, FL-023, FL-069, FL-027, FL-028, FL-029, FL-039 |

### Later phases (4 to 6)

| ID | Requirement | Source | Mandatory | Epics | Work items |
|---|---|---|---|---|---|
| REQ-31 | The core is generic: only a domain adapter knows its domain | prompt s.2 | Yes | EPIC-04 (phase 1), EPIC-10 (phase 4) | FL-006, FL-018, FL-021; none yet for phase 4 |
| REQ-32 | A Postgres adapter with pgvector passes the storage contract suite, and an HTTP API exposes the use cases | prompt s.3 | Yes, in phase 4 | EPIC-10 | None yet |
| REQ-33 | Document management: a document adapter, a Python worker that turns PDF files and scans (OCR) into text to be remembered, a human approval flow, and keeping organisations' memory apart (multi-tenancy), built on namespaces | prompt s.3 | Yes, in phase 5 | EPIC-11 | None yet |
| REQ-34 | Domain adapters for seven further domains; regulated ones need human-approved correction, per-fact access control and private deployment | prompt appendix A | Yes, in phase 6 | EPIC-12 | None yet |

Notes on the mapping:

- A work item is listed for a requirement exactly when the "Requirements" row of that work item names the requirement. The roadmap's consistency check compares the two.
- The `LlmClient` and `Embedder` interfaces (REQ-26, REQ-27) are listed under FL-006 because the work items that implement them, FL-019, FL-026 and FL-028, depend on FL-006 and on nothing later in `core`.
- REQ-12 names FL-019 and FL-034 because those are the work items that add the LLM SDK and the MCP SDK as dependencies. FL-001 holds the one test that every dependency version is exact. FL-003 is the clean install.
- REQ-09 names FL-007, FL-012 and FL-015 for `MemoryStore.getSource`, the read with which fact history shows the explanation of each change, in the in-memory store, the contract suite and the SQLite adapter.
- REQ-17 is delivered in three parts: automatic correction for an `automatic` domain (FL-042), stored proposals with approve and reject (FL-043), and `remember` under `human_approval` with a command a person runs to list, approve and reject (FL-070). The command is not an MCP tool, so an agent cannot approve its own proposal.
- REQ-20 and REQ-21 say "on a schedule". Here that means the maintenance run is a command that the host's scheduler or a session-start hook starts (FL-048). Factloom runs no daemon and no timer of its own.
- REQ-30 names FL-023 and FL-069 because the extraction cases run through the `remember` use case, and FL-069 is their run in replay with the recordings.
- REQ-16 names FL-011 because candidate selection without an LLM is a phase 1 operation in EPIC-02 that phase 2 builds on. EPIC-08 owns the requirement.
- REQ-35 is listed with product 1 because it is a phase 1 requirement. EPIC-07 holds the benchmark (FL-066); EPIC-03, EPIC-05 and EPIC-06 hold the code that must meet the budgets.
- REQ-33 and REQ-34 use this repository's vocabulary. The seven further domains of REQ-34 are legal, compliance and regulation, healthcare, customer support and CRM, enterprise knowledge management, finance and research, and manufacturing and operations. In REQ-33, multi-tenancy means several client organisations served by one deployment; the partition underneath is the **namespace**.

## Classification

### Confirmed requirements

REQ-01 to REQ-35 are confirmed by the owner. Each traces to the owner's brief, to a decision or request recorded during the design stage, or to an ADR. None is implemented yet. The numbers in REQ-35 are targets, not measurements: the first run of the benchmark (FL-066) confirms or revises them.

### Technical constraints and invariants

These bind every epic. They are decisions, not open choices, and each is changed only by a new ADR that supersedes the old one. None is implemented yet; the schema rules were run as a spike ([`SCHEMA.md`](../architecture/SCHEMA.md)).

| Constraint or invariant | Record |
|---|---|
| Dependencies point inward and are passed as arguments | [ADR 0003](../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md) |
| Zod schemas are the source of types; expected failures are `Result` values | [ADR 0004](../architecture/adr/0004-zod-schemas-and-result-values.md) |
| SQLite first, hand-written SQL, no ORM | [ADR 0005](../architecture/adr/0005-sqlite-first-with-hand-written-sql.md) |
| A fact row changes only by being invalidated once | [ADR 0006](../architecture/adr/0006-facts-change-only-by-invalidation.md) |
| Timestamps are fixed-width UTC text | [ADR 0007](../architecture/adr/0007-timestamps-as-fixed-width-utc-text.md) |
| Vector search runs on an ordinary table | [ADR 0008](../architecture/adr/0008-vector-search-on-a-plain-table.md) |
| One commit writes facts, sources, embeddings and audit entries | [ADR 0009](../architecture/adr/0009-one-commit-writes-everything.md) |
| A conflict is keyed by subject and single-valued predicate | [ADR 0010](../architecture/adr/0010-conflicts-are-keyed-by-subject-and-predicate.md) |
| Every row belongs to a namespace | [ADR 0011](../architecture/adr/0011-namespace-on-every-row.md) |
| The audit log holds no free text; purge is the one exception to keeping everything | [ADR 0012](../architecture/adr/0012-purge-is-the-one-exception.md) |
| Claude is the default LLM behind a one-method interface | [ADR 0013](../architecture/adr/0013-claude-behind-a-one-method-interface.md) |
| Local embeddings with `bge-small-en-v1.5` | [ADR 0014](../architecture/adr/0014-local-embeddings-with-bge-small.md) |
| TypeScript 7, Biome, no build step in development | [ADR 0015](../architecture/adr/0015-toolchain.md) |
| A stdio MCP server with five tools in phase 1; phase 2 adds `give_feedback` | [ADR 0016](../architecture/adr/0016-mcp-stdio-server-with-five-tools.md) |
| Rank fusion in TypeScript, with the time filter inside each lane | [ADR 0017](../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md) |

The full index is [`DECISIONS.md`](../architecture/DECISIONS.md).

### Assumptions

The design rests on these. None has been shown on a running system, and each has a row in [`OPEN-QUESTIONS.md`](../research/OPEN-QUESTIONS.md) that says how to check it.

| Assumption | Open question |
|---|---|
| An agent will call the memory tools often enough without being told to | Q-19 |
| The documented commands for registering an MCP server in Claude Code and Codex work as written | Q-15 |
| Two server processes can share one SQLite file without lock errors | Q-10 |
| An exact vector scan is fast enough for one repository's memory on the owner's machine | Q-09 |
| The chosen local embedding model recalls well enough on coding-agent notes | Q-25 |
| The graph lane improves answers for this kind of memory | Q-28 |
| Extraction by the LLM is accurate enough on real notes | Q-31 |
| The LLM's verdict on a pair of facts is accurate enough for automatic correction | Q-30 |

### Unresolved decisions

Not yet decided. Each is settled inside the work item or epic named, and recorded in an ADR when it is.

| Decision | Where it is settled | Related open question |
|---|---|---|
| The lane weights of rank fusion | FL-057 | Q-27 |
| The upper bound on conflict candidates per call | FL-041 | None |
| The full design of purge, including an entity name that is itself sensitive | FL-047 | [ADR 0012](../architecture/adr/0012-purge-is-the-one-exception.md) |
| Whether recording usage after each recall causes contention. That usage is recorded by the caller, outside `commit`, is decided | FL-055 | Q-11 |
| The period after which an unused fact is archived | FL-065 | Q-57 |
| Whether the performance budgets of REQ-35 hold, or are revised with the owner's approval | FL-066 | Q-09 |
| Whether a function is checked by parsing and not by a word search | EPIC-09, "Open decisions" | None |
| Whether a reranking model is added after rank fusion | EPIC-05, "Open decisions" | None |
| How an audit entry identifies the person behind a change | EPIC-11, "Open decisions" | None |
| Whether the namespace can be derived from the repository | Not planned in phases 0 to 3; it stays explicit | Q-16, Q-53 |
| How imprecise dates such as "March 2026" are stored | EPIC-04 | Q-29 |
| Everything listed under "Open decisions" in EPIC-10, EPIC-11 and EPIC-12 | Those epics | Q-59 to Q-69 |

### Risks

| Risk | Effect | Open question |
|---|---|---|
| A native module or the SQLite extension does not load on macOS arm64 | Blocks phase 1 on the owner's machine | Q-01, Q-02 |
| `sqlite-vec` is before version 1 and its on-disk format may change | Re-indexing; limited because vectors are kept in an ordinary table | Q-07 |
| Node's type stripping changes behaviour in a later release | The no-build setup needs rework | Q-06 |
| A wrong verdict invalidates a true fact | Memory becomes wrong with full confidence; guarded by the false invalidation rate on the scenario set | Q-30 |
| A date extracted wrongly from text | A wrong answer to an as-of question | Q-29, Q-31 |
| Coding agents ship file-based memory at no cost | For small memories the built-in files may be enough, which narrows the first use | Q-51 |
| One maintainer | Every phase must stay small; a work item that does not fit one session is split | None |
| Regulation texts were read from mirrors | Nothing in EPIC-12 may be treated as verified | Q-59 to Q-65 |

## Requirements from the competitive analysis

Section 7 of the [competitive analysis](../research/evaluations/competitive-analysis.md) carries forward thirteen requirements, `REQ-CA-01` to `REQ-CA-16` with three numbers unused. Each is absorbed by a requirement above. None is implemented yet.

| Competitive analysis | Summary | Absorbed by |
|---|---|---|
| REQ-CA-01 | Default recall returns no invalidated or ended fact | REQ-03 |
| REQ-CA-02 | Every invalidation writes an audit entry, with a link when a replacement exists | REQ-06 |
| REQ-CA-03 | Conflict candidates are chosen by subject and predicate before any LLM call, with an upper bound | REQ-16 |
| REQ-CA-04 | The recall tool takes an as-of date and a known-at date, applied in every lane | REQ-04 |
| REQ-CA-05 | No operation deletes a fact row; every create, invalidate and merge writes an audit entry | REQ-06, REQ-08 |
| REQ-CA-06 | Every fact points to a source, and a history tool returns the chain with sources | REQ-09 (the source part is also REQ-07) |
| REQ-CA-07 | One SQLite file, no other service, data persists across restarts | REQ-11 |
| REQ-CA-08 | CI installs the packed server on a clean machine and starts it; SDK major versions are pinned | REQ-12 |
| REQ-CA-09 | A source may carry an anchor in phase 1; anchored facts are verified with no LLM call in phase 3 | REQ-21 |
| REQ-CA-10 | A structured fact is recorded with no LLM call | REQ-13 |
| REQ-CA-11 | An exact duplicate fact is stored once, with the new source attached | REQ-14 |
| REQ-CA-12 | Similar-entity suggestion | Deferred there. Not required for phases 0 to 3 |
| REQ-CA-13 | Tool inputs are described, tools are annotated, skipped items are reported | REQ-10 |
| REQ-CA-14 | A test comparing the documented tool table with the tool list | Deferred there. Not required for phases 0 to 3 |
| REQ-CA-15 | Markdown export of current facts | Deferred there. Not required for phases 0 to 3 |
| REQ-CA-16 | Correction policy supports flagging for human review as well as automatic invalidation | REQ-17, for the first half. The second half remains deferred |

The second half of REQ-CA-16, "a human decision is not overridden by a later automatic one", remains deferred, as the competitive analysis says: it is needed only once an adapter requires human approval, which is after phase 3. FL-043 states it as a non-goal, and no work item in phases 0 to 3 covers it. [EPIC-11](../roadmap/epics/EPIC-11.md) takes it up with the first domain whose correction policy is human approval.
