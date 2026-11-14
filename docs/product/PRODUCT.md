# Product direction

What Factloom is for, who it serves, and what each delivery phase must show. Nothing described here is implemented yet: the project is at the design stage. Terms in bold are defined in [`GLOSSARY.md`](../../GLOSSARY.md). How the system is built is in [`ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) and is not repeated here.

## What it is meant to accomplish

An AI system that works on the same subject for weeks learns things that later stop being true. Factloom is a memory layer that keeps such knowledge as **facts** with their **sources**, records when each fact was true and when it was learned, and keeps the result correct as the world changes.

Three questions must have a reliable answer:

1. What is true now?
2. What was true on a given date?
3. What did we believe on a given date, and why did that belief change?

## Who it is for

| Who | Relation to Factloom | What they need from it |
|---|---|---|
| The coding agent (Claude Code, OpenAI Codex) | The direct user. It calls the MCP tools | Few tools with clear descriptions, answers it can act on, errors that say what to do next |
| The developer who relies on the agent | Benefits without calling Factloom directly | Memory that survives restarts, does not return superseded facts, and can show where a fact came from |
| Teams in other domains, later | Users of a **domain adapter** from phase 5 on: document management, then legal, compliance and regulation, healthcare, customer support and CRM, enterprise knowledge management, finance and research, manufacturing and operations | The same three answers for their own entity types and predicates, with human approval where their domain requires it |
| The single maintainer | Designs, builds and operates everything | A small codebase with enforced boundaries, one check command, and work items that fit one focused session |

## What it is not

- **Not a business database.** It holds knowledge extracted from text, with sources and a **confidence**. It is not the system of record for orders, tickets or patient data.
- **Not a replacement for instruction files.** A rule that must always apply belongs in `CLAUDE.md` or `AGENTS.md` ([research](../research/evaluations/coding-agent-built-in-memory.md)).
- **Not a hosted service.** Phases 0 to 3 run from one local SQLite file.
- **Not a time-series store.** Sensor data and metrics streams are out of scope.

## Two products and how they interact

- **Product 1, temporal graph RAG**, records entities and facts on two time axes and answers questions by **recall**, filtered by time.
- **Product 2, self-correcting and self-healing memory**, keeps that knowledge true (**self-correction**) and tidy (**self-healing**).

Product 2 has no storage of its own and no private way to write. It changes memory only through the fact operations that product 1 exposes, so every change it makes passes the same rules and leaves the same **audit entries** as a change made by an agent. The operations are listed in [`INTERFACES.md`](../architecture/INTERFACES.md). This is requirement REQ-24 in [`REQUIREMENTS.md`](REQUIREMENTS.md).

## What success looks like, by phase

Each phase is complete when its statement can be shown on a real system, not when its code exists. The work is in [`docs/roadmap/`](../roadmap/README.md).

| Phase | Name | Demonstrable result |
|---|---|---|
| 0 | Foundations and design proof | On a fresh clone, `pnpm check` passes on Linux and on macOS arm64 in continuous integration. A forbidden import between packages makes the check fail. The storage contract suite passes against the in-memory store. The eleven "fact changed over time" scenarios exist as reviewed data files that pass their schema |
| 1 | Product 1 for code | In a real repository, Claude Code and Codex each register the MCP server from the written guide, **remember** a project note, and recall it after the server process is restarted. After "PostgreSQL 14" is ended and "PostgreSQL 16" recorded, recall returns 16 for now, 14 for an earlier **as-of date**, and 14 for a **known-at date** before the change was recorded. Everything is in one SQLite file with no other service, on the owner's Apple Silicon machine. A benchmark shows that `recall`, `record_fact` and server start meet the time budgets of REQ-35, or the budgets are revised from what it measured |
| 2 | Self-correction | An agent remembers "we switched the unit tests from Jest to Vitest" and, with no further tool call, the Jest fact is ended and linked to the Vitest fact. On the scenario set, replayed, the staleness rate and the false invalidation rate are both 0. **Feedback** given on a recalled fact is on record and leads to a recorded change. A secret stored by mistake is removed by a **purge** that a person runs with a command, and the record that it existed remains |
| 3 | Self-healing | In a real repository, one maintenance run notices that a version recorded from a manifest no longer matches the file and supersedes or flags the fact, using an LLM client that fails if it is called. It flags a fact about a function whose name is no longer in its file. It merges two duplicate entities and the merge can be undone. After a file is renamed in git, the **anchor** of its facts is repaired. Facts unused for the configured period are archived and can be restored |

Phases 4 to 6 (a generic core with Postgres and an HTTP API, document management, and adapters for further domains) are described as epics only. Their success criteria are in [EPIC-10](../roadmap/epics/EPIC-10.md), [EPIC-11](../roadmap/epics/EPIC-11.md) and [EPIC-12](../roadmap/epics/EPIC-12.md).

## Where it stands relative to existing systems

Several existing projects already do parts of this, and are ahead today in maturity, integrations and published benchmarks; the [competitive analysis](../research/evaluations/competitive-analysis.md) records where, without softening it. Coding agents also ship their own file-based memory at no cost: Claude Code's auto memory is on by default and Codex's memories are opt-in, and for one developer with a few dozen memories those files are probably enough ([research](../research/evaluations/coding-agent-built-in-memory.md)). Factloom therefore aims at the cases those files handle badly: facts that change, questions about the past, and an audit trail. The five intended advantages in section 6 of the competitive analysis are goals with a test attached to each, not existing features, and none is claimed until its test passes.

## Constraints on the product

- One maintainer. Each phase builds only what it needs ([engineering principles](../../.claude/rules/engineering-principles.md)).
- The repository is public and licensed under Apache-2.0 ([ADR 0018](../architecture/adr/0018-apache-2-licence.md)).
- Built from scratch, not on an existing memory project ([ADR 0002](../architecture/adr/0002-built-from-scratch.md)).
- The `remember` tool sends text to the LLM provider. Recording a structured fact and every recall need no LLM call ([`MCP-TOOLS.md`](../architecture/MCP-TOOLS.md)).
