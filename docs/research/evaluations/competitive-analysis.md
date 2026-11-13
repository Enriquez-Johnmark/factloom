# Competitive analysis: existing memory systems and where Factloom can be better

Accessed: 2026-11-13.

This document is a snapshot. Versions, star counts and issue states are those recorded on 2026-11-13 in the
eight evaluation documents in this directory. It arranges what those documents found and adds no new facts about
any system, with one exception: after an independent review, a small number of statements were re-checked against
the cloned source at the same commits. Each is marked "re-checked in source" with path, lines and commit. They
concern the order of Mem0's hash check, LLM use in Graphiti's `add_triplet`, the date parameters of Graphiti's MCP
search tool, the wording of Graphiti's MCP README and of the Attestor README, and two items under
"Inconsistencies and gaps". Nothing was re-run for this document. Factloom does not exist yet: everything said
about Factloom here is a goal, not a capability.

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

Caveat on run results: the local runs used two scenarios, so run results in this table are not comparable across
all systems. Graphiti, Mem0, Letta Code and Cognee were given a succession ("uses Postgres 14", then "migrated
from Postgres 14 to Postgres 16"). Mnemograph, Memwright 2.0.6 and the MCP reference server were given a
contradiction with an unrelated fact in between ("uses PostgreSQL 14", "deployed on Kubernetes", "uses MySQL 8,
not PostgreSQL"). Each run was one short example. Attestor 4.1.11 was not run as a system (one function was
called in isolation), and the hosted services and the built-in memories of Claude Code and Codex were not run at
all; their cells come from source or documentation.

| System | Time handling | Conflict handling | Maintenance | Retrieval | Sources and audit trail | Storage / zero-service local run | Install experience | Documentation | MCP for coding agents |
|---|---|---|---|---|---|---|---|---|---|
| Graphiti 0.31.2 | Bi-temporal fact edges; dates inferred by LLM; no single "as of" parameter | LLM judges duplicate and contradiction at write; a contradicted fact is invalidated, not deleted; no link to replacement; manual tools are hard deletes | Entity dedup at write (exact, fuzzy, LLM); nothing scheduled | Vector + BM25 + graph traversal; default search includes expired facts | Fact lists its episodes; no audit log | Graph database required; embedded options: Kuzu (deprecated, failed in run) and FalkorDB Lite (ran in process; persistence across restarts not established) | pip + graph DB + LLM key; two dependency failures in run | Extensive | In-repo server, 13 tools, labelled experimental |
| Zep service | Same four time fields documented | not established | not established | not established | not established | Hosted | not established | One page read | not established |
| Mem0 library 2.2.1 | Record time only; caller-set `expiration_date` | Add-only; old and new coexist | Exact-hash dedup; nothing scheduled | Vector + BM25 (some stores) + entity boost, added scores | Per-memory history table; no pointer to source message | Embedded Qdrant + SQLite; zero-service worked | pip; OpenAI key by default; no-LLM write path worked | Large; mixes library and Platform | Documented MCP server is hosted; none for the local library found in the repository (OpenMemory status not established); Claude Code plugin needs a Platform key |
| Mem0 Platform (docs) | Temporal ranking boost; `reference_date` | "Supersede" action: older memory marked and linked to its replacement, still returned by default with a badge, excluded with `latest_only=true`; feedback call | Merge, synthesis, decay (off by default) | not established | Pattern memories link to their sources | Hosted | Account required | Same site as library | Hosted MCP; Claude Code plugin with hooks |
| Letta Code 0.34.59 | No valid time; record time from git commits | Agent rewrites text; old value only in git | LLM reflection on triggers; crons | Blocks always in context; local search lexical only | Git log of memory; provenance per commit | Local: files + git, zero-service; Cloud is default | npm; worked first time with an LLM key | Docs site; behaviour lives in prompt files | MCP client only; no memory server found |
| Cognee 1.6.8 | Record time on nodes; `Timestamp` nodes; no validity interval | Conflict review after write; keeps both facts; human can resolve; failed on one example in run | `improve()` on writes; exact-name entity ids; no decay | 20+ search types; default returns LLM-written answer | Edge evidence on; audit ledger off by default | Embedded SQLite + LanceDB + Ladybug; zero-service; no-key mode | pip; 1.3 GB, 2.3 GB after no-key path | Large surface | Server with 6 tools; Claude Code and Codex plugins |
| Mnemograph 0.5.1 | Record time only; replay to past recording time | None for observations; duplicate-entity-name guard | On-demand tools only | One vector per entity + substring; tiered recall | Event log; source is a session id | SQLite directory; zero-service | Fresh install did not start without pinning `mcp<2` (as of 2026-11-13) | Extensive for size; some drift | 31 tools; Claude Code hooks |
| Memwright 2.0.6 | `valid_from`/`valid_until`; not bi-temporal; no "as of" | Supersedes same entity + category; links replacement; over-fired in run | Hash dedup; archive; nothing scheduled | Graph, tags, entity, vector; RRF; no full-text index | No source pointer; no change log | SQLite + Chroma + NetworkX, no server; embeddings need a key | Fresh install did not start as MCP server without pinning `mcp<2` (as of 2026-11-13) | README claim "No API keys" not met in run | 8 tools; Claude Code config |
| Attestor 4.1.11 (read) | Bi-temporal columns; `as_of` in Python API only | Rule path (numbers with units) and LLM path (ADD/UPDATE/INVALIDATE/NOOP) | Consolidation, reflection, retention; cron via optional Temporal | Vector + optional BM25 + graph; RRF; trace per call | Source span, extraction model, optional signature; no general change log | Postgres + Pinecone + Neo4j; no zero-service mode | pipx + Docker + Ollama | 1,023-line README with file references | Same 8 tools; `as_of` not exposed |
| MCP reference server 2.1.1 | No time fields | None; manual destructive delete | Exact-match dedup only; nothing scheduled | Case-insensitive substring; no ranking | None | One JSONL file; zero-service | One `npx` command, no key; Node 24 or later declared | README matched the code where checked | 9 annotated tools |
| Claude Code built-in | Last-write `modified` stamp; no validity | Model rewrites its own files | Size reminder only | Index in context, then file reads | Plain Markdown; no change log | Local files | Built in; auto memory on by default | Vendor docs | Not applicable (it is the agent) |
| Codex built-in | `updated_at`; no validity | Consolidation agent rewrites; old text removed | Consolidation and usage-based forgetting at session start | Summary in context, then keyword search | Entries point to session summaries and transcripts | Local files + state database | Built in; memories off by default | Vendor docs and source | Not applicable (it is the agent) |

Notes (all **confirmed** in the cited document unless marked):

- **Graphiti.** `graphiti-zep.md`: "Time handling", "Conflict handling", "Maintenance", "Retrieval", "Sources
  and audit trail", "Storage", "Install and documentation", "MCP and coding-agent use" (read in source). Default
  search returning expired facts: run 8. Kuzu failure: run 4. FalkorDB Lite in process: runs 6 to 9; graph not
  readable from a second process: run 10 (see "Open questions"). Dependency failures: run 2 and run 5.
  Invalidation of the Postgres 14 fact: run 7.
- **Mem0 library.** `mem0.md`: all section names as in the column headings (read in source). Coexisting
  statements: run 5. The older one ranked first (0.469 against 0.42) with a local embedder and without the
  optional spaCy extra, so BM25 lemmatisation and the entity boost were inactive: run 6. Zero-service and
  `infer=False`: run 3. OpenAI key by default: run 2. MCP: "MCP and coding-agent use" and "Open questions".
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

**Graphiti** (`graphiti-zep.md` "Strengths", "Conflict handling", "Maintenance", "What it means for Factloom";
**confirmed**)
- Write-time invalidation that keeps the old fact and sets its end dates, with the date comparison in plain code
  and only the "does this contradict" judgement in an LLM call (source; run 7).
- A fact repeated verbatim is not stored twice; the new episode is attached to the existing fact (source).
- A write path that stores a known triple without extraction (`add_triplet`) (source).

**Mem0** (`mem0.md` "Strengths", "Observed by running"; **confirmed**)
- A working local setup from one install command with embedded storage (run 3).
- A no-LLM write path (`infer=False`) (run 3), and exact-hash suppression of duplicate memories at write time
  (source). In the library the hash check runs on the extracted statements, after the extraction call
  (re-checked in source at `mem0/memory/main.py`:958 and 1009-1026, commit `f1791da`).
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
- A deterministic retrieval pipeline with a trace per call and no LLM in scoring by default (4.1.11).

**MCP reference memory server** (`mcp-reference-memory-server.md` "Strengths"; **confirmed**)
- One command to start, no key, no model, no database (README; run from a local install).
- Every tool input described, tools annotated read-only, destructive or idempotent, and a `skipped` report
  instead of silent drops (source; run step 4).
- Atomic writes, a cross-process lock with stale-lock recovery, and 16 test files (source).

**Claude Code and Codex built-in memory** (`coding-agent-built-in-memory.md`; **confirmed**, docs)
- Nothing to install; standing instructions are always in context and shared through git.
- Storage the user can open and edit as plain files.
- Codex: bounded background consolidation at session start, with secrets redacted.

### 4. Where each one is weak, missing, or awkward

Run observations below come from the two scenarios described beside the table in section 2 (succession for
Graphiti, Mem0, Letta Code and Cognee; contradiction for Mnemograph, Memwright 2.0.6 and the MCP reference
server), one short example each. They show what happened in that example and are not a ranking across systems.

**Graphiti** (`graphiti-zep.md` "Weaknesses and gaps"; **confirmed**)
- Default search mixes expired and current facts; "what is true now" is left to the caller (run 8).
- No link from an invalidated fact to its replacement, no audit log, no fact confidence, no feedback channel, no
  scheduled maintenance, no re-verification against sources (source).
- Zero-service local use is uncertain: the embedded Kuzu driver is deprecated and failed in the run (run 4;
  <https://github.com/getzep/graphiti/issues/1132>); the embedded FalkorDB Lite extra ran in process (runs 6 to
  9), but the graph was not readable from a second process (run 10), and that observation is in doubt (see "Open
  questions"). A request for embedded FalkorDB is open (<https://github.com/getzep/graphiti/issues/1240>).
- An LLM is required for every write (<https://github.com/getzep/graphiti/issues/1299>); users report ingestion
  cost growth (<https://github.com/getzep/graphiti/issues/1275>,
  <https://github.com/getzep/graphiti/issues/1262>).
- The MCP server's README says not to use it as a production deployment and calls it experimental ("MCP and
  coding-agent use"; wording re-checked in source at `mcp_server/README.md`:10-12, commit `ebef986`). One open
  reliability report: <https://github.com/getzep/graphiti/issues/1574>. Python only.

**Mem0** (`mem0.md` "Weaknesses and gaps"; **confirmed**)
- The library does not resolve contradictions (documented as add-only). In the run the older statement ranked
  first (0.469 against 0.42), with a local embedder and without the optional spaCy extra, so BM25 lemmatisation
  and the entity boost were inactive (run 6).
- No validity time, no point-in-time query, no pointer from a memory to its source message (source).
- Supersession, merging, decay, temporal ranking, the documented MCP server and the Claude Code plugin need the
  hosted Platform (docs). No MCP server for the local library was found in the repository; the status of
  OpenMemory is not established.
- Reports: <https://github.com/mem0ai/mem0/issues/5440>, <https://github.com/mem0ai/mem0/issues/4884>,
  <https://github.com/mem0ai/mem0/issues/7810>. The Anthropic path failed with the current Anthropic SDK and
  with model `claude-haiku-5-5`, and worked with `anthropic<1` and `claude-haiku-4-5` (run 4).

**Letta Code** (`letta.md` "Weaknesses and gaps"; **confirmed**)
- No structured facts, validity time, point-in-time query, confidence or per-fact source (source).
- Correction overwrites text; the earlier value is recoverable only from git history (run 6).
- No MCP server that exposes Letta memory to other agents was found in `letta-code` (source); other Letta
  repositories and the docs site were not searched exhaustively.
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
- Its conflict rule superseded an unrelated fact about the same entity (run 2). The Attestor 4.x rule-based
  check, called in isolation with a stand-in store, flagged two of five changes tried (days and dollar amounts)
  and missed PostgreSQL to MySQL, Node 20 to 22 and 5% to 2% (run 3); the LLM path was not run.
- Attestor needs Postgres, Neo4j, a vector service and an embedding service; `as_of` is not exposed through MCP
  and the default vector lane ignores it (source).
- No re-verification against sources and no entity merge in either version (source).
- Rename, license change and backend replacement within three months, with no migration path;
  <https://github.com/bolnet/attestor/issues/188> on the trust limits of replay.

**MCP reference memory server** (`mcp-reference-memory-server.md` "Weaknesses and gaps"; **confirmed**)
- No time model, provenance, confidence or audit trail; deletion leaves no trace (run step 8).
- Contradictions accumulate silently (run steps 3 and 6).
- A natural-language question returned nothing from substring search (run step 7).
- Whole-file rewrite per mutation (<https://github.com/modelcontextprotocol/servers/issues/5525>; closed;
  described by its reporter as a hardening note); <https://github.com/modelcontextprotocol/servers/issues/5541>.

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
| Automatic capture | Mem0's Claude Code plugin captures and recalls through hooks; Cognee's Codex plugin uses hooks; Attestor installs `SessionStart`, `PostToolUse` and `Stop` hooks and Mnemograph `SessionStart` and `Stop` hooks (Mnemograph's stop hook reminds the agent to save; what Attestor's hooks do was not read). Factloom phase 1 is MCP tools only. | `mem0.md`, `cognee.md`, `memwright.md` "MCP and coding-agent use"; `mnemograph.md` "Maintenance"; **confirmed** (docs and source; not run) |
| Entity resolution | Graphiti's exact, fuzzy and LLM pipeline runs at write time today. Factloom plans exact and alias matching first and LLM adjudication only in phase 3 (`../technical/entity-resolution.md`). | `graphiti-zep.md` "Maintenance"; **confirmed** |
| Provenance depth | Attestor records a character span and the extraction model; Cognee records per-edge evidence and has an optional hash-chained ledger. | `memwright.md` "Data model"; `cognee.md` "Sources and audit trail"; **confirmed** (source) |
| Features Factloom has not planned for phases 0 to 3 | Community summaries, custom typed entities and five rerankers (Graphiti); a no-API-key extraction mode, a code graph, ontologies and multi-tenant permissions (Cognee); procedural memory as self-written skills (Letta; Codex's memory directory also contains `skills/`); roles, row-level security, signatures and retention policies (Attestor); usage-weighted edges and memory branches (Mnemograph). | "Strengths" in each; `coding-agent-built-in-memory.md` "Codex: memories"; **confirmed** |
| Operational hardening | The reference server's handling of locks, atomic saves and corrupt lines took dozens of issues to reach. | `mcp-reference-memory-server.md` "Strengths"; **confirmed** |
| Free built-in memory | Claude Code auto memory is on by default; Codex memories is a stable, opt-in feature. A coding-agent user already has file-based memory at no cost and with nothing to install. For one developer on one repository with a few dozen memories, the built-in files are probably enough. | `coding-agent-built-in-memory.md` "What it means for Factloom"; **confirmed** (docs), last sentence is that document's judgment |

One project's stated view, recorded as such: the Attestor README says the project "is no longer 'memory for your
coding assistant'", giving as one of three reasons that "the editor vendors shipped memory for free", and it
lists a single coding assistant under "Not designed for" (`memwright.md` "Weaknesses and gaps" and "Conflicts
with settled decisions"; **confirmed** as README text; that the README gives three reasons was re-checked in
source at `README.md`:5, commit `e6b5c18`). This is one project's judgment, not market data.

## What it means for Factloom

Factloom will be built from scratch regardless. The eight documents report no conflict with a settled decision;
two carry a caution about the first use case (the "Free built-in memory" row and the Attestor README statement
above). The response is to aim phase 1 at what the
built-in files do not do: facts that change, questions about the past, and an audit trail.

### 6. Proposed advantages

Five advantages, each following from the settled design. None exists yet. "Our run" means the runs recorded in
the evaluation documents. Scenario tests use the format proposed in `../technical/evaluation.md`. Where run
results are compared below, the caveat from section 2 applies: two different scenarios were used (succession for
Graphiti, Mem0, Letta Code and Cognee; contradiction for Mnemograph, Memwright 2.0.6 and the MCP reference
server), each as one short example, and Attestor 4.1.11, the hosted services and the built-in memories were not
run.

**A1. Current facts by default, with the superseded fact linked.**
- (a) Default recall returns only facts that are valid now and not invalidated, and each superseded fact is
  linked to its replacement. Graphiti (expired facts returned by default; no link), the Mem0 library and Cognee
  chunk search did not do this in the succession scenario, and Mnemograph and the MCP reference server did not
  do it in the contradiction scenario.
- (b) Evidence: `graphiti-zep.md` run 8 and "Conflict handling"; `mem0.md` run 6 (with the embedder and spaCy
  caveats given in section 4); `cognee.md` run 8; `mnemograph.md` run 3 step 6; `mcp-reference-memory-server.md`
  run step 6. Qualification: Cognee's default recall did answer "Postgres 16" in prose (run 6). Letta Code's
  memory file held only the current value after the correction (run 5), with the old value in git and no link.
  Memwright 2.0.6 does link replacements (run 2); whether its default recall hides superseded memories was not
  observed (its recall returned nothing in the run). So against Memwright 2.0.6 this advantage is not
  established by a run; the observed difference there is that its rule superseded an unrelated fact.
- (c) Test: both run scenarios as timeline scenarios. Postgres 14 then 16: a "now" query returns 16 and must not
  return 14; the current version of the 14 fact has `valid_to` set (a new row; the earlier row is invalidated)
  and a supersession link of kind `succession`. PostgreSQL 14, Kubernetes, MySQL 8: the Kubernetes fact stays
  live (the case where Memwright 2.0.6 over-fired). Target: staleness rate 0 and false invalidation rate 0 on
  the scenario set defined for phase 2 in the format of `../technical/evaluation.md`; two scenarios alone are
  too few to judge the LLM part.
- (d) Work: phase 0, fact schema and supersession link table; phase 1, default time filter in retrieval
  (testable with directly inserted facts, no LLM); phase 2, automatic detection with candidates chosen by
  subject and predicate before any LLM call.
- (e) Risk: the automatic part depends on LLM contradiction accuracy, which none of the eight documents measured
  (Attestor ships a synthetic supersession suite; its results were not examined). A Graphiti
  caller can already get current facts with a filter (run 9). The hosted Mem0 Platform documents
  supersede-and-link and a current-only read flag (`latest_only=true`), so the combination of a link and a
  current-only read is not unique to Factloom; the documented difference is that the Platform returns superseded
  memories by default and that it is a hosted service (`mem0.md` "Conflict handling" and "What it means for
  Factloom"; documentation only, not run).

**A2. One "as of" parameter that reaches the agent.**
- (a) The MCP recall tool takes a single optional date (and a "known at" date) applied in every retrieval lane.
  None of the systems that were run or read was found to offer that combination. Graphiti exposes date-range
  filters that the caller must combine: filter lists in the library, and four range bounds (`valid_at_after`,
  `valid_at_before`, `invalid_at_after`, `invalid_at_before`) on the MCP tool `search_memory_facts` (the MCP
  parameters are not in `graphiti-zep.md`; re-checked in source at
  `mcp_server/src/graphiti_mcp_server.py`:615-640, commit `ebef986`). Attestor 4.1.11 has `as_of` in the Python
  API only, and its default vector lane ignores it. Memwright 2.0.6 has `valid_from`/`valid_until` but no "as
  of" query. Mnemograph offers record-time replay (`get_state_at`) through MCP but has no valid time. The Mem0
  library, Letta Code, Cognee, the MCP reference server and the built-in memories have no validity interval. How
  the Zep service and the Mem0 Platform (which documents `reference_date`, a ranking boost) expose point-in-time
  search is not established.
- (b) Evidence: `graphiti-zep.md` "Time handling"; `memwright.md` "Time handling"; `mnemograph.md` "Time
  handling" and tool table; `mem0.md` "Time handling"; time sections of the other documents. Qualification:
  dates do reach the agent in Graphiti, as range bounds, and Mnemograph already covers the "known at" half on
  record time. The advantage is one date applied in every lane on both time axes, not the existence of a time
  parameter. Whether a Graphiti MCP caller can get an equivalent "as of" result by combining the four bounds
  was not tested.
- (c) Test: after the Postgres scenario, recall with date 2026-03-01 returns Postgres 14 and not 16, and recall
  with a known-at date before the second write returns Postgres 14 as current. A store-level test per lane
  (vector, full-text, graph) asserts that no fact outside the requested date is returned. A schema test asserts
  the MCP tool exposes both parameters.
- (d) Work: phase 0, time columns and query predicate; phase 1, the filter in each lane and the tool.
- (e) Risk: `valid_from` comes from LLM date extraction, so a wrong date gives a wrong answer with full
  confidence. Graphiti has the data and could add such a parameter quickly.

**A3. A readable history for every fact, with nothing deleted.**
- (a) A history tool returns, for any fact, its earlier versions, what replaced it, why, and the source of each,
  backed by an audit log row per change, which Graphiti (no audit log), the Mem0 library (history per memory but
  no source pointer), Memwright/Attestor (no general change log) and the built-in memories (overwrite) do not
  provide.
- (b) Evidence: "Sources and audit trail" in `graphiti-zep.md`, `mem0.md`, `memwright.md`;
  `coding-agent-built-in-memory.md` "Side by side". Qualification: Mnemograph has a complete event log and a per-entity history tool
  through MCP, Letta
  has git history at file level, and Cognee has per-edge evidence.
- (c) Test: after each scenario, the history call returns the full chain with source ids, and the audit log has
  exactly the expected rows. A store test asserts that no operation reduces the number of fact rows, and that
  the only update to a fact row is setting `invalidated_at` once.
- (d) Work: phase 0, audit log and source schema; phase 1, source pointer on every write and the history tool;
  phase 2, verdict records in the audit log.
- (e) Risk: log growth (Cognee reports that per-node audit rows cost about ten times the source text).

**A4. Bi-temporal memory from a single local file, with start-up tested.**
- (a) Runs bi-temporal facts with supersession from one SQLite file and one MCP server process, with persistence
  across restarts tested in CI. Of the two systems with bi-temporal invalidation, Attestor needs Postgres, a
  vector service and Neo4j; Graphiti needs a graph database, and whether its embedded option (FalkorDB Lite)
  keeps data across restarts was not established in our run.
- (b) Evidence: `graphiti-zep.md` "Storage" and runs 4, 6 to 10; `memwright.md` "Storage" and run 2;
  `mnemograph.md` "Storage". Related: Mnemograph 0.5.1 and Memwright 2.0.6 did not start on a fresh install
  without pinning `mcp<2` (`mnemograph.md` run 1; `memwright.md` run 1). Qualification: the Mem0 library,
  Cognee, Letta Code, the reference server, and (after pinning `mcp<2`) Mnemograph and Memwright 2.0.6 all run
  zero-service. Memwright 2.0.6 has validity dates and supersession links on SQLite, on one time axis. The
  advantage is the combination of two time axes, supersession and a tested start-up, not local storage alone.
  Against Graphiti the distinction is not established: FalkorDB Lite ran bi-temporal invalidation in one process
  with no database server (runs 6 to 9), and if it persists data, what remains is the single SQLite file and the
  start-up test.
- (c) Test: a CI job packs the server into a tarball, installs the tarball into an empty directory with no other
  services, starts it over stdio, calls `tools/list`, writes a fact, restarts the process and reads the fact
  back. It runs on Linux and on macOS arm64. It fails if install size exceeds a budget fixed in phase 1.
- (d) Work: phase 1 (storage package, MCP server, pinned MCP SDK major version, smoke test).
- (e) Risk: the SQLite vector extension on Apple Silicon has not been tested in this research session. An LLM
  key is still needed for extraction, so this is not a "no key" claim. FalkorDB Lite may give Graphiti a working
  embedded mode.

**A5. Code memories checked against the repository without an LLM.**
- (a) Re-verifies facts that have a code anchor (path, manifest version, script entry) against the repository
  with deterministic checks and supersedes or flags the stale ones. No evaluation document found this in any
  system that was run or read: none was found to re-verify a stored fact against its source. The hosted
  services were not examined.
- (b) Evidence: "Maintenance" in `graphiti-zep.md`, `mem0.md`, `letta.md`, `cognee.md`, `mnemograph.md`,
  `memwright.md`, `mcp-reference-memory-server.md`; "Side by side" in `coding-agent-built-in-memory.md`. The
  check list is in `../industries/software-development.md`. Qualification: the source statements are of the
  form "no such code found", not exhaustive searches. Partial overlaps exist: Cognee re-processes changed
  documents (`update`) and has a code-graph route that works without an LLM; Attestor's consolidation
  re-extracts facts from recent episodes with an LLM.
- (c) Test: a fixture repository with a stored fact "pins zod at 4.x" sourced from `package.json`. A fixture
  commit changes the version; the verify run supersedes the fact with the new value and source, using an LLM
  client that throws if called. A second fixture deletes a file and expects the anchored fact to be flagged for
  review, not invalidated.
- (d) Work: phase 1, one optional repository anchor (a path, optionally a blob id) on the source of a code fact,
  recorded at write time and nothing more; phase 3, the checks with git and ripgrep, triggered at session start.
- (e) Risk: only anchored facts can be checked; reasons and preferences cannot. Cognee has a code-graph route
  and could add this. Claude Code is instructed not to store what can be derived from the code, which shrinks
  the set of facts this applies to.

Considered and rejected:

| Tempting advantage | Reason for rejecting |
|---|---|
| A mode with no API key, using local extraction | Cognee already has it, at 2.3 GB installed; over-engineering for one developer. A no-LLM write path for known facts is enough. |
| Higher scores on LongMemEval or LoCoMo | Not testable cheaply or fairly; Graphiti and Mem0 already publish figures; see `../technical/evaluation.md`. |
| Hook-based automatic capture | Mem0, Cognee, Attestor and Mnemograph already ship hooks; not an advantage, and later than phase 1. |
| Roles, tenancy, signatures | Attestor (roles, row-level security, signatures) and Cognee (tenants, permissions) already have these; over-engineering before phase 4. |
| More retrieval modes or rerankers | Graphiti and Cognee already exceed anything a solo developer should build; "more" is not testable as better. |
| "Human-readable memory" | Letta and the built-in files are plain text already; Factloom could only match this with an export, which is deferred (section 7). |

### 7. Requirements carried forward

Identifiers are stable and are not renumbered: REQ-CA-12, REQ-CA-14 and REQ-CA-15 are intentionally unused (see
"Deferred" below). Each requirement names the phase in which it is first checked.

- **REQ-CA-01.** Default recall returns no fact that is invalidated or whose valid time has ended (A1; phase 1).
- **REQ-CA-02.** Every invalidation writes an audit log row with a kind and a reason. When a replacement fact
  exists, a link from the old fact to the replacement is required; when none exists, the audit row alone carries
  the reason (A1, A3; phase 2).
- **REQ-CA-03.** Conflict candidates are selected by subject and predicate before any LLM call, and the number
  of candidates per call has a configured upper bound, with the value set in the phase 2 design (A1; Graphiti
  issue 1275; Memwright run; phase 2).
- **REQ-CA-04.** The MCP recall tool accepts an optional valid-time date and an optional known-at date, and the
  filter is applied in every retrieval lane (A2; phase 1).
- **REQ-CA-05.** No operation deletes a fact row, and every create, invalidate and merge writes one audit log
  row (A3; phase 1 for create and invalidate, merge when it arrives in phase 3).
- **REQ-CA-06.** Every fact points to a source, and an MCP history tool returns a fact's chain of versions with
  sources (A3; phase 1).
- **REQ-CA-07.** The MCP server runs from one SQLite file with no other service, and data persists across
  process restarts (A4; phase 1).
- **REQ-CA-08.** CI installs the packed server on a clean machine (Linux and macOS arm64) and starts it; the MCP
  SDK and LLM SDK major versions are pinned (A4; Mnemograph, Memwright, Graphiti and Mem0 runs; phase 1).
- **REQ-CA-09.** In phase 1, a code fact's source may carry one optional repository anchor recorded at write
  time. In phase 3, verification of anchored facts makes no LLM call (A5).
- **REQ-CA-10.** A write path stores a structured fact with no LLM call, as Mem0's `infer=False` does (phase 1).
  Graphiti's `add_triplet` is not a match for this: it skips extraction but passes the LLM client to edge
  resolution, which uses it for duplicate and contradiction checks against candidate facts (re-checked in source
  at `graphiti_core/graphiti.py`:2033-2165 and `graphiti_core/utils/maintenance/edge_operations.py`:905-990,
  commit `ebef986`; `graphiti-zep.md` says only "without extraction").
- **REQ-CA-11.** An exact duplicate fact is stored once, with the new source attached (Graphiti attaches the new
  episode; Mem0 suppresses the duplicate; phase 1).
- **REQ-CA-13.** Every MCP tool input has a description, every tool has read-only or destructive annotations,
  and skipped items are reported (match the MCP reference server; phase 1).
- **REQ-CA-16.** Correction policy supports "flag for human review" as well as automatic invalidation (match
  Cognee, Attestor; phase 2).

Deferred, not required for phases 0 to 3:

- **REQ-CA-12, similar-entity suggestion** (a write resembling an existing entity returns that entity and a
  suggested call, as Mnemograph does): "resembling" has no checkable definition yet; exact and alias matching is
  already planned in `../technical/entity-resolution.md`.
- **REQ-CA-14, test comparing the documented tool table with `tools/list`** (drift seen in Mnemograph): with a
  handful of tools the table can be generated from the tool schemas, and the requirement serves none of A1 to
  A5.
- **REQ-CA-15, Markdown export of current facts per repository** (as in Letta and the built-in files):
  "human-readable memory" was rejected as an advantage above, and the history tool (REQ-CA-06) covers
  inspection.
- **Second half of REQ-CA-16, "a human decision is not overridden by a later automatic one"** (as in Cognee):
  needed only once an adapter requires human approval, which is after phase 3.

## Open questions

Not established by the eight documents (all **unverified**):

- Zep service: how it exposes point-in-time search, fact ratings and change history; pricing; license terms;
  whether a self-hosted edition exists.
- Mem0 Platform: its supersede behaviour was read in documentation, not run; whether a past state can be
  queried by date; what the feedback call changes; Platform retrieval behaviour; the status of OpenMemory.
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

- The local runs used two scenarios, so results are not comparable across all systems (stated in full beside
  the table in section 2 and repeated in sections 4 and 6). Graphiti, Mem0, Letta and Cognee were given "uses
  Postgres 14" then "migrated from Postgres 14 to Postgres 16" (a succession). Mnemograph, Memwright and the MCP
  reference server were given "uses PostgreSQL 14", "deployed on Kubernetes", "uses MySQL 8, not PostgreSQL" (a
  contradiction with an unrelated fact in between). The built-in memories were not run.
- `graphiti-zep.md` run 5 reports success with model `claude-haiku-5-5` after pinning the older Anthropic SDK;
  `mem0.md` run 4 reports an API error for the same model because of the `temperature` parameter. Not in either
  document; re-checked in source at `graphiti_core/llm_client/anthropic_client.py`:262, commit `ebef986`:
  Graphiti also passes `temperature` on that call. Why one call succeeded and the other failed is not
  established.
- `graphiti-zep.md` run 10 reports that the FalkorDB Lite database file was not on disk after the process
  exited. Not in that document; re-checked by listing the files of that run, which are not part of this
  repository: a 5.9 KB `falkor.db` file was left on disk. Nothing was re-run, so whether FalkorDB Lite persists
  data is treated as not established, and A4 says so.
- `mem0.md` "What it means for Factloom" lists "exact-hash duplicate suppression before any LLM call" as worth
  copying. That ordering is Factloom's intended variation; in the Mem0 library the hash check runs after the
  extraction call (see section 3).
- Minor: "of the four systems studied" in `cognee.md` means Graphiti, Mem0, Letta and Cognee, not
  all eight; star counts come from GitHub pages in four documents and the search API in three others (the
  built-in memory document has no star counts).
