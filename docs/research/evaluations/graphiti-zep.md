# Evaluation: Graphiti and Zep

Accessed: 2026-11-13.

## Question

What does Graphiti (and the Zep product built on it) do, how does it handle time, conflict and
maintenance, and where is it strong or weak relative to Factloom's goals?

## Findings

Sources used throughout:

- Source: `getzep/graphiti` at commit `ebef986` (2026-11-11), cloned 2026-11-13. Paths below are
  relative to that repository. <https://github.com/getzep/graphiti>
- Package: `graphiti-core` 0.31.2 on PyPI, uploaded 2026-10-20. <https://pypi.org/project/graphiti-core/>
- Paper: Rasmussen et al., "Zep: A Temporal Knowledge Graph Architecture for Agent Memory",
  arXiv:2501.13956, submitted 2025-01-20. <https://arxiv.org/abs/2501.13956>
- Zep documentation: <https://help.getzep.com/facts>

Labels: **confirmed** = read in a primary source or observed by running; **likely** = secondary
support; unverified items are only in "Open questions".

Graphiti is the open-source library. Zep is the commercial service built around it. Where a
finding applies only to one of them, it says so.

### Data model

- Graphiti stores a property graph with these node types: `EpisodicNode` (a raw input: text,
  message or JSON, with `content`, `source`, `source_description`, `valid_at`), `EntityNode`
  (`name`, `summary`, `attributes`, `name_embedding`, `labels`), `CommunityNode` (cluster
  summary) and `SagaNode`. `graphiti_core/nodes.py` lines 93-98, 318-330, 499-503, 727-729, 907.
  **confirmed**
- A fact is an `EntityEdge` between two entity nodes. Fields: `name` (relation name), `fact`
  (a natural-language sentence), `fact_embedding`, `episodes` (list of episode ids),
  `created_at`, `expired_at`, `valid_at`, `invalid_at`, `reference_time`, `attributes`.
  `graphiti_core/edges.py` lines 49-54, 263-290. **confirmed**
- Other edge types link structure rather than facts: `EpisodicEdge` (episode mentions entity),
  `CommunityEdge`, `HasEpisodeEdge`, `NextEpisodeEdge`. `graphiti_core/edges.py`. **confirmed**
- Every node and edge has a `group_id` that partitions the graph (one graph per user, project or
  tenant). `graphiti_core/nodes.py` line 96, `graphiti_core/edges.py` line 51. **confirmed**
- Callers can supply their own entity and edge types as Pydantic models; typed attributes are then
  extracted by the LLM. `graphiti_core/utils/maintenance/edge_operations.py` lines 905-935.
  **confirmed**
- There is no confidence score on a fact. `graphiti_core/edges.py` lines 263-290. **confirmed**

### Time handling

- The fact edge is bi-temporal. Field descriptions from the source: `valid_at` is "datetime of
  when the fact became true", `invalid_at` is "datetime of when the fact stopped being true",
  `created_at` is the record time, and `expired_at` is "datetime of when the node was invalidated".
  `graphiti_core/edges.py` lines 271-284. The Zep documentation gives the same four fields and adds
  that they "do not establish that the source content or the derived fact is true".
  <https://help.getzep.com/facts> **confirmed**
- `valid_at` and `invalid_at` are inferred by the LLM from the episode text and the episode's
  `reference_time`. `graphiti_core/utils/maintenance/edge_operations.py` lines 786-830
  (`_extract_edge_timestamps`). **confirmed**
- Search accepts `SearchFilters` with lists of date comparisons on `valid_at`, `invalid_at`,
  `created_at` and `expired_at` (operators `=`, `<>`, `<`, `>`, `<=`, `>=`, `IS NULL`,
  `IS NOT NULL`). A point-in-time query is therefore possible, but the caller must build it;
  there is no single "as of date X" parameter. `graphiti_core/search/search_filters.py` lines
  27-73. **confirmed**
- The default `search()` does not filter out expired or invalidated facts. They are returned with
  their date fields, and the caller decides what to do with them. Observed by running (see
  "Observed by running"). **confirmed**
- The Zep documentation says applications "can use these fields for history and point-in-time
  retrieval" but the page shows no dedicated time parameter on the search call.
  <https://help.getzep.com/facts> **confirmed**

### Conflict handling

- On every `add_episode`, each newly extracted fact is compared by an LLM prompt
  (`dedupe_edges.resolve_edge`) against two candidate lists: existing facts between the same pair
  of entities (duplicate candidates) and other related facts (invalidation candidates). The model
  returns which are duplicates and which are contradicted.
  `graphiti_core/utils/maintenance/edge_operations.py` lines 940-985. **confirmed**
- A contradicted fact is not deleted. Its `invalid_at` is set to the new fact's `valid_at` and
  its `expired_at` is set to the current time. If the existing fact is the later one, the new
  fact is the one marked expired. `edge_operations.py` lines 715-783
  (`_apply_temporal_invalidation`, `resolve_edge_contradictions`). **confirmed**
- There is no link from an invalidated fact to the fact that replaced it. The edge model has no
  such field. `graphiti_core/edges.py` lines 263-290. **confirmed**
- A fact that repeats an existing one verbatim is not stored twice; the new episode id is
  appended to the existing fact's `episodes` list. `edge_operations.py` lines 905-908, 944-953.
  **confirmed**
- There is no feedback channel ("this fact is wrong") in the library or its MCP server. The only
  corrective tools are hard deletes: `delete_entity_edge` and `delete_episode`.
  `mcp_server/src/graphiti_mcp_server.py` lines 696, 729. **confirmed**
- An optional `JevClient` routes the duplicate and contradiction decisions to a separate
  probability model with thresholds (duplicate 0.7, contradiction 0.8). `README.md` lines 733-740.
  **confirmed**

### Maintenance

- Entity deduplication happens at write time, in three steps: exact name match, fuzzy match
  (MinHash and locality-sensitive hashing over name shingles, with an entropy check), then an LLM
  decision for what remains. `graphiti_core/utils/maintenance/dedup_helpers.py` lines 40-145, 321;
  `graphiti_core/utils/maintenance/node_operations.py` lines 456-660, 816. **confirmed**
- Communities (clusters of entities with an LLM summary) are built on request with
  `build_communities`, using label propagation.
  `graphiti_core/utils/maintenance/community_operations.py` lines 96, 256. **confirmed**
- Nothing is scheduled. The library has no background job, decay, re-verification of facts
  against their sources, or archive step. A search of `graphiti_core` for "decay", "schedule" and
  "cron" finds only unrelated matches in driver and prompt files. **confirmed**
- `remove_episode` deletes an episode and the facts and nodes that only it supports.
  `graphiti_core/graphiti.py` line 2174. **confirmed**

### Retrieval

- Three search methods for facts and entities: cosine similarity on embeddings, BM25 full-text,
  and breadth-first graph traversal from given nodes. `graphiti_core/search/search_config.py`
  lines 32-41. **confirmed**
- Result lists are merged by a configurable reranker: reciprocal rank fusion (default), maximal
  marginal relevance, node distance from a centre node, episode-mention count, or a cross-encoder.
  `search_config.py` lines 53-66. **confirmed**
- The simple `search()` call uses hybrid (vector plus BM25) with reciprocal rank fusion and
  returns fact edges. `graphiti_core/graphiti.py` lines 1913-1972. **confirmed**
- Retrieval does not call an LLM unless a cross-encoder reranker that uses one is selected.
  **confirmed** (source as above)

### Sources and audit trail

- Each fact lists the episodes it was extracted from (`episodes`), and episodes keep the raw input
  by default (`store_raw_episode_content=True`). `graphiti_core/edges.py` line 267;
  `graphiti_core/graphiti.py` line 218. **confirmed**
- There is no audit log or change history. An invalidated fact keeps its final field values, but
  the sequence of changes and who or what made them is not recorded. No such model exists in
  `graphiti_core/`. **confirmed**
- The README lists "debug logs, API logs" as features of the Zep service, not of Graphiti.
  `README.md` lines 99-110. **confirmed**

### Storage

- Supported graph backends: Neo4j 5.26, FalkorDB 1.1.2, Amazon Neptune with OpenSearch, and Kuzu
  0.11.2. `README.md` lines 162-167. **confirmed**
- Kuzu is the only embedded backend in the main list and is marked deprecated because "the
  upstream Kuzu project is no longer maintained". `README.md` lines 212-217; `pyproject.toml`
  line 32. **confirmed**
- An optional `falkordblite` extra provides an embedded FalkorDB (Python 3.12 or later).
  `pyproject.toml` line 35; `README.md` lines 416-419. **confirmed**
- Zep the service uses its own graph database, described in the README as "Konig", and needs no
  third-party graph database. `README.md` line 105. **confirmed**

### License and activity

| Item | Value | Source |
|---|---|---|
| License | Apache-2.0 | `pyproject.toml`; GitHub page |
| Latest release | 0.31.2, 2026-10-20 | PyPI |
| Last commit on default branch | 2026-11-11 | clone |
| Stars | 32.8k | GitHub page, 2026-11-13 |
| Open issues / open pull requests | 263 / 294 | GitHub page, 2026-11-13 |

All **confirmed**. Contributions require signing a contributor licence agreement
(`Zep-CLA.md`). **confirmed**

### Install and documentation

- `pip install graphiti-core` plus a graph database and, by default, an OpenAI API key. "Graphiti
  defaults to OpenAI for LLM inference and embedding". `README.md` lines 162-167, 276. **confirmed**
- Other LLM clients ship in the package: Anthropic, Gemini, Groq, Azure OpenAI, generic
  OpenAI-compatible. Embedders: OpenAI, Azure OpenAI, Gemini, Voyage. There is no local embedder
  in `graphiti_core/embedder/`. **confirmed** (directory listing)
- Telemetry (PostHog) is a core dependency. `pyproject.toml` line 20. **confirmed**
- Documentation is extensive: a long README, a docs site, examples, and a specification folder.
  **confirmed**

### MCP and coding-agent use

- The repository includes an MCP server (`mcp_server/`). Tools: `add_memory`, `search_nodes`,
  `search_memory_facts`, `delete_entity_edge`, `delete_episode`, `get_entity_edge`,
  `get_episodes`, `summarize_saga`, `build_communities`, `add_triplet`, `get_episode_entities`,
  `clear_graph`, `get_status`. `mcp_server/src/graphiti_mcp_server.py`. **confirmed**
- Its README calls it "experimental" and a "reference implementation" with "no authentication,
  no authorization, and no prompt-injection protection". `mcp_server/README.md` lines 10-16.
  **confirmed**
- It defaults to FalkorDB and HTTP transport, supports stdio for desktop clients, and processes
  episodes through an asynchronous queue. `mcp_server/README.md` lines 20-33. **confirmed**

### Observed by running

Environment: Linux, Python 3.13, `uv`. Commands and scripts were run from a throwaway directory
outside the repository and are not kept. All items **confirmed** by observation on
2026-11-13.

1. `uv pip install "graphiti-core[kuzu,anthropic,falkordblite]==0.31.2"`: 42 packages, 239 MB.
2. `import graphiti_core` failed with `ModuleNotFoundError: No module named 'httpx'`. The resolved
   `openai` 3.50.0 depends on `httpx2`, and `graphiti_core/llm_client/client.py` imports `httpx`
   directly without declaring it. Installing `httpx` fixed it.
3. With no LLM client passed and no `OPENAI_API_KEY`, `Graphiti(...)` raised
   `OpenAIError: Missing credentials`. There is no mode that works without an LLM key.
4. With the Kuzu driver, `add_episode(..., group_id='t')` raised
   `AttributeError: 'KuzuDriver' object has no attribute '_database'` (the code path is
   `graphiti.py` line 1327). I did not investigate further because the driver is deprecated.
5. With the Anthropic client and the resolved `anthropic` 2.8.0, every LLM call failed with
   `AsyncMessages.create() got an unexpected keyword argument 'temperature'`. After pinning
   `anthropic<1` (0.125.0) the calls succeeded with model `claude-haiku-5-5`.
6. With embedded FalkorDB Lite, a custom hash-based embedder (to avoid an embedding key) and a
   no-op reranker, I added two episodes: "The payments service uses Postgres 14 as its database"
   (reference time 2026-01-10) and "We migrated the payments service from Postgres 14 to Postgres
   16 this week" (reference time 2026-06-01). Each `add_episode` took 2 to 4 seconds.
7. Result: the Postgres 14 fact got `invalid_at = 2026-06-01` and `expired_at = now`. New facts
   about Postgres 16 were created with `valid_at = 2026-06-01`. The second episode produced three
   overlapping facts about the migration, one of which was immediately marked expired.
8. `search("Which Postgres version does the payments service use?")` returned four facts,
   expired ones included, with the expired Postgres 14 fact ranked first (my hash embedder is a
   weak stand-in, so the ranking order is not evidence about Graphiti's default quality).
9. Filters `expired_at IS NULL` and `invalid_at IS NULL` each returned only the two current
   facts. A filter `valid_at <= 2026-03-01` returned all four facts, including two with
   `valid_at = 2026-06-01`. I did not find the cause (see "Open questions").
10. After the process exited, the FalkorDB Lite database file was not on disk and a second
    process saw an empty graph. Python printed
    `RuntimeWarning: coroutine 'AsyncManagementCommands.shutdown' was never awaited`.

### Strengths

Where Graphiti and Zep are ahead of what a new project could offer today:

- A working bi-temporal fact model with LLM-driven invalidation at write time, in production use
  and described in a paper. This is the same core idea as Factloom's product 1 and the
  write-time half of product 2. **confirmed** (source and run above)
- Published benchmark results: the paper reports 94.8% on Deep Memory Retrieval and up to 18.5%
  accuracy improvement on LongMemEval with 90% lower latency than its baselines. These are the
  authors' own figures. <https://arxiv.org/abs/2501.13956> **confirmed** (as reported claims)
- Mature entity resolution (exact, fuzzy, then LLM) and five reranking strategies. **confirmed**
- Custom typed entities and edges, graph partitioning by `group_id`, bulk ingestion, tracing via
  OpenTelemetry (`OTEL_TRACING.md`). **confirmed**
- Four graph backends, including managed cloud options, and a hosted service with SDKs in
  Python, TypeScript and Go. `README.md` lines 99-110. **confirmed**
- Adoption: 32.8k stars, and five releases between 1 September and 20 October 2026
  (<https://github.com/getzep/graphiti/releases>). **confirmed**

### Weaknesses and gaps

- No zero-service local mode that is supported long term. The embedded Kuzu driver is deprecated
  and failed in my run; issue "Kuzu is archived"
  (<https://github.com/getzep/graphiti/issues/1132>). An embedded FalkorDB request is open
  (<https://github.com/getzep/graphiti/issues/1240>), and FalkorDB Lite did not persist in my
  run. **confirmed** (README and run; the issues are as read on 2026-11-13)
- An LLM is mandatory for every write (**confirmed**, source and run). A user has asked for an
  "Option to have add_episode without LLM extraction"
  (<https://github.com/getzep/graphiti/issues/1299>; reported, open when read on 2026-11-13).
- Ingestion cost and latency at scale are reported by users: "resolve_extracted_nodes sends all
  graph nodes to LLM — O(n) context growth causes max_tokens failures at scale"
  (<https://github.com/getzep/graphiti/issues/1275>) and "add_episode_bulk ingestion latency: 100
  records taking ~1 hour in v0.28.1" (<https://github.com/getzep/graphiti/issues/1262>).
  Reported (issues open when read on 2026-11-13; not reproduced)
- Open issues report problems with non-OpenAI providers: Ollama
  (<https://github.com/getzep/graphiti/issues/868>), `api_base` ignored
  (<https://github.com/getzep/graphiti/issues/1116>), Azure
  (<https://github.com/getzep/graphiti/issues/1496>). Reported (open when read on 2026-11-13; not
  reproduced). Separately, my run hit two dependency-compatibility failures (items 2 and 5
  above). **confirmed** (run)
- No audit log, no fact confidence, no "superseded by" link, no feedback-driven correction, no
  scheduled maintenance, no re-verification against sources. **confirmed** (source)
- Default search returns expired facts mixed with current ones; "what is true now" is the
  caller's job. **confirmed** (run)
- The MCP server's own README describes it as experimental and a reference implementation
  (**confirmed**, quoted above). An open issue reports a reliability problem: "queue worker
  silently garbage-collected under streamable-http — add_memory queues but never processes"
  (<https://github.com/getzep/graphiti/issues/1574>; reported, open when read on 2026-11-13; not
  reproduced).
- `update_communities` is reported broken since 2025
  (<https://github.com/getzep/graphiti/issues/836>). Reported (issue open when read on
  2026-11-13; not reproduced)
- Python only. There is no TypeScript library; TypeScript users must call the Zep service or run
  the Python server. **confirmed**

## What it means for Factloom

- Graphiti uses the same bi-temporal fact design Factloom plans. Its four fields map onto
  Factloom's: `valid_at` = `valid_from`, `invalid_at` = `valid_to`, `created_at` = `created_at`,
  and `expired_at` is approximately `invalidated_at` (Graphiti also sets `expired_at` on facts
  that merely ended; see `../technical/bi-temporal-modelling.md`, finding 12). Factloom keeps its
  own names.
- Assessment (an opinion, not a finding): Graphiti's entity resolution and extraction have had
  more development than a new project's will have early on, so Factloom is unlikely to do better
  on those soon. The gaps Factloom can fill are the ones Graphiti leaves open: a local, zero-service store
  (SQLite), an audit log, a link from an invalidated fact to its replacement, a single
  "as of date" query parameter, a default search that returns only current facts, feedback-driven
  correction, and scheduled healing.
- The write path should make the invalidation rule explicit and testable without an LLM. In
  Graphiti the date comparison is plain code (`resolve_edge_contradictions`) and only the
  "does this contradict" judgement is an LLM call. That split is worth copying.
- Plan for ingestion cost from the start: bound the number of candidate facts and entities sent
  to the LLM per write (Graphiti issue 1275 shows what happens otherwise).
- Declare and pin LLM SDK dependencies tightly and test against the current Anthropic SDK; both
  failures in my run were dependency drift.
- A cheap write path that stores a fact without extraction (Graphiti's `add_triplet`, and the
  user request in issue 1299) is useful for coding agents that already know the fact they want
  to store.

## Open questions

- Why did the `valid_at <= date` filter not exclude later facts on FalkorDB Lite in my run? It
  may be how datetimes are stored or compared in that backend, or an error in my filter. Not
  verified on Neo4j.
- How does the Zep service expose point-in-time search, fact ratings, and change history?
  I read only one documentation page and did not use the service (it requires an account).
- Zep pricing, limits, and whether a self-hosted Zep edition is still offered: unverified.
- Whether the Kuzu failure in step 4 also occurs without a `group_id`: not tested.
