# Capabilities

What Factloom must be able to do, which requirements each capability satisfies, and which epic owns it. Nothing listed here is implemented yet. Terms in bold are defined in [`GLOSSARY.md`](../../GLOSSARY.md). Requirement identifiers are from [`REQUIREMENTS.md`](REQUIREMENTS.md); epics are in [`docs/roadmap/epics/`](../roadmap/epics/).

A capability is named for what a user or an agent can do, not for a package. "Phase" is the delivery phase that first demonstrates the capability on a running system; the phases are described in [`PRODUCT.md`](PRODUCT.md).

## Product 1: temporal graph RAG

| Capability | What it means | Requirements | Owning epic | Phase |
|---|---|---|---|---|
| Record knowledge with sources | Text or an already structured fact becomes entities and facts, each with a confidence and at least one **source**; a **restatement** adds a source and no second fact | REQ-01, REQ-07, REQ-13, REQ-14, REQ-26 | [EPIC-04](../roadmap/epics/EPIC-04.md) | 1 |
| Keep both time axes | Every fact carries **valid time** and **recorded time**, and changes only by **invalidation**, so a superseded fact stays on record and links to its replacement | REQ-02, REQ-06 | [EPIC-02](../roadmap/epics/EPIC-02.md), with the schema in [EPIC-03](../roadmap/epics/EPIC-03.md) | 1 |
| Recall by meaning, words and connection | A question is answered from three **retrieval lanes** merged by **rank fusion**, and by default only **current facts** are returned | REQ-03, REQ-05, REQ-27 | [EPIC-05](../roadmap/epics/EPIC-05.md) | 1 |
| Answer as-of and known-at questions | A recall can carry an **as-of date**, a **known-at date** or both, and the time filter applies inside every lane | REQ-04 | [EPIC-05](../roadmap/epics/EPIC-05.md), with the lanes in [EPIC-03](../roadmap/epics/EPIC-03.md) | 1 |
| Show a fact's history | For any fact, the facts linked to it by **supersession** are returned with their sources and the **audit entries** that explain each change | REQ-08, REQ-09 | [EPIC-05](../roadmap/epics/EPIC-05.md) | 1 |
| Keep one value per single-valued predicate | The **single-value rule** holds inside every commit, also when two processes write to one file | REQ-15 | [EPIC-03](../roadmap/epics/EPIC-03.md), with the in-memory store in [EPIC-02](../roadmap/epics/EPIC-02.md) | 1 |
| Serve coding agents over MCP | Claude Code and Codex reach the use cases through a local stdio server with described and annotated tools, one SQLite file, one **namespace** per server, and no other service | REQ-10, REQ-11, REQ-12, REQ-25, REQ-29 | [EPIC-06](../roadmap/epics/EPIC-06.md) | 1 |
| Answer within stated time budgets | A benchmark measures `recall`, `record_fact` and server start on namespaces of 10,000 and 100,000 facts, and fails when a budget is missed. The numbers are targets until the first benchmark run confirms or revises them | REQ-35 | [EPIC-07](../roadmap/epics/EPIC-07.md) for the benchmark; [EPIC-03](../roadmap/epics/EPIC-03.md), [EPIC-05](../roadmap/epics/EPIC-05.md) and [EPIC-06](../roadmap/epics/EPIC-06.md) for the code that must meet it | 1 |

## Product 2: self-correcting and self-healing memory

| Capability | What it means | Requirements | Owning epic | Phase |
|---|---|---|---|---|
| Resolve conflicts | New information that conflicts with a stored fact is judged when it is written, and the stored fact is ended or invalidated, or the change is proposed for approval, as the domain's **correction policy** says | REQ-16, REQ-17 | [EPIC-08](../roadmap/epics/EPIC-08.md) | 2 |
| Act on feedback | **Feedback** on a recalled fact is recorded and leads to a change of confidence, a **retraction** or an ended fact under the correction policy | REQ-18 | [EPIC-08](../roadmap/epics/EPIC-08.md) | 2 |
| Purge | The content of a source, and of the facts that depend only on it, is removed and a record remains. A person runs a purge with a command; no MCP tool can. A write that contains a recognisable secret is refused before it is recorded | REQ-19 | [EPIC-08](../roadmap/epics/EPIC-08.md), with the secret check in [EPIC-04](../roadmap/epics/EPIC-04.md) | 2 (secret check: 1) |
| Verify against sources | **Stale facts** are checked against their sources, with deterministic checks first; anchored code facts are checked with no LLM call: that the file still exists, that a named function is still in it, and that a version in a manifest still matches | REQ-21 | [EPIC-09](../roadmap/epics/EPIC-09.md) | 3 |
| Merge entities | Duplicate entities are found on a schedule and recorded as the same thing by an **entity merge** that can be undone | REQ-20 | [EPIC-09](../roadmap/epics/EPIC-09.md) | 3 |
| Repair anchors | An **anchor** that points at a moved or renamed file is repaired, and a fact whose anchor cannot be repaired is flagged as an **orphaned fact** | REQ-22 | [EPIC-09](../roadmap/epics/EPIC-09.md) | 3 |
| Archive | Facts that have not been used for a configured period become **archived facts**, left out of recall by default, and archiving can be reversed | REQ-23 | [EPIC-09](../roadmap/epics/EPIC-09.md) | 3 |

## Later phases

| Capability | What it means | Requirements | Owning epic | Phase |
|---|---|---|---|---|
| Serve other storage and transports | A Postgres adapter passes the same storage contract suite, and an HTTP API reaches the same use cases | REQ-32 | [EPIC-10](../roadmap/epics/EPIC-10.md) | 4 |
| Serve other domains | A **domain adapter** supplies its own entity types, predicates, extraction instructions and correction policy, and nothing outside the adapter knows the domain | REQ-31, REQ-33, REQ-34 | [EPIC-10](../roadmap/epics/EPIC-10.md), [EPIC-11](../roadmap/epics/EPIC-11.md), [EPIC-12](../roadmap/epics/EPIC-12.md) | 4 to 6 (the first domain is data from phase 1) |

## Supporting capabilities

These are not visible to an agent, but every capability above depends on them.

| Capability | What it means | Requirements | Owning epic | Phase |
|---|---|---|---|---|
| Check the workspace with one command | `pnpm check` runs the format check, lint, type check and tests, and a forbidden import between packages fails it | REQ-28 | [EPIC-01](../roadmap/epics/EPIC-01.md) | 0 |
| Change memory through one door | Every write is a fact operation in `core` that builds one **change set** and commits it; product 2 has no other way to write | REQ-24 | [EPIC-02](../roadmap/epics/EPIC-02.md) | 1 |
| Measure correctness | An eval set of extraction cases and "fact changed over time" scenarios runs deterministically on every check | REQ-30 | [EPIC-07](../roadmap/epics/EPIC-07.md) | 0 to 2 |

## How the capabilities depend on each other

- **Everything depends on "Keep both time axes" and "Change memory through one door".** The fact schema and the commit are where a mistake is expensive, so they come first and are covered by the storage contract suite.
- **Recall depends on recording, and as-of and known-at answers depend on both time axes.** The time filter is part of each lane, not a step after rank fusion ([ADR 0017](../architecture/adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md)).
- **"Show a fact's history" depends on the audit log and on supersession links** being written by every operation from the first migration.
- **"Resolve conflicts" depends on "Keep one value per single-valued predicate".** The rule in the commit is the safety net; conflict handling in phase 2 decides what to do before the commit would refuse. It also depends on "Measure correctness": automatic correction is accepted only when the scenario set shows no false invalidation.
- **"Act on feedback" depends on "Resolve conflicts"**, because feedback is turned into the same operations under the same correction policy.
- **"Answer within stated time budgets" depends on recall and on the MCP tools being built**, because the benchmark measures them as they are. Nothing is optimised before the benchmark shows a budget missed.
- **"Purge" depends on a rule that is in the first migration**: the audit log holds no free text ([ADR 0012](../architecture/adr/0012-purge-is-the-one-exception.md)).
- **"Verify against sources" depends on sources that carry an anchor**, recorded at write time in phase 1. "Repair anchors" depends on verification, which is what finds an anchor that no longer resolves.
- **"Merge entities" changes what every read returns**, because reads resolve entity identifiers through merges. It depends on the single-value rule, which can refuse a merge.
- **"Archive" depends on usage being recorded outside the read path**, so that recall stays a pure read. Usage counts are bookkeeping, not memory: they are written by the caller after a recall, outside `commit` and with no audit entry.
- **"Serve other storage and transports" depends on the storage contract suite and on thin tool handlers**: the second adapter must pass the same suite, and a route calls the same use case a tool calls.
- **"Serve other domains" depends on the domain being data from the start**, and for domains that need human approval on the proposals built in phase 2. The rule that a later automatic decision does not override a human one is not part of phase 2; it is built with the first such domain.

## Boundaries that must be preserved

The import rules and each package's public API are in [`SYSTEM-BOUNDARIES.md`](../architecture/SYSTEM-BOUNDARIES.md), and the conventions are in [`.claude/rules/architecture.md`](../../.claude/rules/architecture.md). The ones the capabilities above rely on:

| Boundary | Why a capability needs it |
|---|---|
| `core` imports no other `@factloom` package and no database, LLM, embedding or MCP library | A second storage adapter, LLM or embedder can be added without touching the rules about facts ([ADR 0003](../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md)) |
| `graph-rag` and `storage` never import each other | Use cases are tested with the in-memory store, and storage makes no decisions about facts |
| `MemoryStore.commit` is the only way to write | "Every change has an audit entry" cannot be skipped by accident ([ADR 0009](../architecture/adr/0009-one-commit-writes-everything.md)) |
| Product 2, in `packages/maintenance` from phase 2, imports `core` only | Self-correction and self-healing use the operations product 1 exposes and nothing else |
| A tool handler, and later an HTTP route, translates input, calls one use case and translates the result | Every transport gives the same answers |
| Only a domain adapter knows its domain | The core stays generic when further domains arrive |
| Nothing is read or linked across namespaces | One file can hold the memory of several repositories without mixing them ([ADR 0011](../architecture/adr/0011-namespace-on-every-row.md)) |
