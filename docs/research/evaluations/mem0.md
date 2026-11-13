# Evaluation: Mem0

Accessed: 2026-11-13.

## Question

What does Mem0 do, how does it handle time, conflict and maintenance, and where is it strong or
weak relative to Factloom's goals?

## Findings

Sources used throughout:

- Source: `mem0ai/mem0` at commit `f1791da` (2026-11-06), cloned 2026-11-13. Paths below are
  relative to that repository. <https://github.com/mem0ai/mem0>
- Packages: `mem0ai` 2.2.1 on PyPI (2026-09-25), `mem0ai` 3.3.1 on npm (2026-09-25).
  <https://pypi.org/project/mem0ai/>, <https://www.npmjs.com/package/mem0ai>
- Paper: arXiv:2504.19413 (cited in `README.md` line 273).

Labels: **confirmed** = read in a primary source or observed by running; **likely** = secondary
support; unverified items are only in "Open questions".

Mem0 has three forms: an open-source library (Python and TypeScript), a self-hosted server
(`server/`, Docker Compose), and the hosted Mem0 Platform. `README.md` lines 120-128. Several
features exist only on the Platform; each finding says which form it applies to. I could not run
the Platform (it needs an account), so Platform findings are from documentation only.

### Data model

- A memory is one short text statement stored as a vector-store record. Payload fields: `data`
  (the text), `hash` (MD5 of the text), `created_at`, `updated_at`, scope ids (`user_id`,
  `agent_id`, `run_id`), `actor_id`, `role`, optional `expiration_date`, and free metadata.
  `mem0/memory/main.py` lines 1022-1037, 1695-1722. **confirmed**
- The open-source library has no graph. The migration guide states: "Graph memory is removed
  from OSS ... graph memory is a Mem0 Platform feature".
  `docs/migration/oss-v2-to-v3.mdx` lines 19, 332-338. There is no `mem0/graphs` package in the
  repository. **confirmed**
- The library keeps a second vector collection, `{collection}_entities`, that maps extracted
  entity strings to the memories that mention them. It is used only to boost ranking.
  `docs/migration/oss-v2-to-v3.mdx` line 326; `mem0/memory/main.py` lines 605-730. **confirmed**
- On the Platform, the "graph" links memories that share an entity. The documentation states it
  "does not assign typed, labeled relationships between entities"; connections come from
  co-occurrence. `docs/platform/features/graph-memory.mdx`. **confirmed** (documentation)
- A SQLite file (`~/.mem0/history.db` by default) holds a `history` table and a `messages`
  table. `mem0/memory/storage.py` lines 108-141; `mem0/configs/base.py` lines 42-44. **confirmed**

### Time handling

- A memory has `created_at` and `updated_at` (record time). There is no "valid from" or "valid
  to" for when the statement was true. `mem0/memory/main.py` lines 1035-1037. **confirmed**
- `expiration_date` (a plain `YYYY-MM-DD`) hides a memory from `search()` and `get_all()` after
  that date without deleting it. It is set by the caller, not inferred. It works in both the
  library and the Platform. `docs/platform/features/memory-expiration.mdx`;
  `mem0/memory/main.py` lines 427-460. **confirmed**
- The library cannot answer "what was true on date X". There is no time filter beyond metadata
  filters on stored fields. **confirmed** (source as above)
- Platform only: "Temporal Reasoning" extracts event dates from memories and boosts memories
  whose dates match time expressions in the query ("last week", "as of March 2025"); a
  `reference_date` parameter simulates searching at another time. The page states "It is not
  available in the OSS SDK." It is a ranking boost, not a validity filter.
  `docs/platform/features/temporal-reasoning.mdx`. **confirmed** (documentation)

### Conflict handling

- The current open-source algorithm is add-only. The migration guide: "Single-pass ADD-only (one
  LLM call, no UPDATE/DELETE)" and "`add()` events: Returns `ADD` only".
  `docs/migration/oss-v2-to-v3.mdx` lines 17, 37. **confirmed**
- The same guide states the consequence: "The ADD-only model means memories accumulate over
  time. When information changes, the new fact is stored alongside the old one. Retrieval handles
  ranking". `docs/migration/oss-v2-to-v3.mdx` lines 308-310. **confirmed**
- Earlier versions asked the LLM to choose ADD, UPDATE, DELETE or NONE for each extracted fact
  against similar existing memories. That behaviour was removed from the library; the
  `custom_update_memory_prompt` option is listed as deprecated.
  `docs/migration/oss-v2-to-v3.mdx` lines 37-39. **confirmed**
- The extraction call does receive the ten most similar existing memories as context, so the
  model can avoid restating them, but it cannot change or retire them.
  `mem0/memory/main.py` lines 925-956. **confirmed**
- Platform only: "Dream" has a "Supersede" action that "marks an older fact as outdated when a
  newer one contradicts it", described as always on for all plans.
  `docs/platform/features/dream.mdx`. How superseded memories are stored or queried is not
  documented on that page. **confirmed** (documentation)
- Platform only: a feedback call (`POSITIVE`, `NEGATIVE`, `VERY_NEGATIVE` with a reason) per
  memory. The page says feedback is "used to improve the accuracy of the memories and search
  results" without stating the mechanism. `docs/platform/features/feedback-mechanism.mdx`.
  **confirmed** (documentation)
- Manual `update(memory_id, ...)` and `delete(memory_id)` exist in the library and write
  history rows. `mem0/memory/main.py` lines 1829, 1883, 2052, 2116. **confirmed**

### Maintenance

- Library: exact-duplicate suppression by MD5 hash of the memory text at write time, against the
  ten retrieved neighbours and within the batch. `mem0/memory/main.py` lines 1007-1026.
  Near-duplicates with different wording are stored. **confirmed**
- Library: no scheduled jobs, no decay, no consolidation, no re-verification. **confirmed**
  (no such code in `mem0/memory/`)
- Platform only: Dream "Merge" ("folds a duplicate into a single canonical memory", at add time)
  and "Synthesis" (scheduled background job that writes higher-order "pattern memories" linked
  to their source memories; opt-in, paid plans). `docs/platform/features/dream.mdx`.
  **confirmed** (documentation)
- Platform only: "Memory Decay" multiplies search scores by a factor between 0.3 and 1.5 based
  on how recently and how often a memory was retrieved. It is off by default and never removes
  anything. `docs/platform/features/memory-decay.mdx`. **confirmed** (documentation)

### Retrieval

- Library search combines three signals: semantic similarity (vector search), BM25 keyword
  score (only on vector stores that implement `keyword_search`), and an entity-match boost.
  `mem0/memory/main.py` lines 1642-1690. **confirmed**
- The scores are added and divided by the maximum possible: semantic 1.0, BM25 1.0, entity 0.5.
  A semantic threshold (default 0.1) is applied before combining.
  `mem0/utils/scoring.py` lines 60-101. This is weighted score addition, not rank fusion.
  **confirmed**
- Keyword search is implemented for 15 of the vector stores (including Qdrant, pgvector,
  Elasticsearch, Milvus, Redis, Weaviate) and not for others such as Chroma and FAISS.
  `grep "def keyword_search" mem0/vector_stores/`. **confirmed**
- Query preprocessing (lemmatisation and entity extraction) uses spaCy, an optional extra
  (`mem0ai[nlp]`). `pyproject.toml` lines 27-29. **confirmed**
- An optional reranker step exists and is off by default.
  `docs/migration/oss-v2-to-v3.mdx` line 34. **confirmed**
- There is no graph traversal in the library. **confirmed**

### Sources and audit trail

- The `history` table records, per memory id: old text, new text, event (`ADD`, `UPDATE`,
  `DELETE`), timestamps, `is_deleted`, `actor_id`, `role`. `Memory.history(memory_id)` returns
  it. `mem0/memory/storage.py` lines 108-119. **confirmed**
- Raw messages are saved in the `messages` table keyed by session scope, but a memory record
  has no pointer to the specific message it was extracted from.
  `mem0/memory/storage.py` lines 134-141; `mem0/memory/main.py` lines 1022-1037. **confirmed**
- Platform: Dream pattern memories keep "a link back to the specific memories [they were]
  distilled from". `docs/platform/features/dream.mdx`. **confirmed** (documentation)

### Storage

- 25 vector-store adapters in `mem0/vector_stores/`. The default is Qdrant, which can run
  embedded with a local path. `pyproject.toml` line 17. **confirmed**
- The library runs with zero external services: embedded Qdrant on disk, SQLite history, and a
  local embedder (`fastembed` or `huggingface`). Observed below. **confirmed**
- The self-hosted server uses Docker Compose and Postgres with pgvector
  (`docs/migration/server-pgvector-upgrade.mdx`, `server/docker-compose.yaml`). **confirmed**

### License and activity

| Item | Value | Source |
|---|---|---|
| License | Apache-2.0 | `pyproject.toml`; GitHub page |
| Latest release | Python 2.2.1 and npm 3.3.1, both 2026-09-25 | PyPI, npm |
| Last commit on default branch | 2026-11-06 | clone |
| Stars | 68.9k | GitHub page, 2026-11-13 |
| Open issues / open pull requests | 475 / 466 | GitHub page, 2026-11-13 |

All **confirmed**.

### Install and documentation

- `pip install mem0ai`. With default configuration an OpenAI key is required for both the LLM
  and the embedder. Observed below. **confirmed**
- 18 LLM provider modules (including Anthropic) and 11 embedders (including local `fastembed`,
  `huggingface`, `ollama`). `mem0/llms/`, `mem0/embeddings/`. **confirmed**
- Telemetry (PostHog) is a core dependency. `pyproject.toml` line 21. **confirmed**
- Documentation is large and current, but mixes Platform and library features on the same
  site; a reader has to check each page for availability. Open issues report stale examples:
  "Skill examples and LLM.md call search()/get_all() with top-level user_id, which raises
  ValueError" (<https://github.com/mem0ai/mem0/issues/7202>) and "AGENTS.md files still reference
  removed mem0/graphs package" (<https://github.com/mem0ai/mem0/issues/7704>). **confirmed**

### MCP and coding-agent use

- The documented MCP server is hosted at `https://mcp.mem0.ai/mcp` and requires a Mem0 Platform
  account; "Memories you store this way live in your Mem0 account, not on your computer."
  `docs/platform/mem0-mcp.mdx`. **confirmed**
- The repository ships plugins for coding agents: Claude Code, Codex, Cursor, OpenCode and
  others (`integrations/`). The Claude Code plugin (version 0.3.1) requires a Platform API key,
  captures messages, changed files and test results through hooks, and injects up to five
  memories before the first response of a session. `docs/integrations/claude-code.mdx`.
  **confirmed**
- I found no MCP server in the repository that runs against the local library; the former
  OpenMemory documentation paths redirect elsewhere (`docs/docs.json` lines 1184-1192, 1524).
  **confirmed** (repository contents); the current status of OpenMemory is in "Open questions".

### Observed by running

Environment: Linux, Python 3.13, `uv`. Scripts are in the session scratchpad (`a1/run-mem0/`).
All items **confirmed** by observation on 2026-11-13.

1. `uv pip install mem0ai==2.2.1 anthropic fastembed`: 55 packages, 271 MB, about 9 seconds.
2. `Memory()` with default configuration and no `OPENAI_API_KEY` raised
   `OpenAIError: Missing credentials`.
3. With embedded Qdrant (`path`), the `fastembed` embedder (`BAAI/bge-small-en-v1.5`, 384
   dimensions, downloaded from Hugging Face on first use) and a placeholder LLM key,
   `add(text, user_id='u', infer=False)` stored the text and `search(...)` returned it. Basic
   add and search therefore work with no LLM key and no service. `history()` returned one `ADD`
   row.
4. With the Anthropic provider and the resolved `anthropic` 2.8.0, extraction failed:
   `Messages.create() got an unexpected keyword argument 'temperature'`. With `anthropic<1`
   and model `claude-haiku-5-5` the API returned 400 "`temperature` is deprecated for this
   model" (mem0's `_enable_sampling_parameters` returns true for every Haiku model,
   `mem0/llms/anthropic.py`). With `claude-haiku-4-5` it worked.
5. I added "The payments service uses Postgres 14 as its database." and then "We migrated the
   payments service from Postgres 14 to Postgres 16 this week." Both calls returned a single
   `ADD` event. The store then held both statements.
6. `search("Which Postgres version does the payments service use?")` returned the Postgres 14
   memory first (score 0.469) and the migration memory second (0.42). Neither carried any
   marker that one supersedes the other. spaCy was not installed, so BM25 lemmatisation and
   entity boosts were inactive in this run.

### Strengths

Where Mem0 is ahead of what a new project could offer today:

- Adoption and ecosystem: 68.9k stars, 25 vector stores, 18 LLM provider modules, Python and TypeScript
  SDKs, a CLI, a self-hosted server with dashboard, and ready-made plugins for at least ten
  coding agents and frameworks. **confirmed**
- The simplest working local setup of the four systems studied: one `pip install`, embedded
  storage, and a no-LLM write path (`infer=False`). **confirmed** (run)
- Published benchmark claims for the current algorithm: 91.6 on LoCoMo and 93.4 on LongMemEval,
  with extraction latency "roughly in half". These are the project's own figures.
  `docs/migration/oss-v2-to-v3.mdx` line 24. **confirmed** (as reported claims)
- One LLM call per write, which keeps ingestion cheap and fast. **confirmed**
- The coding-agent plugin already does automatic capture and recall through hooks, which is more
  than an MCP tool alone provides. **confirmed** (documentation)
- On the Platform: supersede, merge, synthesis, decay and temporal ranking exist as managed
  features. **confirmed** (documentation)

### Weaknesses and gaps

- The open-source library does not resolve contradictions. Old and new statements coexist and
  the stale one can rank first (run, step 6). **confirmed**
- No validity time and no point-in-time query in the library. **confirmed**
- Correction, deduplication of near-duplicates, consolidation, decay and temporal ranking are
  Platform-only. The open-source and hosted products have diverged; graph memory was removed from
  the library. **confirmed**
- No typed relationships anywhere: "Flat entity model: no relationship types, no
  entity-to-entity edges, no semantic type hierarchy"
  (<https://github.com/mem0ai/mem0/issues/5440>). **confirmed** (issue open; matches source)
- Keyword search and entity extraction are English-only: "BM25 keyword search and entity
  extraction are hardcoded to English" (<https://github.com/mem0ai/mem0/issues/4884>).
  **confirmed** (issue open)
- A memory does not point to its source message. **confirmed**
- MCP and the Claude Code plugin require the hosted Platform, so memories leave the machine.
  **confirmed**
- Robustness reports: "`add()` accepts a non-string `created_at` in metadata, after which every
  read and delete for that user fails" (<https://github.com/mem0ai/mem0/issues/7810>);
  self-hosted image publishing lags releases (<https://github.com/mem0ai/mem0/issues/5090>).
  **confirmed** (issues open; not reproduced)
- Provider drift: the Anthropic path failed with both the current SDK and the current Haiku
  model in my run. A similar report exists for OpenAI reasoning models
  (<https://github.com/mem0ai/mem0/issues/7523>). **confirmed**

## What it means for Factloom

- Mem0's library and Factloom now solve different problems. Mem0 open source is a fast
  add-only store of statements with hybrid ranking; Factloom is a temporal fact graph with
  correction. The comparison a user will make is "Mem0 is easier to start with"; Factloom's
  answer must be "Factloom keeps one current answer and its history", shown with an example like
  the Postgres 14 to 16 test above.
- Mem0's move to add-only is evidence that LLM-decided UPDATE and DELETE at write time was
  costly or unreliable enough to remove. Factloom's self-correction should therefore invalidate
  and link, never rewrite or delete, and should keep the decision cheap (few candidates, one
  call).
- Worth copying: a no-LLM write path; exact-hash duplicate suppression before any LLM call; an
  `explain` option that returns score components; the `expiration_date` idea as a caller-set
  `valid_to`.
- Worth avoiding: score addition across signals with fixed weights depends on score scales;
  rank fusion is simpler to reason about. Features that exist only in a hosted product create
  confusion about what the open-source package does.
- For coding agents, hooks-based capture and recall (as in Mem0's plugin) is a stronger
  integration than MCP tools alone. Factloom's phase 1 is MCP only; consider hooks later.
- The local-first, private default (SQLite, nothing leaves the machine) is a real
  differentiator against Mem0's coding-agent path.

## Open questions

- How does the Platform store a superseded memory (hidden, flagged, linked to its replacement),
  and can a caller list superseded memories or query a past state? Not documented on the pages
  read; not tested.
- What the Platform feedback call changes in practice. Unverified.
- The current status of OpenMemory (the earlier local MCP server): the docs paths redirect and
  the directory is not in the repository at the commit read. Unverified.
- Which exact Python release first shipped the add-only algorithm. The guide is titled
  "v2 to v3" while the PyPI version is 2.2.1; version 2.2.1 behaved add-only in my run.
- Benchmark figures were not reproduced.
