# Architecture

What Factloom is, how it is divided, how data moves through it, and where to find things. Terms in bold are defined in [`GLOSSARY.md`](../../GLOSSARY.md).

## What it is

Factloom is a memory layer for AI systems. It is two products in one repository.

- **Product 1, temporal graph RAG.** Stores knowledge as entities and facts. Each fact records when it was true (**valid time**) and when Factloom believed it (**recorded time**). It recalls facts by meaning, by words and by connection, filtered by time, so it can answer "what is true now", "what was true on a date" and "what did we believe on a date".
- **Product 2, self-correcting and self-healing memory.** Keeps that knowledge true and tidy. It changes memory only through operations that product 1 exposes.

Its first use is memory for coding agents, Claude Code and OpenAI Codex, through an MCP server. It is not a business database: it holds knowledge extracted from text, with sources and confidence.

## Packages

```
packages/
  core/         types, schemas, interfaces, the Result type, fact operations
  graph-rag/    product 1 use cases: remember, change a fact, recall, fact history
  storage/      the SQLite adapter for the storage interface
apps/
  mcp-server/   the MCP server, and the composition root
```

Dependencies point inward, and only `apps/mcp-server` knows which concrete implementations exist. Which package may import which, and each package's public API, are in [`SYSTEM-BOUNDARIES.md`](SYSTEM-BOUNDARIES.md).

| Package | Owns | Does not contain |
|---|---|---|
| `@factloom/core` | Zod schemas and the types derived from them. The interfaces `MemoryStore`, `LlmClient` and `Embedder`. `Result` and the error codes. The fact operations: record, invalidate, end, find conflict candidates. An in-memory store and the other test helpers | SQL, an LLM SDK, an embedding library, a test framework, anything about MCP |
| `@factloom/graph-rag` | The use cases `remember`, `recordStructuredFacts`, `changeFact`, `recall`, `getFactHistory`. Rank fusion. The software development **domain**, until a second domain exists | SQL, concrete clients |
| `@factloom/storage` | `SqliteMemoryStore`, its SQL, and the migrations. The storage contract suite, until a second adapter exists | Decisions about facts. It enforces rules; it does not make choices |
| `apps/mcp-server` | Tool definitions and handlers. Configuration. The Anthropic `LlmClient` and the local `Embedder`. The wiring | Rules about facts |

Packages added later, each when its phase starts: `packages/maintenance` for product 2, `packages/adapters` in phase 4, when the software development domain moves out of `graph-rag`, a Postgres adapter, and `apps/api`.

## How data flows

### Remember

```
agent ── remember(text) ──► mcp-server handler
                              │ translate input
                              ▼
                        graph-rag: remember
                              │ 1. LlmClient extracts entities and facts, using the domain
                              │ 2. resolve each entity against existing ones (exact name)
                              │ 3. core: findConflictCandidates, for each fact
                              │ 4. sort into restated, conflicting and new
                              ▼
                        core: recordFacts
                              │ 5. Embedder embeds each new statement
                              │ 6. build one change set: source, entities, new facts,
                              │    and the source attached to each restated fact
                              ▼
                        MemoryStore.commit ──► one transaction: the changes, the single-value
                                               rule, and one audit entry per change
```

A restated fact gains the source and no new row. A conflicting fact is returned to the agent as skipped. The store enforces the **single-value rule** inside the commit, so a conflict that step 4 could not see, because another process wrote in between, still fails the commit.

Phase 2 replaces the deterministic sorting in step 4 with conflict handling: product 2 compares each new fact with the candidates, judges the pair, and either acts or proposes, according to the domain's **correction policy**. It then calls the same operations an agent reaches today through `changeFact`: `endFact` for a **succession**, `invalidateFact` for a **correction**.

### Recall

```
agent ── recall(question, as_of?, known_at?) ──► mcp-server handler
                              ▼
                        graph-rag: recall
                              │ 1. Embedder embeds the question
                              │ 2. vector lane and keyword lane, each with the time filter
                              │ 3. graph lane: one step out from the entities found, ranked by
                              │    how many of them a fact touches, then by recency
                              │ 4. rank fusion over the three ranked lists
                              ▼
                        facts with sources, confidence and score
```

The time filter is two dates, both defaulting to now. If only the known-at date is given, the as-of date takes the same date. The filter is applied inside every lane. See "The time predicate" in [`SCHEMA.md`](SCHEMA.md).

### Background, from phase 3

On a schedule, product 2 merges duplicate entities, repairs links, verifies **stale facts** against their sources with deterministic checks before any LLM call, and archives unused facts. It uses the same operations and the same audit log.

## Decisions that shape everything else

| Decision | Where it is explained |
|---|---|
| A fact row changes only by being invalidated once. An edit is a new row | [ADR 0006](adr/0006-facts-change-only-by-invalidation.md) |
| One `commit` writes facts, sources, embeddings and audit entries together | [ADR 0009](adr/0009-one-commit-writes-everything.md) |
| The same four-condition time predicate in every read | [`SCHEMA.md`](SCHEMA.md) |
| Fallible operations return a `Result`; dependencies are passed as arguments | [`.claude/rules/architecture.md`](../../.claude/rules/architecture.md) |

All decisions are indexed in [`DECISIONS.md`](DECISIONS.md).

## Where to find things

| Looking for | Go to |
|---|---|
| What a term means | [`GLOSSARY.md`](../../GLOSSARY.md) |
| The tables and the rules they enforce | [`SCHEMA.md`](SCHEMA.md) |
| The storage, LLM and embeddings interfaces, and the fact operations | [`INTERFACES.md`](INTERFACES.md) |
| The MCP tools | [`MCP-TOOLS.md`](MCP-TOOLS.md) |
| Which package may import which | [`SYSTEM-BOUNDARIES.md`](SYSTEM-BOUNDARIES.md) |
| How it is tested and measured | [`TESTING.md`](TESTING.md) |
| Why a decision was made | [`DECISIONS.md`](DECISIONS.md) and [`adr/`](adr/) |
| Coding conventions | [`.claude/rules/`](../../.claude/rules/) |
| What was learned before designing | [`docs/research/`](../research/) |
| What is still unverified | [`docs/research/OPEN-QUESTIONS.md`](../research/OPEN-QUESTIONS.md) |

In code, a feature lives in one file named for it. The use case `recall` is `packages/graph-rag/src/recall.ts`; the operation `invalidateFact` is `packages/core/src/operations/invalidate-fact.ts`; the tool `recall` is `apps/mcp-server/src/tools/recall.ts`.
