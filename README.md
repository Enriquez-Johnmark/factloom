# Kronomind

[![CI](https://github.com/Enriquez-Johnmark/kronomind/actions/workflows/ci.yml/badge.svg)](https://github.com/Enriquez-Johnmark/kronomind/actions/workflows/ci.yml)

A memory layer for AI systems. Kronomind stores what an agent learns as facts that record **when each fact was true** and **when it was learned**, so it can answer three different questions:

- What is true now?
- What was true on a given date?
- What did we believe on a given date?

It then keeps that memory correct: when new information contradicts a stored fact, the old fact is ended or invalidated and linked to its replacement. Nothing is deleted.

**The name.** Kronomind (KRO-no-mind) joins *krono*, time, and *mind*, memory: a memory that knows when each fact was true and when it was learned, and keeps itself correct. Kronomind was called Factloom until 2026-11-27 ([ADR 0025](docs/architecture/adr/0025-the-project-is-named-kronomind.md)).

> **Status: phases 0 to 3 are built.** Memory for coding agents, self-correction and self-healing work, and Kronomind runs with Claude Code as an MCP server, confirmed on an Apple Silicon Mac on 2026-11-25. All 87 work items are complete. Phases 4 to 6, a generic core with Postgres and an HTTP API, document management and other domains, are planned and have no work items yet. The [roadmap](docs/roadmap/ROADMAP.md) has the status of each item.

## What it is for

The first use is memory for coding agents, Claude Code and OpenAI Codex, through an MCP server. An agent can save a decision, a convention or a fix, and recall it in a later session.

The goal is an agent that spends fewer tokens re-discovering what it already learned. It is not met: measured on ten two-session tasks with Claude Code 2.1.332 and claude-sonnet-5-5 on 2026-11-26, Kronomind has not saved tokens against Claude Code's built-in memory. With that memory left on, the agent never called Kronomind ([first report](apps/mcp-server/evals/agent-comparison/results/2026-11-26/report.md)); with it off, the agent reached Kronomind through its tools and the median task cost 17.7% more ([second report](apps/mcp-server/evals/agent-comparison/results/2026-11-26-second/report.md)); with the recall hook of the [registration guide](apps/mcp-server/README.md) added, which puts the matching facts in the context on each prompt, there was no clear difference: −0.5% for the median task, 91 tool calls against 96, and all ten checks passed both ways ([third report](apps/mcp-server/evals/agent-comparison/results/2026-11-26-third/report.md)). On ten tasks that need to know why the code changed, Kronomind cost 19.2% more tokens for the median task and passed 8 of 10 checks against 6 of 10; the agent recorded the reason it was given in only one of ten first sessions, so both configurations found the reasons in the git history ([fourth report](apps/mcp-server/evals/agent-comparison/results/2026-11-26-change-history/report.md)). On ten tasks that need finding code in a 44-file repository, Kronomind was level with Claude Code as shipped (+5.5% for the median task) and cost 15.5% more than a hand-written `CLAUDE.md` map, with every check passing in all three set-ups; the agent recorded two facts in twenty sessions and no map fact, so the self-healing map was never built ([fifth](apps/mcp-server/evals/agent-comparison/results/2026-11-27-codebase-map/report.md) and [sixth report](apps/mcp-server/evals/agent-comparison/results/2026-11-27-codebase-map-claude-md/report.md)). With the map recorded by maintenance instead, Kronomind used 7.6% fewer input tokens in total than Claude Code as shipped and 4.4% fewer than the `CLAUDE.md` map, inside the band the reports count as no clear difference (median task −4.6% and +1.8%), with every check passing ([seventh](apps/mcp-server/evals/agent-comparison/results/2026-11-27-codebase-map-seeded/report.md) and [eighth report](apps/mcp-server/evals/agent-comparison/results/2026-11-27-codebase-map-seeded-claude-md/report.md)). Run again the same day, it used 7.9% and 4.7% fewer in total; the median task was 10.5% cheaper than as shipped, which the report counts as a saving, and 0.7% cheaper than the `CLAUDE.md` map ([ninth](apps/mcp-server/evals/agent-comparison/results/2026-11-27-codebase-map-reseeded/report.md) and [tenth report](apps/mcp-server/evals/agent-comparison/results/2026-11-27-codebase-map-reseeded-claude-md/report.md)). The total held and the median moved by six points between two runs of one set-up, so the saving is about 8% in total against Claude Code as shipped and none against a hand-written map. In both runs a lock error on a new database kept maintenance from recording the map before some first sessions, eight of ten and then five; FL-086 and FL-087 fixed it, and these runs have not been repeated since. Ten tasks show a direction, not a law.

Coding agents already ship file-based memory, and it is free. Kronomind is for what those files cannot do: a fact that has a start and an end, an answer that changes with the date you ask about, a record of why a fact changed, and a check of stored facts against the code they describe.

It is not a business database. It holds knowledge extracted from text, with sources and confidence.

## Two products in one repository

| Product | What it does |
|---|---|
| **Temporal graph RAG** | Stores entities and facts with two time axes. Recalls by meaning (vectors) and by words (full-text search), filtered by time. A third lane, by connection in the graph of entities, is computed but given no weight, because it did not help on the retrieval eval set ([ADR 0020](docs/architecture/adr/0020-recall-defaults-chosen-by-measurement.md)). |
| **Self-correcting and self-healing memory** | Fixes wrong content when new information or feedback contradicts a fact. On a schedule, merges duplicate entities, verifies facts against their sources and archives unused ones. |

## How it is designed

- **One local file.** SQLite with full-text search and vector distance. No server or other service to run.
- **Facts are never edited.** A fact row changes once at most, when it is invalidated. An edit is a new row, and a database trigger enforces it. This keeps both time axes correct with one query condition.
- **Every fact has a source, and every change has an audit entry.**
- **One value at a time.** For a predicate that can hold only one value, such as the test framework a repository uses, no two live facts may overlap in time. The storage layer checks this inside the transaction.
- **Six MCP tools:** `recall`, `remember`, `record_fact`, `invalidate_fact`, `get_fact_history`, `give_feedback`. A recall hook hands an agent the facts that match each prompt without a tool call ([registration guide](apps/mcp-server/README.md)).
- **A small core.** Storage, the LLM and embeddings sit behind interfaces. Only a domain adapter knows about its domain.

Every push runs `pnpm check`, the format check, lint, type check and more than 1,200 tests, on Linux and on macOS with Apple Silicon. The claims the design rests on were first tested with throwaway scripts in [`spikes/`](spikes/).

## Performance

Speed is a requirement with numbers, not an adjective ([REQ-35](docs/product/REQUIREMENTS.md)). The benchmark's first run, on 2026-11-16 on a Linux continuous integration machine, met every budget, with nothing changed to meet one (FL-066 in [EPIC-07](docs/roadmap/epics/EPIC-07.md)):

| Operation | Budget | First run |
|---|---|---|
| `recall` over 10,000 facts, 95th percentile | 150 ms | 98.7 ms |
| `recall` over 100,000 facts, 95th percentile | 500 ms | 350.4 ms |
| `record_fact`, excluding embedding, 95th percentile | 50 ms | 6.0 ms on 10,000 facts |
| Server start, once the embedding model is downloaded | 2 seconds | 553 ms |

The benchmark runs weekly and on demand, and fails when a budget is exceeded by more than 20%. The rule is to measure first and optimise only what misses.

On the owner's MacBook Air (Apple M1), the embedding model embedded a text in 3.3 ms, and the first load took 17 seconds including its download ([Q-23](docs/research/OPEN-QUESTIONS.md)). `remember` is bounded by the LLM call that extracts facts, which took about 3.5 seconds in one test; `record_fact` makes no LLM call.

## What is deliberately left out, and why

Each of these adds a dependency or a model. It is added when a measurement shows it is needed, not before.

| Left out | Why | What would bring it in |
|---|---|---|
| A reranking model | In a small retrieval test, how the result lists were merged changed the outcome more than the choice of embedding model did. A reranker is a second model to download and run on every recall, with no evidence yet that it helps. | The phase 1 retrieval eval showing the merged ranking is not good enough |
| tree-sitter | Checking that a function still exists is done by searching the file for its name. That needs no dependency and works for every language. It cannot tell a definition from a mention. | Text search proving too weak in practice |
| A language server (LSP) | Heavier still: one server per language, started and kept running, to answer a question a text search answers well enough to flag a fact for review. | The same |
| An approximate vector index | Exact search is fast enough at the sizes one repository's memory reaches. | The benchmark missing its target |

## Removing content: purge

Kronomind never deletes a fact. The one exception is a **purge**, for a secret stored by mistake or a request to erase personal data ([ADR 0012](docs/architecture/adr/0012-purge-is-the-one-exception.md)). It replaces the text of a source, of the facts that came only from it and their copies, and of the notes that explained changes to them, with `[purged]`. It then clears the freed pages of the database file. The rows, their dates and their audit entries stay.

A purge is a command a person runs, never an MCP tool, so an agent cannot remove content. It uses the same `KRONOMIND_DB` and `KRONOMIND_NAMESPACE` as the server, from `apps/mcp-server`. First list the sources behind a fact, by the fact identifier that `recall` returned. It prints each source's identifier, kind, locator and observed time, never its content:

```sh
node src/main.ts purge sources <fact-id>
```

Then purge one source, with the reason `secret_stored` or `erasure_requested`:

```sh
node src/main.ts purge source <source-id> --reason secret_stored
```

Stop the server first. If another process is reading the database, the write-ahead log keeps old pages until it stops, and the command says so; run it again then. A purge does not reach backups or copies of the file, entity names, or text already sent to the LLM provider.

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

The stack runs on Linux and on macOS with Apple Silicon, with Node.js 22 and 26: continuous integration checks both systems on every push, and the server was confirmed in Claude Code on macOS 26.5 with Node.js 26 (FL-038).

## How this project is built

Kronomind is developed with AI assistance, and the repository shows that openly: [`CLAUDE.md`](CLAUDE.md) and the rules and skills under [`.claude/`](.claude/) are committed. The author directs the work and approves each stage.

## Licence

[Apache License 2.0](LICENSE).
