# Memwright (now Attestor)

Accessed: 2026-11-13.

## Question

What does Memwright do, how does it handle time, conflict and maintenance, and where is it strong
or weak relative to Factloom's goals?

### Which project was studied

- PyPI `memwright` (latest 2.0.6, uploaded 2026-04-14) points to
  https://github.com/bolnet/agent-memory, which now serves the renamed project **Attestor**
  (https://github.com/bolnet/attestor, PyPI `attestor`, latest 4.1.11, uploaded 2026-05-26). The
  rename came in 3.0.0 on 2026-04-18 (`CHANGELOG.md`, commit `a4a8f6a`). **confirmed**
- Both generations are covered because they differ a great deal. **Memwright 2.0.6** (tag
  `v2.0.6`) is embedded: SQLite + ChromaDB + NetworkX. It is what `pip install memwright` still
  installs, and it was run locally. **Attestor 4.1.11** (commit `e6b5c18`, 2026-09-18) is a rebuild
  on Postgres + Pinecone + Neo4j with "no v3 migration path" (README). It was read in source; one
  function was run in isolation.
- npm has no `memwright` package. One other GitHub repository has the name (skhanzad/memwright, 0
  stars, no description); not studied. **confirmed**

File paths are relative to the repository at the stated tag or commit. **confirmed** = read in
source or registry, or observed by running.

## Findings

### Data model

- Memwright 2.0.6: one `Memory` record, not a graph of facts: `id`, `content` (free text), `tags`,
  `category`, `entity` (one optional string), `namespace`, `created_at`, `event_date`,
  `valid_from`, `valid_until`, `superseded_by`, `confidence`, `status`
  (`active | superseded | archived`), access counters, `content_hash`, `metadata`
  (`agent_memory/models.py`). One SQLite table. An entity graph is derived by a rule-based
  extractor and kept in NetworkX. **confirmed** (source; table observed)
- Attestor 4.1.11: the same record, extended. The Postgres `memories` table adds tenancy columns,
  a `layer` (`episodic | semantic | procedural | working`), transaction-time columns `t_created`
  and `t_expired`, and provenance columns `source_episode_id`, `source_span` (character offsets),
  `extraction_model`, `agent_id`, `parent_agent_id`, `signature` (`attestor/store/schema.sql` lines
  100-141). **confirmed**
- In both, the unit is a text memory with at most one entity, not a subject-predicate-object fact;
  typed triples exist only in the derived graph. **confirmed**

### Time handling

- Memwright 2.0.6: `valid_from` defaults to the write time and `valid_until` is set when a memory
  is superseded; `event_date` is optional and caller-supplied (`models.py`,
  `temporal/manager.py`). No separate retraction time, so not bi-temporal. `memory_timeline` lists
  an entity's memories in date order; there is no "as of" query. **confirmed**
- Attestor 4.1.11: bi-temporal columns exist (`valid_from`, `valid_until`, `t_created`,
  `t_expired`) with a GiST index on the validity range (`schema.sql`). `recall(as_of=...)` and
  `time_window=` filter on both axes in the Postgres document store
  (`store/_postgres_document.py` lines 96-103) and the BM25 lane. **confirmed** (source)
- Limits: the default vector backend ignores `as_of` and logs a warning
  (`store/pinecone_backend.py` lines 310-328), and the MCP tools do not expose it (`memory_recall`
  takes `query`, `budget`, `namespace`). It is a Python API feature. **confirmed** (source)

### Conflict handling

- Memwright 2.0.6, on every `add()`: any active memory with the same `entity`, `category` and
  `namespace` and different text is marked `superseded`, with `valid_until` set to now and
  `superseded_by` pointing to the new memory (`temporal/manager.py`; `core.py` lines 205-213).
  This is invalidate-and-link, but the test is broad enough that unrelated facts about one entity
  supersede each other. **confirmed** (source and run, below)
- Attestor 4.1.11 has two write paths (README "Two write paths, two contracts"): **confirmed**
  - `add()`: rule-based. An older memory is superseded only if it has the same "content skeleton"
    (text with unit-bearing numbers removed) or shares topic tokens near a unit-bearing value. A
    code comment says the earlier rule "over-fired on incremental updates"
    (`attestor/temporal/manager.py`).
  - `ingest_round()`: an LLM resolver returns `ADD`, `UPDATE`, `INVALIDATE` or `NOOP` per extracted
    fact, each carrying an `evidence_episode_id`; a parse failure defaults to `ADD`
    (`attestor/extraction/conflict_resolver.py`).
- The reflection job lists `contradictions_for_review` for human review instead of resolving them
  (README "Reflection engine"; `attestor/consolidation/reflection.py`). **confirmed** (source)

### Maintenance

- Memwright 2.0.6: exact-duplicate suppression by content hash; `forget` and `forget_before(date)`
  archive; `compact()` permanently deletes archived rows (`core.py`, `store/sqlite_store.py`).
  Confidence decay and an access boost act as ranking signals. Nothing is scheduled. **confirmed**
- Attestor 4.1.11: consolidation re-extracts facts from recent episodes with a stronger model; a
  reflection job synthesizes stable preferences; retention policies archive or delete; a rebuild
  job repairs the derived vector and graph stores (`attestor/consolidation/`,
  `attestor/durable/workflows/`). With the optional `attestor[durable]` extra these run as Temporal
  workflows on cron schedules. **confirmed** (source; not run)
- Neither version re-verifies a stored fact against its source, and neither merges duplicate
  entities. **confirmed** (no such code found)

### Retrieval

- Memwright 2.0.6: graph expansion from query tags, tag match, entity lookup and ChromaDB vector
  similarity, fused by reciprocal rank, then PageRank boost, MMR and a fit to a token budget
  (`retrieval/orchestrator.py`). No full-text index. **confirmed** (source)
- Attestor 4.1.11: Pinecone vector top-K, optional Postgres `tsvector` BM25 lane, RRF, Neo4j BFS
  to depth 2 with fixed per-hop bonuses, MMR, confidence decay, budget fit; no LLM in scoring by
  default; a JSONL trace per call (README; `attestor/retrieval/`). **confirmed** (source; not run)

### Sources and audit trail

- Memwright 2.0.6: no source pointer beyond free-form `metadata`; no change log. **confirmed**
- Attestor 4.1.11: the provenance columns above (the README notes `source_episode_id` is set only
  by the consolidation path), an optional Ed25519 signature, and a `forget_audit` row written
  before a user's data is deleted. There is no general log of every change; history is carried by
  superseded rows, and `compact()` is documented as not audited. **confirmed** (README; schema)

### Storage

- Memwright 2.0.6: a directory (default `~/.memwright`) with `memory.db` (SQLite), `chroma/`,
  `graph.json`, `config.json`; no server process. **confirmed** (files observed)
- Its embeddings need an API key despite the README's "No API keys": start-up printed "No embedding
  provider available. Set OPENROUTER_API_KEY or OPENAI_API_KEY. Local sentence-transformers
  fallback has been removed." and the vector store was disabled. **confirmed** (run)
- Attestor 4.1.11: Postgres is the source of truth, Pinecone (or Pinecone Local) holds vectors,
  Neo4j the graph; `DEFAULT_BACKENDS` is `["postgres", "pinecone", "neo4j"]`
  (`attestor/store/registry.py`). `attestor quickstart` starts three Docker containers and expects
  Ollama. No zero-service mode and no SQLite backend. **confirmed** (source; the MCP server failed
  here with "connection to server at localhost, port 5432 failed")

### License and activity

| Item | Memwright | Attestor | Source |
|---|---|---|---|
| Latest version | 2.0.6, 2026-04-14 | 4.1.11, 2026-05-26 | PyPI |
| License | Apache-2.0 | MIT | `pyproject.toml`, `LICENSE` at each ref |
| Last commit | n/a (renamed) | 2026-09-18 | `git log` |
| Stars / forks | n/a | 14 / 1 | GitHub search API |
| Issues | n/a | 0 open, 2 closed; 1 open PR | GitHub search API |
| History | first commit 2026-03-07 | 350 commits: 119 in March, 133 in April, 94 in May, 4 in September 2026 | `git log` |

All **confirmed**. One author. Major versions 2, 3 and 4 were released within eight weeks.

### Install and documentation

- Memwright 2.0.6: `pip install memwright`, then `memwright mcp`. The install was 1.4 GB
  (`sentence-transformers` remains a dependency). **confirmed** (run)
- Attestor 4.1.11: `pipx install attestor && attestor quickstart`, with Docker and Ollama as
  prerequisites. The README is 1,023 lines with file references for each claimed guarantee, plus a
  detailed changelog. **confirmed** (README; not run)

### MCP and coding-agent use

Both versions expose the same eight tools (**confirmed**: listed by the running 2.0.6 server and
read in `attestor/mcp/server.py`):

| Tool | Required | Optional |
|---|---|---|
| `memory_add` | `content` | `tags`, `category`, `entity`, `namespace`, `event_date`, `confidence` |
| `memory_get`, `memory_forget` | `memory_id` | |
| `memory_recall` | `query` | `budget`, `namespace` |
| `memory_search` | | `query`, `category`, `entity`, `namespace`, `status`, `after`, `before`, `limit` |
| `memory_timeline` | `entity` | `namespace` |
| `memory_stats`, `memory_health` | | |

- Claude Code: 2.0.6 documents an `mcpServers` entry (`"command": "memwright", "args": ["mcp"]`);
  Attestor's `quickstart` writes `./.mcp.json` and installs `SessionStart`, `PostToolUse` and
  `Stop` hooks. Neither README covers Codex. **confirmed** (READMEs; not run)

### Observed by running

Memwright 2.0.6, fresh virtual environment (Python 3.13, Linux), stdio driven by a Node JSON-RPC
script, store path in a scratch directory, no API keys set.

1. **Fresh install does not start as an MCP server.** `mcp>=1.0.0` resolved to `mcp` 2.3.0 and
   start-up failed with `AttributeError: 'Server' object has no attribute 'list_tools'`; with
   `pip install "mcp<2"` it started. **confirmed**. Attestor 4.1.11 has the same unpinned
   dependency and decorator (`attestor/mcp/server.py` line 247), so the same failure is **likely**.
2. Scenario, all with `entity: "payments-service"`, `category: "technical"`:

| Step | Call | Result |
|---|---|---|
| 1 | `memory_add` "payments-service uses PostgreSQL 14" | stored |
| 2 | `memory_add` "payments-service is deployed on Kubernetes" | stored; **step 1 became `superseded`** |
| 3 | `memory_add` "payments-service uses MySQL 8, not PostgreSQL" | stored; **step 2 became `superseded`** |
| 4 | `memory_timeline` | three rows; only the MySQL memory is `active` |
| 5 | `memory_recall` "which database does payments-service use" | 0 memories (the vector store was disabled) |
| 6 | `memory_search` query "PostgreSQL", status `superseded` | both superseded rows, including the Kubernetes one |

   In SQLite afterwards the PostgreSQL row has `status = superseded`, `valid_until` set and
   `superseded_by` = the Kubernetes row, which is in turn superseded by the MySQL row.
3. Attestor 4.1.11's rule-based check (`TemporalManager.check_contradictions`), called directly
   with an in-memory stand-in for the store, same entity and category throughout:
   - flagged the older memory: "log retention is 30 days" then "90 days"; "monthly cost is $4,000"
     then "$6,500". An unrelated Kubernetes memory was correctly left alone.
   - flagged nothing: "uses PostgreSQL 14" then "uses MySQL 8, not PostgreSQL"; "runs on Node 20"
     then "Node 22"; "error budget is 5%" then "2%".

   The false positive from 2.0.6 is gone, and so is detection of any change that is not a
   unit-bearing number. Not run: the Attestor stack, its LLM resolver (`ingest_round`),
   consolidation, `as_of` recall, hooks.

### Strengths

Where it is ahead of what a new project can offer today (**confirmed** in source; not run):

- **Governance for shared memory**: six roles, Postgres row-level security per tenant, budgets,
  quotas, optional signatures, audited deletion, retention policies. Not in Factloom's early phases.
- **Bi-temporal columns with an `as_of` query path** in Postgres SQL, with a range index.
- **A deterministic, traceable retrieval pipeline** (RRF, graph bonuses, MMR, budget fit, a JSONL
  trace per call) with no LLM in scoring.
- **Provenance down to a character span** of the source episode, plus the extraction model.
- **An evaluation harness** (LongMemEval, LoCoMo, a synthetic supersession suite in `evals/`) and
  **scheduled maintenance as durable workflows** (Temporal). Benchmark scores were not checked.

### Weaknesses and gaps

- `pip install memwright` gives 2.0.6, which does not start as an MCP server on a fresh install
  today and whose vector search needs an API key the README says is not needed. **confirmed** (run)
- The 2.0.6 conflict rule supersedes unrelated facts about the same entity; the 4.x rule misses
  non-numeric contradictions, so reliable detection depends on the LLM path. **confirmed** (run)
- The current version needs Postgres, Neo4j, a vector service and an embedding service; `as_of` is
  not available through MCP and is ignored by the default vector lane. **confirmed**
- One free-text record with at most one entity; no first-class facts or relations with their own
  validity. No re-verification against sources, no entity merge. **confirmed**
- Rapid change: rename, license change, backend replacement and "no migration path" within three
  months; four commits since May 2026. The README now says "Attestor is no longer 'memory for
  your coding assistant'" and lists a single coding assistant under "Not designed for".
  **confirmed**
- Closed issue #188 notes that a replay is only as trustworthy as the instance operator, since
  nothing anchors the supersession chain externally.
  https://github.com/bolnet/attestor/issues/188 **confirmed** (issue text)

## What it means for Factloom

- The 2.0.6 run supports a design rule: "same entity, different text" is not a conflict. A conflict
  needs the same subject and the same predicate. Factloom's fact schema should make the predicate
  explicit so that conflict candidates are found by key before any LLM is asked. Whether that
  key also needs a qualifier is open: see `../OPEN-QUESTIONS.md`, D-1.
- The 4.x rule-based path shows the opposite failure: safe rules are narrow. The project ended up
  where Factloom plans to start: an LLM deciding `ADD`, `UPDATE`, `INVALIDATE` or `NOOP`, with an
  evidence pointer and `ADD` as the default on a parse failure. Worth adopting.
- Attestor uses the same four time columns Factloom plans. Its vector lane ignoring `as_of`, and
  the MCP tools not exposing it, are a warning: the time filter must be applied in every retrieval
  lane (or after fusion) and offered in the MCP tool, or the feature does not reach the agent.
  Which of the two placements Factloom uses is open: see `../OPEN-QUESTIONS.md`, D-2.
- "Flag contradictions for human review, do not auto-resolve" as a mode matches Factloom's
  per-adapter correction policy.
- Scope caution: the project moved from embedded SQLite to Postgres + Pinecone + Neo4j between
  April and May 2026. Staying on SQLite through the early phases avoids that kind of change.

### Conflicts with settled decisions

None of the settled decisions is contradicted. One piece of evidence bears on the planned first use
(coding-agent memory): this project's author left that market during 2026 on the stated ground that
"the editor vendors shipped memory for free" (README, first paragraph). That is one maintainer's
judgment, not market data; `coding-agent-built-in-memory.md` describes what the vendors ship.

## Open questions

- Attestor's LLM conflict resolver, consolidation and `as_of` recall were read, not run; published
  benchmark results were not examined. **unverified**
- Whether Attestor's MCP server starts with `mcp` 2.x once its backends are up. **unverified**
