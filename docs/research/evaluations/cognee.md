# Evaluation: Cognee

Accessed: 2026-11-13.

## Question

What does Cognee do, how does it handle time, conflict and maintenance, and where is it strong
or weak relative to Factloom's goals?

## Findings

Sources used throughout:

- Source: `topoteretes/cognee` at commit `4053f6c` (2026-11-13), cloned 2026-11-13. Paths below
  are relative to that repository. <https://github.com/topoteretes/cognee>
- Package: `cognee` 1.6.8 on PyPI, uploaded 2026-11-12. <https://pypi.org/project/cognee/>
- The repository's `CLAUDE.md` (1,067 lines) is a maintained architecture reference and is cited
  where it describes behaviour; model definitions are cited from the Python source.

Labels: **confirmed** = read in a primary source or observed by running; **likely** = secondary
support; unverified items are only in "Open questions".

### Data model

- Three stores work together: a relational database (documents, datasets, users, pipeline runs,
  provenance tables), a vector store (embeddings), and a graph store (nodes and edges).
  `CLAUDE.md` lines 384-389. **confirmed**
- Every graph node is a `DataPoint` (a Pydantic model). Base fields: `id`, `created_at`,
  `updated_at`, `version`, `type`, `belongs_to_set`, `source_pipeline`, `source_task`,
  `source_node_set`, `source_user`, `source_content_hash`, `feedback_weight` (default 0.5),
  `importance_weight`, ontology fields. `cognee/infrastructure/engine/models/DataPoint.py` lines
  64-89. **confirmed**
- Built-in node types include `Entity` (`name`, `description`, `is_a` → `EntityType`,
  `relations`), `Timestamp`, `FactConflict`, `Skill`, `Triplet`, and document, chunk and summary
  types. `cognee/modules/engine/models/`. **confirmed**
- A relationship is an edge between two nodes with a relationship name and optional properties.
  Users can define custom node models with typed edges.
  `cognee/infrastructure/engine/models/Edge.py`; `CLAUDE.md` lines 927-940. **confirmed**
- Data is grouped into datasets, with users, tenants and per-dataset permissions.
  `CLAUDE.md` lines 202-225, 916-925. **confirmed**
- The public API is `remember`, `recall`, `improve`, `forget` (older names `add`, `cognify`,
  `search`, `delete` still work underneath). `CLAUDE.md` lines 137-165. **confirmed**

### Time handling

- Nodes carry `created_at` and `updated_at` (record time, integer milliseconds). Edges and
  facts have no "valid from" or "valid to" fields. A search of the source for `valid_from`,
  `valid_to`, `valid_at`, `invalid_at` finds them only in import and export code for other
  systems (for example `cognee/modules/migration/sources/zep.py`) and in the provenance ledger.
  **confirmed**
- Time in the world is modelled as nodes. A `Timestamp` node holds a normalized string, a
  `precision` (`year`, `month`, `day`, `second`, `span`), `time_at` and `time_until`
  (milliseconds). Facts attach to it through edges named `{verb}_at` (`born_at`, `founded_at`).
  `cognee/modules/engine/models/Timestamp.py`; `CLAUDE.md` line 286. **confirmed**
- The `TEMPORAL` search type has the LLM extract a time window from the question, looks up
  `Timestamp` nodes that overlap it, and moves chunks attached to them to the front of the
  hybrid results. `CLAUDE.md` line 331. **confirmed**
- This supports "what happened in 1969". It is event-time ranking over source passages. It does
  not maintain a validity interval per fact, so "what was the value of X on date D" is answered
  only as well as the retrieved passages and the answering LLM allow. **confirmed** (follows
  from the model above)
- Documents can carry an effective date in metadata (`IMPROVE_EFFECTIVE_DATE_KEY`, default
  `effective_date`), which conflict review uses to order values. `CLAUDE.md` line 268.
  **confirmed**

### Conflict handling

- Conflict review is a stage of `improve()`, which runs automatically after `remember()` by
  default (`IMPROVE_AUTO_ENABLED`, `IMPROVE_REVIEW_CONFLICTS` both default true). It is not part
  of the extraction step itself. `CLAUDE.md` lines 262, 268-270. **confirmed**
- An entity is reviewed when its claims name at least two values of one kind from at least two
  documents, or when two of its chunk statements from different documents give different
  numbers, dates or codes. The review needs an LLM. `CLAUDE.md` line 270. **confirmed**
- The result is a `FactConflict` node: `about_id`, `attribute`, `kind` (`time_varying` or
  `fixed`), `status` (`resolved` or `unresolved`), `selected_fact_id`, `rejected_fact_ids`,
  `resolution_source` (`review` or `user`), `resolved_by`, `resolved_at`, `resolution_reason`,
  `values`, `sources`. `cognee/modules/engine/models/FactConflict.py`. **confirmed**
- The competing facts are not deleted or rewritten: the stage "stores `FactConflict` nodes and
  per-fact status marks and leaves Entity descriptions as extracted". For time-varying
  attributes, dates can order the values; fixed attributes with different values "remain
  disputed". `CLAUDE.md` line 270. **confirmed**
- A user can list conflicts and resolve one by choosing a fact; rejected facts are kept "as
  historical evidence", and a user decision survives later automatic reviews.
  `cognee/modules/conflicts/methods.py` lines 87-140; REST under `cognee/api/v1/conflicts/`.
  **confirmed**
- At retrieval, the hybrid and temporal retrievers show the stored explanation for each conflict
  that names a returned entity. `CLAUDE.md` line 270. **confirmed**
- Feedback: session feedback adjusts `feedback_weight` on nodes (learning rate
  `IMPROVE_FEEDBACK_ALPHA`, default 0.1), which can influence ranking
  (`feedback_influence`). It changes weights; it does not invalidate facts.
  `CLAUDE.md` lines 262-268. **confirmed**

### Maintenance

- `improve()` runs nine ordered stages: `feedback_weights`, `persist_session_qa`,
  `persist_agent_traces`, `extract_agent_context`, `distill_sessions`,
  `update_user_preferences`, `build_truth_subspace`, `review_conflicts`,
  `global_context_index`. `cognee/modules/improve/registry.py`; `CLAUDE.md` line 262.
  **confirmed**
- It is triggered by writes (after `remember()`, with a debounce for session writes) or called
  explicitly. The debounce has "no timer ... the check runs on each `remember()`".
  `CLAUDE.md` line 268. There is a separate schedule for connector syncs
  (`docs/integration-sync-schedule.md`). **confirmed**
- Entity deduplication is by deterministic id: `Entity` declares `identity_fields: ["name"]`, so
  the id is a UUIDv5 of the class and name and the same name always maps to the same node.
  `cognee/modules/engine/models/Entity.py`;
  `cognee/infrastructure/engine/models/DataPoint.py` lines 41-44. Entities whose names differ
  ("Postgres" and "PostgreSQL") are different nodes unless an ontology maps them. **confirmed**
- There is no decay or expiry. The project's stated principle is "No invented limits: never add
  a cutoff ... or an expiry (TTL, cooldown, eviction) the task did not ask for". `CLAUDE.md`
  line 20. **confirmed**
- `forget()` removes a data item, a dataset, or everything, and uses source references on nodes
  and edges to remove only what that document contributed. `cognee/api/v1/forget/forget.py`;
  `CLAUDE.md` line 989. **confirmed**
- Incremental update of changed documents at chunk level exists (`update`). `CLAUDE.md` lines
  301-309. **confirmed**
- I found no stage that re-verifies stored facts against their sources on a schedule, and no
  link-repair stage. **confirmed** (stage list above)

### Retrieval

- More than twenty search types. The default, `HYBRID_COMPLETION`, retrieves document passages
  plus entity neighbourhoods and then calls the LLM to write an answer. Others include graph
  traversal with completion, chunk vector search (`CHUNKS`), lexical chunk search
  (`CHUNKS_LEXICAL`), summaries, `TEMPORAL`, raw Cypher (off by default), code-graph queries,
  and an agentic loop. `CLAUDE.md` lines 318-340. **confirmed**
- `recall()` chooses a search type with a rule table and no LLM call when the caller does not
  name one. `CLAUDE.md` line 169. **confirmed**
- With several datasets, a query is routed to the datasets most likely to hold the answer using
  a per-dataset "global context index". `CLAUDE.md` line 314. **confirmed**
- Most search types return an LLM-written answer, not a ranked list of facts. With no LLM
  configured, the default recall returned the assembled prompt and context instead (run below).
  **confirmed**

### Sources and audit trail

Cognee documents five provenance mechanisms (`CLAUDE.md` lines 983-998). **confirmed**

| Mechanism | What it records | Default |
|---|---|---|
| Source stamping | pipeline, task, user and content hash on each node | on (`lightweight`) |
| Graph source references | which documents own each node and edge; drives `forget()` | always on |
| Audit ledger | hash-chained `provenance_entries` table; deletes become `invalidate` tombstones | off (`PROVENANCE_TRACKING=false`) |
| Access projection | tenant, user, dataset, data and grants | computed on request |
| Edge evidence | which document chunk supports each graph edge (`provenance_edge_evidence` table) | on |

- Search with `include_references=True` returns the supporting chunks as structured
  `EvidenceReference` objects. `CLAUDE.md` line 998. **confirmed**
- The audit ledger records one row per ingested data item, not per node or edge; the document
  explains that per-node rows "cost about ten times the source text". `CLAUDE.md` line 996.
  **confirmed**
- Edge evidence covers edges extracted from document chunks only; edges written by `improve()`
  enrichment, session bridging and the code-graph route "record no evidence yet".
  `CLAUDE.md` line 998. **confirmed**

### Storage

- Defaults need no service: SQLite (relational), LanceDB (vector), Ladybug (graph, an embedded
  database; PyPI package `ladybug` 0.22.3, <https://github.com/LadybugDB/ladybug>), all as local
  files. `CLAUDE.md` lines 384-389; `pyproject.toml`. **confirmed**
- Alternatives: Postgres with pgvector; Neo4j, Neptune, remote Ladybug; Turso for all three
  layers; a Postgres graph adapter marked "demo, not production-ready". Other vector stores are
  community adapters in a separate repository. `CLAUDE.md` lines 394-452. **confirmed**

### License and activity

| Item | Value | Source |
|---|---|---|
| License | Apache-2.0 | `pyproject.toml`; GitHub page |
| Latest release | 1.6.8, 2026-11-12 | PyPI |
| Last commit on default branch | 2026-11-13 | clone |
| Stars | 33.3k | GitHub page, 2026-11-13 |
| Open issues / open pull requests | 772 / 349 | GitHub page, 2026-11-13 |

All **confirmed**. Many of the most-reacted open issues are hackathon connector requests
(for example issues 5789, 5790, 5390), so the issue count overstates the number of defect
reports. <https://github.com/topoteretes/cognee/issues> **confirmed**

### Install and documentation

- `pip install cognee`. The minimal documented setup is one OpenAI key (`LLM_API_KEY`). "If you
  configure only LLM or only embeddings, the other defaults to OpenAI." `CLAUDE.md` lines
  376-382. **confirmed**
- A no-key mode exists: extraction with a local GLiNER model and embeddings with local
  `fastembed`. `CLAUDE.md` line 382. **confirmed** (and observed)
- Configuration is by environment variables or a `.env` file, with a large number of options.
  **confirmed**
- Documentation: a docs site, a 331-line README, and detailed in-repository references. The
  surface area is large (about 40 API modules under `cognee/api/v1/`). **confirmed**

### MCP and coding-agent use

- `cognee-mcp/` is an MCP server with tools `remember`, `recall`, `forget`, `improve`,
  `code_search` and `cognify_status`, over stdio, SSE or streamable HTTP. It can run the engine
  in process, call a running Cognee API server, or use Cognee Cloud.
  `cognee-mcp/src/server.py`; `cognee-mcp/README.md`. **confirmed**
- Plugins for Claude Code and Codex are published from a separate repository
  (`topoteretes/cognee-integrations`) and installed through each agent's plugin marketplace;
  the Codex plugin uses hooks. `README.md` lines 191-224. **confirmed** (README; the plugin
  repository was not read)
- A code-graph route indexes source code into the graph for symbol, dependency and
  change-impact queries without an LLM. `CLAUDE.md` lines 972-981. **confirmed**

### Observed by running

Environment: Linux, Python 3.13, `uv`. Scripts are in the session scratchpad (`a1/run-cognee/`).
All items **confirmed** by observation on 2026-11-13.

1. `uv pip install "cognee[anthropic]==1.6.8"`: 171 packages, 1.3 GB, about 9 seconds with a
   warm cache.
2. First attempt failed with `ModuleNotFoundError: No module named 's3fs'`. Cause: my sandbox
   had `AWS_ACCESS_KEY_ID` set, which makes Cognee import `s3fs`
   (`cognee/tasks/ingestion/resolve_data_directories.py` line 68). After unsetting those
   variables it ran. This is an environment interaction, not a default-install failure.
3. No keys at all: `cognee.remember(text, dataset_name='t')` succeeded. On first use it
   downloaded `BAAI/bge-small-en-v1.5` (about 67 MB) and a GLiNER model
   (`fastino/gliner2.5-base-v1`) and installed CPU `torch` 2.15.0 and `gliner2` into the
   environment by itself. The environment grew to 2.3 GB and the Hugging Face cache to 899 MB.
   The first `remember` took 48 seconds, the second 3 seconds.
4. No keys: `recall("Which Postgres version does the payments service use?")` returned the
   prompt and context that would have been sent to an LLM (both passages plus entity lines such
   as "payments service uses postgres 14"), not an answer. `CHUNKS` search returned the two
   passages with scores. GLiNER typed "postgres 14" as both `software` and `location`.
5. With Anthropic (`LLM_PROVIDER=anthropic`, `LLM_MODEL=claude-haiku-4-5`) and `fastembed`
   embeddings: both `remember` calls completed (9 seconds for the second). Cognee logged that
   the model rejected a strict JSON schema ("For 'anyOf', 'discriminator' is not supported") and
   fell back to a non-strict mode automatically.
6. Inputs were "The payments service uses Postgres 14 as its database. (note dated 2026-01-10)"
   and "We migrated the payments service from Postgres 14 to Postgres 16 on 2026-06-01."
   `recall` answered: "The payments service currently uses Postgres 16. It was migrated from
   Postgres 14 to Postgres 16 on 2026-06-01."
7. During the second `remember`, the `review_conflicts` stage logged
   `ValueError: Unknown or repeated reviewed subject` (raised in
   `cognee/tasks/memify/review_conflicts/accept_review.py` line 61) and then the warning
   "Conflict review could not review entities: [...]". The `remember` call still reported
   `improve='completed'`. I did not check whether a `FactConflict` node was stored.
8. `CHUNKS` search still returned the Postgres 14 passage first (score 0.153), with no marker
   that it had been superseded.

### Strengths

Where Cognee is ahead of what a new project could offer today:

- The most complete local, zero-service stack of the four systems studied: embedded relational,
  vector and graph stores, and a mode that runs with no API key at all. **confirmed** (run)
- Provenance depth: per-edge evidence back to the source chunk, source references that make
  precise deletion possible, and an optional hash-chained audit ledger. **confirmed**
- Conflict review that keeps competing facts, distinguishes time-varying from fixed attributes,
  records a resolution with a reason, and accepts a human decision that later automatic reviews
  respect. This is close to Factloom's "human approval for regulated fields" policy.
  **confirmed** (source)
- Breadth: more than twenty retrieval modes, multi-tenant permissions, ontology support, data
  connectors, document loaders, a code graph, session memory, an evaluation framework, a UI, an
  MCP server and coding-agent plugins. **confirmed**
- Release pace: a PyPI release the day before access and commits on the day. **confirmed**
- Automatic fallback when a model rejects a schema, which made the Anthropic path work without
  intervention. **confirmed** (run)

### Weaknesses and gaps

- No validity interval on facts and no bi-temporal model. "What was true on date X" depends on
  dated passages and LLM reasoning at answer time. **confirmed**
- Superseded information is not marked at the fact or passage level in ordinary search results
  (run, step 8); conflict information appears only through the conflict explanation in hybrid
  and temporal modes. **confirmed**
- Conflict review failed on a two-sentence example in my run (step 7) while the call reported
  success. One observation; not investigated further. **confirmed** (observation)
- Entity identity is exact-name based, so differently written names of one thing are separate
  nodes unless an ontology maps them. **confirmed** (source)
- The default retrieval path costs an LLM call per query and returns prose rather than facts
  with dates and sources. **confirmed**
- Install weight: 1.3 GB before models, 2.3 GB after the no-key path installed `torch`.
  **confirmed** (run)
- Complexity: a 1,067-line architecture reference, about 40 API modules, nine improve stages
  and five provenance mechanisms controlled by "three unrelated flags" (`CLAUDE.md` line 984).
  This is a cost for a new user and for anyone debugging behaviour. **confirmed**
- Open defect reports include "Embedding-model guard ... blocks DELETE and forget() operations
  on mismatched datasets" (<https://github.com/topoteretes/cognee/issues/6092>) and
  "GraphCompletionRetriever drops global context index and bypasses
  skip_completion_on_empty_context during batch retrieval"
  (<https://github.com/topoteretes/cognee/issues/6077>). **confirmed** (issues open; not
  reproduced)
- The audit ledger is off by default and records data items, not individual fact changes.
  **confirmed**
- Python only for the engine. **confirmed**

## What it means for Factloom

- Cognee is the closest of the four to Factloom's combined scope (graph, hybrid retrieval,
  conflict handling, provenance, self-improvement, local storage, MCP). Factloom will not match
  its breadth. The specific gap Factloom can own is the one Cognee does not fill: explicit
  bi-temporal facts with "invalidate and link to the replacement", and a retrieval result that
  is a list of current facts with dates and sources rather than generated prose.
- Cognee's `FactConflict` record is a good reference for Factloom's phase 2 design: keep both
  facts, record kind (time-varying or fixed), status, the chosen fact, who decided, when and
  why, and let a human decision override and persist. For time-varying attributes Factloom can
  go one step further and close the old fact's `valid_to`.
- The "fixed versus time-varying" distinction is worth adopting: two birth dates are a dispute;
  two database versions are a change over time. Only the second should trigger automatic
  invalidation.
- Edge evidence (fact to supporting chunk) in a separate table, and source references that
  allow precise "forget this document", match Factloom's "every fact points to its source" rule
  and show it is practical at scale. The note that a per-node audit row costs about ten times
  the source text is a useful warning: Factloom's audit log should record changes (create,
  invalidate, merge), not a row per read or per unchanged fact.
- Cognee shows the cost of breadth. Factloom should keep the MCP surface small and resist adding
  retrieval modes; one hybrid search with a time parameter covers the stated goal.
- A no-key mode is attractive but expensive in install size. For Factloom, a no-LLM write path
  for already-structured facts is a cheaper way to allow use without a key.

## Open questions

- Does the conflict review failure in step 7 occur generally for short inputs, or only with the
  model and inputs I used? Whether a `FactConflict` node was written was not checked.
- How well does `TEMPORAL` search answer "value of X on date D" questions on a larger corpus?
  Not tested.
- What the Claude Code and Codex plugins capture and inject (the `cognee-integrations`
  repository was not read).
- Cognee Cloud features and pricing: not examined.
- Quality of GLiNER-based extraction compared with LLM extraction beyond the one mistyped
  entity observed: not measured.
