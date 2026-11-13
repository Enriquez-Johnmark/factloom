# Competitive analysis: existing memory systems and where Factloom can be better

Accessed: 2026-11-13.

This document is a snapshot. Versions, star counts and issue states are those recorded on 2026-11-13 in the
eight evaluation documents in this directory. It adds no new facts about any system; it only arranges what those
documents found. Factloom does not exist yet: everything said about Factloom here is a goal, not a capability.

## Question

Across Graphiti/Zep, Mem0, Letta, Cognee, Mnemograph, Memwright/Attestor, the MCP reference memory server and
the memory built into Claude Code and Codex: what must Factloom match, where are those systems ahead, and which
few specific, testable advantages should Factloom aim for?

How to read the evidence labels. Each claim cites an evaluation document and section. "run N" means item or step
N of that document's "Observed by running" section (observed by running); "source" or "docs" means read in
source or documentation, not run. Confidence labels (**confirmed**, **likely**) are carried over unchanged from
the cited document. "Not established" means the eight documents do not answer the question. Issue links are as
given in those documents; issues were read, not reproduced.

Claude Code, Codex, the Zep service, the Mem0 Platform, Letta Cloud and the Attestor stack were not run;
statements about them come from documentation or source only.

## Findings

### 1. Scope and versions

| System | Repository / package and version studied | License | Activity snapshot (2026-11-13) | Run locally? |
|---|---|---|---|---|
| Graphiti (library) | `getzep/graphiti` commit `ebef986`; PyPI `graphiti-core` 0.31.2 (2026-10-20) | Apache-2.0 | 32.8k stars; 263 open issues, 294 open PRs; last commit 2026-11-11 | Yes |
| Zep (service) | One documentation page (`help.getzep.com/facts`) and the paper arXiv:2501.13956 | not established | not established | No (needs an account) |
| Mem0 (library) | `mem0ai/mem0` commit `f1791da`; PyPI `mem0ai` 2.2.1, npm `mem0ai` 3.3.1 (both 2026-09-25) | Apache-2.0 | 68.9k stars; 475 open issues, 466 open PRs; last commit 2026-11-06 | Yes (Python library) |
| Mem0 Platform | Documentation pages in the same repository | not established | not established | No (needs an account) |
| Letta Code | `letta-ai/letta-code` commit `bd31b0a`; npm `@letta-ai/letta-code` 0.34.59 | Apache-2.0 | 3.8k stars (25.4k on the retired `letta-ai/letta`); 216 open issues, 135 open PRs; release and commit on 2026-11-13 | Yes (local backend); Cloud and retired V1 server not run |
| Cognee | `topoteretes/cognee` commit `4053f6c`; PyPI `cognee` 1.6.8 (2026-11-12) | Apache-2.0 | 33.3k stars; 772 open issues, 349 open PRs; commit on 2026-11-13 | Yes |
| Mnemograph | `tm42/mnemograph` commit `4136ad7`; PyPI `mnemograph` 0.5.1 (2026-02-14) | MIT | 2 stars; 0 open issues; no commit since 2026-02-14 | Yes (after pinning `mcp<2`) |
| Memwright | PyPI `memwright` 2.0.6 (2026-04-14), tag `v2.0.6` | Apache-2.0 | Renamed to Attestor on 2026-04-18 | Yes (after pinning `mcp<2`) |
| Attestor | `bolnet/attestor` commit `e6b5c18`; PyPI `attestor` 4.1.11 (2026-05-26) | MIT | 14 stars; 0 open issues; 4 commits since May 2026 | No; read in source, one function run in isolation |
| MCP reference memory server | `modelcontextprotocol/servers` `src/memory/` commit `e1dc4b1`; npm `@modelcontextprotocol/server-memory` 2.1.1 (2026-11-11) | Moving from MIT to Apache-2.0 | About 92k stars for the whole monorepo; 16 open issues, 2 open PRs (monorepo) | Yes |
| Claude Code built-in memory | Vendor documentation; npm `@anthropic-ai/claude-code` 2.1.323 | not established | not established | No (documentation only) |
| Codex built-in memory | `openai/codex` commit `69231e1`; npm `@openai/codex` 0.169.0 | not established | Commit on 2026-11-13 | No (documentation and source only) |

Sources: the "Sources used" and "License and activity" sections of each evaluation document; all **confirmed**
there. Star counts come from the GitHub page for some systems and the GitHub search API for others.

### 2. Feature comparison

"Zero-service" means it runs with no separate database or server process. Notes with citations follow the table,
one per row.

| System | Time handling | Conflict handling | Maintenance | Retrieval | Sources and audit trail | Storage / zero-service local run | Install experience | Documentation | MCP for coding agents |
|---|---|---|---|---|---|---|---|---|---|
| Graphiti 0.31.2 | Bi-temporal fact edges; dates inferred by LLM; no single "as of" parameter | LLM judges duplicate and contradiction at write; invalidates, never deletes; no link to replacement | Entity dedup at write (exact, fuzzy, LLM); nothing scheduled | Vector + BM25 + graph traversal; default search includes expired facts | Fact lists its episodes; no audit log | Needs a graph database; embedded Kuzu deprecated | pip + graph DB + LLM key; two dependency failures in run | Extensive | In-repo server, 13 tools, labelled experimental |
| Zep service | Same four time fields documented | not established | not established | not established | not established | Hosted | not established | One page read | not established |
| Mem0 library 2.2.1 | Record time only; caller-set `expiration_date` | Add-only; old and new coexist | Exact-hash dedup; nothing scheduled | Vector + BM25 (some stores) + entity boost, added scores | Per-memory history table; no pointer to source message | Embedded Qdrant + SQLite; zero-service worked | pip; OpenAI key by default; no-LLM write path worked | Large; mixes library and Platform | Hosted MCP only; plugins need a Platform key |
| Mem0 Platform (docs) | Temporal ranking boost; `reference_date` | "Supersede" action; feedback call | Merge, synthesis, decay (off by default) | not established | Pattern memories link to their sources | Hosted | Account required | Same site as library | Hosted MCP; Claude Code plugin with hooks |
| Letta Code 0.34.59 | No valid time; record time from git commits | Agent rewrites text; old value only in git | LLM reflection on triggers; crons | Blocks always in context; local search lexical only | Git log of memory; provenance per commit | Local: files + git, zero-service; Cloud is default | npm; worked first time with an LLM key | Docs site; behaviour lives in prompt files | MCP client only; no memory server found |
| Cognee 1.6.8 | Record time on nodes; `Timestamp` nodes; no validity interval | Conflict review after write; keeps both facts; human can resolve; failed on one example in run | `improve()` on writes; exact-name entity ids; no decay | 20+ search types; default returns LLM-written answer | Edge evidence on; audit ledger off by default | Embedded SQLite + LanceDB + Ladybug; zero-service; no-key mode | pip; 1.3 GB, 2.3 GB after no-key path | Large surface | Server with 6 tools; Claude Code and Codex plugins |
| Mnemograph 0.5.1 | Record time only; replay to past recording time | None for observations; duplicate-entity-name guard | On-demand tools only | One vector per entity + substring; tiered recall | Event log; source is a session id | SQLite directory; zero-service | Fresh install did not start | Extensive for size; some drift | 31 tools; Claude Code hooks |
| Memwright 2.0.6 | `valid_from`/`valid_until`; not bi-temporal; no "as of" | Supersedes same entity + category; links replacement; over-fired in run | Hash dedup; archive; nothing scheduled | Graph, tags, entity, vector; RRF; no full-text index | No source pointer; no change log | SQLite + Chroma + NetworkX, no server; embeddings need a key | Fresh install did not start as MCP server | README claim "No API keys" not met in run | 8 tools; Claude Code config |
| Attestor 4.1.11 (read) | Bi-temporal columns; `as_of` in Python API only | Rule path (numbers with units) and LLM path (ADD/UPDATE/INVALIDATE/NOOP) | Consolidation, reflection, retention; cron via optional Temporal | Vector + optional BM25 + graph; RRF; trace per call | Source span, extraction model, optional signature; no general change log | Postgres + Pinecone + Neo4j; no zero-service mode | pipx + Docker + Ollama | 1,023-line README with file references | Same 8 tools; `as_of` not exposed |
| MCP reference server 2.1.1 | No time fields | None; manual destructive delete | None | Case-insensitive substring; no ranking | None | One JSONL file; zero-service | One `npx` command, no key | Accurate README | 9 annotated tools |
| Claude Code built-in | Last-write `modified` stamp; no validity | Model rewrites its own files | Size reminder only | Index in context, then file reads | Plain Markdown; no change log | Local files | Built in; auto memory on by default | Vendor docs | Not applicable (it is the agent) |
| Codex built-in | `updated_at`; no validity | Consolidation agent rewrites; old text removed | Consolidation and usage-based forgetting at session start | Summary in context, then keyword search | Entries point to session summaries and transcripts | Local files + state database | Built in; memories off by default | Vendor docs and source | Not applicable (it is the agent) |

Notes (all **confirmed** in the cited document unless marked):

- **Graphiti.** `graphiti-zep.md`: "Time handling", "Conflict handling", "Maintenance", "Retrieval", "Sources
  and audit trail", "Storage", "Install and documentation", "MCP and coding-agent use" (read in source). Default
  search returning expired facts: run 8. Kuzu failure: run 4. Dependency failures: run 2 and run 5. Invalidation
  of the Postgres 14 fact: run 7.
- **Mem0 library.** `mem0.md`: all section names as in the column headings (read in source). Coexisting
  statements with the older one ranked first: run 5 and run 6. Zero-service and `infer=False`: run 3. OpenAI key
  by default: run 2.
- **Zep service.** `graphiti-zep.md` "Time handling" (docs) and "Open questions". Not run. **Mem0 Platform.**
  `mem0.md` "Time handling", "Conflict handling", "Maintenance", "Sources and audit trail", "MCP and
  coding-agent use" (documentation only; not run).
- **Letta Code.** `letta.md`: sections as in the headings (read in source). Overwrite with history only in git:
  run 5 and run 6. Zero-service local run: run 3 and run 4.
- **Cognee.** `cognee.md`: sections as in the headings (read in source and the repository's `CLAUDE.md`). No-key
  mode and install size: run 1 and run 3. Conflict review error: run 7. Correct prose answer: run 6. Old passage
  ranked first without a marker in `CHUNKS` search: run 8.
- **Mnemograph.** `mnemograph.md`: sections as in the headings (read in source). Start-up failure and launch
  command: run 1 and run 2 (the `uvx` form is **likely**). Contradiction stored and returned side by side, not
  flagged by the health report: run 3, steps 3, 6 and 8.
- **Memwright 2.0.6.** `memwright.md`: sections as in the headings (read in source). Start-up failure: run 1.
  Over-firing supersession: run 2, steps 2 and 3. Embedding key: "Storage" (run).
- **Attestor 4.1.11.** `memwright.md`: same sections (read in source; not run). Rule-based check behaviour: run
  3 (one function, in isolation). MCP start-up failure with `mcp` 2.x is **likely**.
- **MCP reference server.** `mcp-reference-memory-server.md`: sections as in the headings (read in source). Tool
  list and all behaviours in the table: "Observed by running" steps 1 to 8.
- **Claude Code and Codex.** `coding-agent-built-in-memory.md`: "Claude Code: auto memory", "Codex: memories",
  "Side by side" (documentation and source; nothing run). Record time for the user-written instruction files is
  **likely**.

### 3. What each one does well that Factloom must match

**Graphiti** (`graphiti-zep.md` "Strengths", "Conflict handling", "Maintenance"; **confirmed**)
- Write-time invalidation that keeps the old fact and sets its end dates, with the date comparison in plain code
  and only the "does this contradict" judgement in an LLM call (source; run 7).
- A repeated fact is not stored twice; the new episode is attached to the existing fact (source).
- A write path that stores a known triple without extraction (`add_triplet`) (source).

**Mem0** (`mem0.md` "Strengths", "Observed by running"; **confirmed**)
- A working local setup from one install command with embedded storage (run 3).
- A no-LLM write path (`infer=False`) and exact-hash duplicate suppression before any LLM call (run 3; source).
- For coding agents, capture and recall through hooks, which goes beyond MCP tools (docs).

**Letta Code** (`letta.md` "Strengths", "Observed by running"; **confirmed**)
- Memory a person can read, diff, revert and push with standard tools (run 4 to run 6).
- A readable correction: "uses Postgres 16 (migrated from Postgres 14 in November 2026)" (run 5).

**Cognee** (`cognee.md` "Strengths", "Conflict handling", "Sources and audit trail"; **confirmed**)
- Conflict records that keep both facts, separate time-varying from fixed attributes, store who decided and why,
  and let a human decision persist over later automatic reviews (source).
- Evidence from each extracted edge back to the supporting chunk, and precise "forget this document" through
  source references (source).
**Mnemograph** (`mnemograph.md` "Strengths"; **confirmed**)
- A duplicate-entity warning that tells the model what exists, how similar it is and what to call instead (run
  3, step 4).
- Replay to any past recording time and a per-entity history tool, on SQLite with `sqlite-vec` (source; run 3,
  steps 7 and 9).

**Memwright / Attestor** (`memwright.md` "Strengths", "Conflict handling"; **confirmed**, source)
- A `superseded_by` link from an old memory to its replacement (2.0.6; run 2).
- An LLM resolver whose verdict carries an evidence pointer and defaults to `ADD` on a parse failure; a mode
  that lists contradictions for human review (4.1.11).
- A deterministic retrieval pipeline with a trace per call and no LLM in scoring (4.1.11).

**MCP reference memory server** (`mcp-reference-memory-server.md` "Strengths"; **confirmed**)
- One command to start, no key, no model, no database (run).
- Every tool input described, tools annotated read-only, destructive or idempotent, and a `skipped` report
  instead of silent drops (source; run step 4).
- Atomic writes, a cross-process lock and a test per reported failure mode (source).

**Claude Code and Codex built-in memory** (`coding-agent-built-in-memory.md`; **confirmed**, docs)
- Nothing to install; standing instructions are always in context and shared through git.
- Storage the user can open and edit as plain files.
- Codex: bounded background consolidation at session start, with secrets redacted.

### 4. Where each one is weak, missing, or awkward
**Graphiti** (`graphiti-zep.md` "Weaknesses and gaps"; **confirmed**)
- Default search mixes expired and current facts; "what is true now" is left to the caller (run 8).
- No link from an invalidated fact to its replacement, no audit log, no fact confidence, no feedback channel, no
  scheduled maintenance, no re-verification against sources (source).
- No long-term supported zero-service mode: Kuzu is deprecated and failed in the run (run 4;
  <https://github.com/getzep/graphiti/issues/1132>, <https://github.com/getzep/graphiti/issues/1240>).
- An LLM is required for every write (<https://github.com/getzep/graphiti/issues/1299>); users report ingestion
  cost growth (<https://github.com/getzep/graphiti/issues/1275>,
  <https://github.com/getzep/graphiti/issues/1262>).
- The MCP server is described by its own README as not for production
  (<https://github.com/getzep/graphiti/issues/1574>). Python only.

**Mem0** (`mem0.md` "Weaknesses and gaps"; **confirmed**)
- The library does not resolve contradictions; the stale statement ranked first (run 6).
- No validity time, no point-in-time query, no pointer from a memory to its source message (source).
- Supersession, merging, decay, temporal ranking, MCP and the Claude Code plugin need the hosted Platform
  (docs).
- Reports: <https://github.com/mem0ai/mem0/issues/5440>, <https://github.com/mem0ai/mem0/issues/4884>,
  <https://github.com/mem0ai/mem0/issues/7810>; the Anthropic path failed in the run (run 4).

**Letta Code** (`letta.md` "Weaknesses and gaps"; **confirmed**)
- No structured facts, validity time, point-in-time query, confidence or per-fact source (source).
- Correction overwrites text; the earlier value is recoverable only from git history (run 6).
- Not usable as a memory layer for another agent; no memory MCP server was found (source).
- Reports: <https://github.com/letta-ai/letta-code/issues/5493>,
  <https://github.com/letta-ai/letta-code/issues/3042>, <https://github.com/letta-ai/letta-code/issues/4893>.
  The V1 server and its API were retired in 2026.

**Cognee** (`cognee.md` "Weaknesses and gaps"; **confirmed**)
- No validity interval per fact; "what was true on date X" depends on dated passages and the answering LLM
  (source).
- Conflict review raised an error on a two-sentence example while the call reported success (run 7; one
  observation).
- Ordinary chunk search returned the superseded passage first with no marker (run 8).
- Install weight 1.3 to 2.3 GB (run 1, run 3); audit ledger off by default and per data item.
- Reports: <https://github.com/topoteretes/cognee/issues/6092>,
  <https://github.com/topoteretes/cognee/issues/6077>.

**Mnemograph** (`mnemograph.md` "Weaknesses and gaps"; **confirmed**)
- A fresh install did not start without pinning `mcp<2` (run 1); no commit since 2026-02-14.
- Contradicting observations are stored and returned together; the health report did not flag them (run 3, steps
  3, 6, 8).
- One time axis; provenance is a session id that defaults to `default`; no full-text index.

**Memwright / Attestor** (`memwright.md` "Weaknesses and gaps"; **confirmed**)
- Memwright 2.0.6 did not start as an MCP server on a fresh install (run 1) and its vector search needed an API
  key (run).
- Its conflict rule superseded an unrelated fact about the same entity (run 2); the Attestor 4.x rule-based
  check missed every non-numeric change tried (run 3).
- Attestor needs Postgres, Neo4j, a vector service and an embedding service; `as_of` is not exposed through MCP
  and the default vector lane ignores it (source).
- No re-verification against sources and no entity merge in either version (source).
- Rename, license change and backend replacement within three months, with no migration path;
  <https://github.com/bolnet/attestor/issues/188> on the trust limits of replay.

**MCP reference memory server** (`mcp-reference-memory-server.md` "Weaknesses and gaps"; **confirmed**)
- No time model, provenance, confidence or audit trail; deletion leaves no trace (run step 8).
- Contradictions accumulate silently (run steps 3 and 6).
- A natural-language question returned nothing from substring search (run step 7).
- Whole-file rewrite per mutation (<https://github.com/modelcontextprotocol/servers/issues/5525>);
  <https://github.com/modelcontextprotocol/servers/issues/5541>.

**Claude Code and Codex built-in memory** (`coding-agent-built-in-memory.md` "Side by side"; **confirmed**, docs)
- No valid time, no "what was true on date X", no confidence in either.
- Edits overwrite; no old value is kept and linked (Codex keeps a git baseline and transcripts).
- No vector or graph search; size limits (200 lines or 25 KB index; 32 KiB for `AGENTS.md`); memory written by
  the model stays on one machine.

### 5. Where a competitor is ahead today

This section is not softened. A project that does not exist yet is behind on all of the following.

| Area | Who is ahead and how | Source |
|---|---|---|
| Maturity and adoption | Mem0 68.9k stars; Cognee 33.3k; Graphiti 32.8k; the MCP servers monorepo about 92k. Graphiti, Cognee, Letta Code and the reference server all had commits or releases within three days of access. | "License and activity" in each document; **confirmed** |
| Working bi-temporal invalidation | Graphiti already does write-time invalidation on bi-temporal facts, in production use and described in a paper. It is the same core idea as Factloom's product 1. | `graphiti-zep.md` "Strengths", run 7; **confirmed** |
| Published benchmarks | Graphiti/Zep paper: 94.8% on Deep Memory Retrieval, up to 18.5% improvement on LongMemEval. Mem0: 91.6 on LoCoMo, 93.4 on LongMemEval. Both are the projects' own figures and were not reproduced. Attestor ships an evaluation harness; its scores were not checked. | `graphiti-zep.md` "Strengths"; `mem0.md` "Strengths"; `memwright.md` "Strengths"; **confirmed** as reported claims |
| Hosted offerings | Zep, the Mem0 Platform, Letta Cloud and Cognee Cloud exist. Factloom plans none in phases 0 to 3. | `graphiti-zep.md` "Storage"; `mem0.md`; `letta.md` "Storage"; `cognee.md` "MCP and coding-agent use"; **confirmed** (existence only) |
| Integrations | Mem0: 25 vector stores, 18 LLM provider modules, plugins for at least ten coding agents and frameworks. Graphiti: four graph backends and service SDKs in Python, TypeScript and Go. Cognee: connectors, loaders, several backends. | "Strengths" in each; **confirmed** |
| Automatic capture | Mem0's Claude Code plugin captures and recalls through hooks; Cognee's Codex plugin uses hooks; Attestor and Mnemograph install Claude Code hooks. Factloom phase 1 is MCP tools only. | `mem0.md`, `cognee.md`, `memwright.md`, `mnemograph.md` "MCP and coding-agent use"; **confirmed** (docs; not run) |
| Entity resolution | Graphiti's exact, fuzzy and LLM pipeline runs at write time today. Factloom plans exact and alias matching first and LLM adjudication only in phase 3 (`../technical/entity-resolution.md`). | `graphiti-zep.md` "Maintenance"; **confirmed** |
| Provenance depth | Attestor records a character span and the extraction model; Cognee records per-edge evidence and has an optional hash-chained ledger. | `memwright.md` "Data model"; `cognee.md` "Sources and audit trail"; **confirmed** (source) |
| Features Factloom has not planned for phases 0 to 3 | Community summaries, custom typed entities and five rerankers (Graphiti); a no-API-key extraction mode, a code graph, ontologies and multi-tenant permissions (Cognee); procedural memory as self-written skills (Letta, Codex); roles, row-level security, signatures and retention policies (Attestor); usage-weighted edges and memory branches (Mnemograph). | "Strengths" in each; **confirmed** |
| Operational hardening | The reference server's handling of locks, atomic saves and corrupt lines took dozens of issues to reach. | `mcp-reference-memory-server.md` "Strengths"; **confirmed** |
| Free built-in memory | Claude Code auto memory is on by default; Codex memories is a stable, opt-in feature. A coding-agent user already has file-based memory at no cost and with nothing to install. For one developer on one repository with a few dozen memories, the built-in files are probably enough. | `coding-agent-built-in-memory.md` "What it means for Factloom"; **confirmed** (docs), last sentence is that document's judgment |

One maintainer's view, recorded as such: the author of Memwright/Attestor left coding-assistant memory during
2026, stating in the README that "the editor vendors shipped memory for free", and now lists a single coding
assistant under "Not designed for" (`memwright.md` "Weaknesses and gaps" and "Conflicts with settled decisions";
**confirmed** as README text). This is one maintainer's judgment, not market data.

## What it means for Factloom

Factloom will be built from scratch regardless. The eight documents report no conflict with a settled decision;
two carry a caution about the first use case (the two items above). The response is to aim phase 1 at what the
built-in files do not do: facts that change, questions about the past, and an audit trail.

### 6. Proposed advantages

Five advantages, each following from the settled design. None exists yet. "Our run" means the runs recorded in
the evaluation documents. Scenario tests use the format proposed in `../technical/evaluation.md`.

**A1. Current facts by default, with the superseded fact linked.**
- (a) Default recall returns only facts that are valid now and not invalidated, and each superseded fact is
  linked to its replacement, which Graphiti (expired facts returned by default; no link), the Mem0 library,
  Cognee chunk search, Mnemograph and the MCP reference server did not do in our runs.
- (b) Evidence: `graphiti-zep.md` run 8 and "Conflict handling"; `mem0.md` run 6; `cognee.md` run 8;
  `mnemograph.md` run 3 step 6; `mcp-reference-memory-server.md` run step 6. Qualification: Cognee's default
  recall did answer "Postgres 16" in prose (run 6), and Memwright 2.0.6 does link replacements (run 2).
- (c) Test: both run scenarios as timeline scenarios. Postgres 14 then 16: a "now" query returns 16 and must not
  return 14; the 14 fact has `valid_to` set and a supersession link of kind `succession`. PostgreSQL 14,
  Kubernetes, MySQL 8: the Kubernetes fact stays live (the case where Memwright 2.0.6 over-fired). Target:
  staleness rate 0 and false invalidation rate 0 on the set.
- (d) Work: phase 0, fact schema and supersession link table; phase 1, default time filter in retrieval
  (testable with directly inserted facts, no LLM); phase 2, automatic detection with candidates chosen by
  subject and predicate before any LLM call.
- (e) Risk: the automatic part depends on LLM contradiction accuracy that no project has published. A Graphiti
  caller can already get current facts with a filter (run 9), and the Mem0 Platform documents a supersede action
  whose behaviour is not established.

**A2. One "as of" parameter that reaches the agent.**
- (a) The MCP recall tool takes a single optional date (and a "known at" date) applied in every retrieval lane,
  which Graphiti (caller-built filter lists), Attestor 4.1.11 (`as_of` in the Python API only, ignored by the
  default vector lane) and the other systems (no valid time) do not offer.
- (b) Evidence: `graphiti-zep.md` "Time handling"; `memwright.md` "Time handling"; time sections of the other
  six documents.
- (c) Test: after the Postgres scenario, recall with date 2026-03-01 returns Postgres 14 and not 16. A
  store-level test per lane (vector, full-text, graph) asserts that no fact outside the requested date is
  returned. A schema test asserts the MCP tool exposes the parameter.
- (d) Work: phase 0, time columns and query predicate; phase 1, the filter in each lane and the tool.
- (e) Risk: `valid_from` comes from LLM date extraction, so a wrong date gives a wrong answer with full
  confidence. Graphiti has the data and could add such a parameter quickly.

**A3. A readable history for every fact, with nothing deleted.**
- (a) A history tool returns, for any fact, its earlier versions, what replaced it, why, and the source of each,
  backed by an audit log row per change, which Graphiti (no audit log), the Mem0 library (history per memory but
  no source pointer), Memwright/Attestor (no general change log) and the built-in memories (overwrite) do not
  provide.
- (b) Evidence: "Sources and audit trail" in `graphiti-zep.md`, `mem0.md`, `memwright.md`;
  `coding-agent-built-in-memory.md` "Side by side". Qualification: Mnemograph has a complete event log, Letta
  has git history at file level, and Cognee has per-edge evidence.
- (c) Test: after each scenario, the history call returns the full chain with source ids, and the audit log has
  exactly the expected rows. A store test asserts that no operation reduces the number of fact rows, and that
  the only update to a fact row is setting `invalidated_at` once.
- (d) Work: phase 0, audit log and source schema; phase 1, source pointer on every write and the history tool;
  phase 2, verdict records in the audit log.
- (e) Risk: log growth (Cognee reports that per-node audit rows cost about ten times the source text).

**A4. Bi-temporal memory from a single local file, with start-up tested.**
- (a) Runs bi-temporal facts with supersession from one SQLite file and one MCP server process, which the two
  systems with bi-temporal invalidation do not: Graphiti needs a graph database (its embedded Kuzu driver failed
  in our run) and Attestor needs Postgres, Pinecone and Neo4j.
- (b) Evidence: `graphiti-zep.md` "Storage" and run 4; `memwright.md` "Storage". Related: Mnemograph 0.5.1 and
  Memwright 2.0.6 did not start on a fresh install (`mnemograph.md` run 1; `memwright.md` run 1). Qualification:
  the Mem0 library, Cognee, Letta Code and the reference server all run zero-service, so the advantage is the
  combination, not local storage alone.
- (c) Test: a CI job on a clean machine installs the published package with no other services, starts the server
  over stdio, calls `tools/list`, writes a fact, restarts the process and reads the fact back. It fails if
  install size exceeds a stated budget.
- (d) Work: phase 1 (storage package, MCP server, pinned MCP SDK major version, smoke test).
- (e) Risk: the SQLite vector extension on Apple Silicon has not been tested in this research session. An LLM
  key is still needed for extraction, so this is not a "no key" claim. FalkorDB Lite may give Graphiti a working
  embedded mode.

**A5. Code memories checked against the repository without an LLM.**
- (a) Re-verifies facts that have a code anchor (path, manifest version, script entry) against the repository
  with deterministic checks and supersedes or flags the stale ones, which none of the evaluated systems does: no
  document found re-verification of stored facts against their sources.
- (b) Evidence: "Maintenance" in `graphiti-zep.md`, `mem0.md`, `letta.md`, `cognee.md`, `mnemograph.md`,
  `memwright.md`, `mcp-reference-memory-server.md`; "Side by side" in `coding-agent-built-in-memory.md`. The
  check list is in `../industries/software-development.md`.
- (c) Test: a fixture repository with a stored fact "pins zod at 4.x" sourced from `package.json`. A fixture
  commit changes the version; the verify run supersedes the fact with the new value and source, using an LLM
  client that throws if called. A second fixture deletes a file and expects the anchored fact to be flagged for
  review, not invalidated.
- (d) Work: phase 1, record the anchor (path and blob id) with each code fact; phase 3, the checks with git and
  ripgrep, triggered at session start.
- (e) Risk: only anchored facts can be checked; reasons and preferences cannot. Cognee has a code-graph route
  and could add this. Claude Code already avoids storing what the code shows, which shrinks the set of facts
  this applies to.

Considered and rejected:

| Tempting advantage | Reason for rejecting |
|---|---|
| A mode with no API key, using local extraction | Cognee already has it, at 2.3 GB installed; over-engineering for one developer. A no-LLM write path for known facts is enough. |
| Higher scores on LongMemEval or LoCoMo | Not testable cheaply or fairly; Graphiti and Mem0 already publish figures; see `../technical/evaluation.md`. |
| Hook-based automatic capture | Mem0, Cognee, Attestor and Mnemograph already ship hooks; not an advantage, and later than phase 1. |
| Roles, tenancy, signatures | Attestor already matches; over-engineering before phase 4. |
| More retrieval modes or rerankers | Graphiti and Cognee already exceed anything a solo developer should build; "more" is not testable as better. |
| "Human-readable memory" | Letta and the built-in files are plain text already; Factloom can only match this with an export. |

### 7. Requirements carried forward

1. **REQ-CA-01.** Default recall returns no fact that is invalidated or whose valid time has ended (A1).
2. **REQ-CA-02.** Every invalidation creates a link from the old fact to its replacement, with a kind and a
   reason (A1, A3).
3. **REQ-CA-03.** Conflict candidates are selected by subject and predicate before any LLM call, and the number
   of candidates per call has a fixed upper bound (A1; Graphiti issue 1275; Memwright run).
4. **REQ-CA-04.** The MCP recall tool accepts an optional valid-time date and an optional known-at date, and the
   filter is applied in every retrieval lane (A2).
5. **REQ-CA-05.** No operation deletes a fact row, and every create, invalidate and merge writes one audit log
   row (A3).
6. **REQ-CA-06.** Every fact points to a source, and an MCP history tool returns a fact's chain of versions with
   sources (A3).
7. **REQ-CA-07.** The MCP server runs from one SQLite file with no other service, and data persists across
   process restarts (A4).
8. **REQ-CA-08.** CI installs the published package on a clean machine and starts the server; the MCP SDK and
   LLM SDK major versions are pinned (A4; Mnemograph, Memwright, Graphiti and Mem0 runs).
9. **REQ-CA-09.** Code facts store a repository anchor at write time, and phase 3 verification of anchored facts
   makes no LLM call (A5).
10. **REQ-CA-10.** A write path stores a structured fact with no LLM call (match Mem0 `infer=False`, Graphiti `add_triplet`).
11. **REQ-CA-11.** An exact duplicate fact is stored once, with the new source attached (match Graphiti, Mem0).
12. **REQ-CA-12.** A write resembling an existing entity returns that entity and a suggested call (match Mnemograph).
13. **REQ-CA-13.** Every MCP tool input has a description, every tool has read-only or destructive annotations,
    and skipped items are reported (match the MCP reference server).
14. **REQ-CA-14.** A test compares the documented tool table with `tools/list` (drift seen in Mnemograph).
15. **REQ-CA-15.** Current facts can be exported as Markdown per repository (match Letta, built-in files).
16. **REQ-CA-16.** Correction policy supports "flag for human review" as well as automatic invalidation, and a
    human decision is not overridden by a later automatic one (match Cognee, Attestor).

## Open questions

Not established by the eight documents (all **unverified**):

- Zep service: how it exposes point-in-time search, fact ratings and change history; pricing; license terms;
  whether a self-hosted edition exists.
- Mem0 Platform: how a superseded memory is stored and whether it can be listed or queried for a past state;
  what the feedback call changes; Platform retrieval behaviour; the status of OpenMemory.
- Letta: whether any packaged MCP server exposes Letta memory to other agents; how well reflection resolves
  contradictions over long histories; what Letta Cloud stores.
- Cognee: whether the conflict review error is general; whether a `FactConflict` node was written; what the
  Claude Code and Codex plugins capture; Cognee Cloud.
- Attestor: the LLM resolver, consolidation and `as_of` recall were read, not run; benchmark scores not checked;
  whether its MCP server starts with `mcp` 2.x. Mnemograph: whether `uvx mnemograph` differs from the
  executable.
- Claude Code and Codex: quality of built-in memory in daily use; per-project scoping of Codex memories; vendor
  roadmaps. Either vendor could add temporal or shared memory. Licenses were not recorded.
- None of the published benchmark figures was reproduced. No document measures the accuracy of LLM contradiction
  detection, on which A1 depends. Usage numbers (downloads, active users) are unknown for every system.

Inconsistencies and gaps between the source documents:

- The local runs used two scenarios, so results are not comparable across all systems. Graphiti, Mem0, Letta and
  Cognee were given "uses Postgres 14" then "migrated from Postgres 14 to Postgres 16" (a succession).
  Mnemograph, Memwright and the MCP reference server were given "uses PostgreSQL 14", "deployed on Kubernetes",
  "uses MySQL 8, not PostgreSQL" (a contradiction with an unrelated fact in between).
- `graphiti-zep.md` run 5 reports success with model `claude-haiku-5-5` after pinning the older Anthropic SDK;
  `mem0.md` run 4 reports an API error for the same model because of the `temperature` parameter. Re-checked in
  the Graphiti clone: it also passes `temperature` on every call (`llm_client/anthropic_client.py` line 262,
  default 1). Why one call succeeded and the other failed is not established.
- `graphiti-zep.md` run 10 reports that the FalkorDB Lite database file was not on disk after the process
  exited. The evaluator's scratch directory contains a 5.9 KB `falkor.db` file. It was not re-run here, so
  whether FalkorDB Lite persists data is treated as not established, and A4 does not rely on it.
- Minor: "of the four systems studied" in `mem0.md` and `cognee.md` means Graphiti, Mem0, Letta and Cognee, not
  all eight; star counts come from GitHub pages in four documents and the search API in the others.
