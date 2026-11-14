# Factloom

A memory layer for AI systems. Factloom stores what an agent learns as facts that record **when each fact was true** and **when it was learned**, so it can answer three different questions:

- What is true now?
- What was true on a given date?
- What did we believe on a given date?

It then keeps that memory correct: when new information contradicts a stored fact, the old fact is ended or invalidated and linked to its replacement. Nothing is deleted.

> **Status: design stage.** Nothing is implemented yet. This repository holds the research, the architecture, the roadmap and an empty workspace whose tooling is proven. The features below are goals, and the roadmap says which work item delivers each one.

## What it is for

The first use is memory for coding agents, Claude Code and OpenAI Codex, through an MCP server. An agent can save a decision, a convention or a fix, and recall it in a later session.

The goal is an agent that spends fewer tokens re-discovering what it already learned. That is a goal, not a result: a work item in the roadmap measures token use and tool calls with and without Factloom and publishes the outcome whatever it shows.

Coding agents already ship file-based memory, and it is free. Factloom is for what those files cannot do: a fact that has a start and an end, an answer that changes with the date you ask about, a record of why a fact changed, and a check of stored facts against the code they describe.

It is not a business database. It holds knowledge extracted from text, with sources and confidence.

## Two products in one repository

| Product | What it does |
|---|---|
| **Temporal graph RAG** | Stores entities and facts with two time axes. Recalls by meaning (vectors), by words (full-text search) and by connection (the graph of entities), filtered by time. |
| **Self-correcting and self-healing memory** | Fixes wrong content when new information or feedback contradicts a fact. On a schedule, merges duplicate entities, verifies facts against their sources and archives unused ones. |

## How it is designed

- **One local file.** SQLite with full-text search and vector distance. No server or other service to run.
- **Facts are never edited.** A fact row changes once at most, when it is invalidated. An edit is a new row, and a database trigger enforces it. This keeps both time axes correct with one query condition.
- **Every fact has a source, and every change has an audit entry.**
- **One value at a time.** For a predicate that can hold only one value, such as the test framework a repository uses, no two live facts may overlap in time. The storage layer checks this inside the transaction.
- **Five MCP tools:** `recall`, `remember`, `record_fact`, `invalidate_fact`, `get_fact_history`.
- **A small core.** Storage, the LLM and embeddings sit behind interfaces. Only a domain adapter knows about its domain.

The design was checked by running it where it could be: the schema passes 31 checks covering the time rules, and the interface signatures type-check under the project's strict compiler settings. See [`spikes/`](spikes/).

## Performance

Speed is a requirement with numbers, not an adjective. These are **targets** until the first benchmark confirms or revises them ([REQ-35](docs/product/REQUIREMENTS.md)):

| Operation | Target |
|---|---|
| `recall` over 10,000 facts | 150 ms at the 95th percentile |
| `recall` over 100,000 facts | 500 ms at the 95th percentile |
| `record_fact`, excluding embedding | 50 ms |
| Server start, once the embedding model is downloaded | 2 seconds |

A benchmark work item measures these and fails when a target is missed. The rule is to measure first and optimise only what misses.

What has been measured so far, on a Linux VM and not on a developer machine: exact vector search over 10,000 vectors took about 10 ms, and embedding one short text took about 5 to 7 ms. `remember` is bounded by the LLM call that extracts facts, which took about 3.5 seconds in one test; `record_fact` makes no LLM call.

## What is deliberately left out, and why

Each of these adds a dependency or a model. It is added when a measurement shows it is needed, not before.

| Left out | Why | What would bring it in |
|---|---|---|
| A reranking model | In a small retrieval test, how the result lists were merged changed the outcome more than the choice of embedding model did. A reranker is a second model to download and run on every recall, with no evidence yet that it helps. | The phase 1 retrieval eval showing the merged ranking is not good enough |
| tree-sitter | Checking that a function still exists is done by searching the file for its name. That needs no dependency and works for every language. It cannot tell a definition from a mention. | Text search proving too weak in practice |
| A language server (LSP) | Heavier still: one server per language, started and kept running, to answer a question a text search answers well enough to flag a fact for review. | The same |
| An approximate vector index | Exact search is fast enough at the sizes one repository's memory reaches. | The benchmark missing its target |

## Roadmap

| Phase | Capability |
|---|---|
| 0 | Foundations: the workspace checks itself, the core model exists as types, the test scenarios exist as data |
| 1 | Memory for coding agents: save and recall through the MCP server, with as-of and known-at questions |
| 2 | Self-correction: conflicts resolved at write time, feedback acted on, content can be purged |
| 3 | Self-healing: facts verified against the repository without an LLM, duplicates merged, unused facts archived |
| 4 | A generic core, Postgres and an HTTP API |
| 5 | Document management |
| 6 | Adapters for further domains |

The full plan, with every work item and its dependencies, is in [`docs/roadmap/ROADMAP.md`](docs/roadmap/ROADMAP.md).

## Where to read more

| To find | Read |
|---|---|
| What a term means | [`GLOSSARY.md`](GLOSSARY.md) |
| What the product must do | [`docs/product/`](docs/product/) |
| How it is built | [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) |
| The tables and their rules | [`docs/architecture/SCHEMA.md`](docs/architecture/SCHEMA.md) |
| The MCP tools | [`docs/architecture/MCP-TOOLS.md`](docs/architecture/MCP-TOOLS.md) |
| Why a decision was made | [`docs/architecture/DECISIONS.md`](docs/architecture/DECISIONS.md) |
| How existing systems compare | [`docs/research/evaluations/competitive-analysis.md`](docs/research/evaluations/competitive-analysis.md) |
| What is still unverified | [`docs/research/OPEN-QUESTIONS.md`](docs/research/OPEN-QUESTIONS.md) |

## Technology

TypeScript on Node.js in a pnpm monorepo. SQLite through `better-sqlite3`, with FTS5 and `sqlite-vec`. Zod for schemas, the MCP TypeScript SDK, Vitest. Claude through the Anthropic API for extraction, behind an interface. A local embedding model, `bge-small-en-v1.5`, so no text leaves the machine to be embedded. The reasons are in the [decision records](docs/architecture/DECISIONS.md).

The stack has been run on Linux with Node.js 22, and on macOS with Apple Silicon and Node.js 24: the workspace check and the schema checks with the SQLite driver and the vector extension pass on both.

## How this project is built

Factloom is developed with AI assistance, and the repository shows that openly: [`CLAUDE.md`](CLAUDE.md) and the rules and skills under [`.claude/`](.claude/) are committed. The author directs the work and approves each stage.

## Licence

[Apache License 2.0](LICENSE).
