# Mnemograph

Accessed: 2026-11-13.

## Question

What does Mnemograph do, how does it handle time, conflict and maintenance, and where is it strong
or weak relative to Factloom's goals?

### Which project was studied

Several unrelated projects use this name. The one studied is **tm42/mnemograph**
(https://github.com/tm42/mnemograph), because it is the only one published to a package registry
under the name (PyPI `mnemograph` 0.5.1, whose metadata points to that repository), it has an MCP
registry manifest (`server.json`, name `io.github.tm42/mnemograph`), and it targets coding agents.
The npm registry has no `mnemograph` package. **confirmed** (PyPI JSON API, `npm view`, GitHub
search API, 2026-11-13)

Other projects with the name, not studied (GitHub search API, 2026-11-13; three more with 0 stars
are omitted):

| Repository | Description on GitHub | Stars | Last update |
|---|---|---|---|
| vakharwalad23/MnemoGraph | Human-like memory combining vectors with graph relationship inference | 3 | 2026-02-10 |
| gdeyoung/mnemograph | In-process knowledge graph for AI agents, no external databases | 1 | 2026-09-19 |
| qinjianxyz/mnemograph | Provenance-first memory engine: SPO extraction, typed conflict resolution, confidence scoring | 1 | 2026-04-20 |

Sources below: the repository at commit `4136ad7` (2026-02-14), cited by file path; PyPI; a local
run of 0.5.1. **confirmed** = read in source or registry, or observed by running.

## Findings

### Data model

- Pydantic models in `src/mnemograph/models.py`. **confirmed**
  - `Entity {id (ULID), name, type, observations[], created_at, updated_at, created_by}`. `type` is
    one of `concept, decision, project, pattern, question, learning, entity`.
  - `Observation {id, text, ts, source}`, where `source` is a session id or `"user"`.
  - `Relation {id, from_entity, to_entity, type, created_at, created_by, explicit_weight,
    co_access_density, last_co_access, access_count, last_accessed}`. Endpoints are entity ids.
  - `MemoryEvent {id, ts, op, session_id, source ("cc" | "user"), data}`; `op` is one of 11
    operations including `create_entity`, `add_observation`, `delete_observation`, `update_weight`,
    `clear_graph`, `compact`, `restore_to`.
  - `Branch`: a named filter (sets of entity and relation ids) over the shared event log.
- The system is event-sourced: the `events` table is the source of truth and the current graph is
  materialized by replaying it (`events.py`, `state.py`). **confirmed**
- Same shape as the MCP reference memory server, plus ids, timestamps and an event log. **confirmed**

### Time handling

- One time axis only: when the system recorded something. Events have `ts`; observations have `ts`;
  entities have `created_at` and `updated_at`. There is no field for when a fact was true in the
  world, and no validity interval. **confirmed** (`models.py`)
- It can answer "what did the graph contain at time T": `materialize_at` replays events with
  `ts <= T` (`state.py` lines 407-422), exposed as `get_state_at`, `diff_timerange` and
  `get_entity_history`. Timestamps accept ISO strings and phrases such as "2 days ago"
  (`timeutil.py`). **confirmed**
- It cannot answer "what was true on date X" when X differs from the recording date. **confirmed**
- `restore_state_at` appends a `restore_to` event; `rewind` uses git (`time_travel.py`, `engine.py`).
  **confirmed** (source; not run)

### Conflict handling

- No detection of contradicting observations. `add_observations` appends each string as a new event
  (`engine.py` lines 590-630); it does not even check for an exact duplicate. **confirmed** (source
  and run)
- Nothing marks an observation as superseded or links it to a replacement. `delete_observations`
  is itself an event, so deleted text remains in the history. **confirmed** (source)
- The only write-time check is on entity names: `remember` and `create_entities` refuse to create an
  entity whose name is at least 80% similar to an existing one and return a `duplicate_warning`
  with the suggestion to add observations to the existing entity; `force=true` overrides
  (`engine.py`, `similarity.py`, `constants.py` `DUPLICATE_AUTO_BLOCK_THRESHOLD = 0.8`).
  **confirmed** (source and run)

### Maintenance

- All maintenance is on demand through tools or CLI commands; nothing is scheduled. **confirmed**
- Available operations: `find_similar` (name similarity by substring, token Jaccard, affix bonus,
  optional embeddings), `merge_entities` (moves observations, redirects relations, optionally
  deletes the source), `find_orphans`, `get_graph_health` (orphans, duplicate groups, entities with
  more than 15 observations, weak relations), `suggest_relations`, `get_weak_relations`.
  `mnemograph health --fix` is an interactive cleanup. **confirmed** (`query.py`, `engine.py`,
  README; only `get_graph_health` was run)
- Relation weight = 0.4 recency + 0.3 co-access + 0.3 explicit, with 30-day half-lives
  (`models.py`, `weights.py`). Decay changes traversal priority; it deletes nothing. **confirmed**
- No re-verification of facts against sources, no confidence score on facts. **confirmed**
- A Claude Code plugin adds `SessionStart` and `Stop` hooks; the stop hook reminds the agent to
  save learnings (`mnemograph-claude-code/hooks/`). **confirmed** (source; not run)

### Retrieval

- `recall` has three depths (`retrieval.py`, `constants.py`): **confirmed**
  `shallow` (counts and recent entities, about 500 tokens), `medium` (vector seeds plus weighted
  one-hop neighbors, about 2000), `deep` (weighted multi-hop from focus entities, about 5000).
- Vectors: `sqlite-vec` `vec0` table, one 384-dimension embedding per entity (name, type and all
  observations joined), model `all-MiniLM-L6-v2` via `sentence-transformers` (`vectors.py`).
  **confirmed**
- Keyword search is a case-insensitive substring match with fixed scores (`query.py`
  `search_structure`, `search_graph`). There is no full-text index and no fusion of keyword and
  vector rankings. **confirmed**
- Output defaults to prose; observations prefixed `Gotcha:` or `Warning:` get their own section
  (README). **confirmed**
- Retrieval has no time filter; `get_state_at` returns a state summary, not a ranked answer.
  **confirmed**

### Sources and audit trail

- Audit trail: every change is an immutable event with id, timestamp, operation, session id and
  source; `get_entity_history` returns an entity's full changelog. **confirmed** (source and run)
- Provenance: weak. The `source` of an observation is a session id, which defaults to the string
  `default` (`server.py` line 46). There is no pointer to a document, file, commit or message, and
  no confidence. **confirmed**

### Storage

- A directory (default `.claude/memory`, set by `MEMORY_PATH`) containing `mnemograph.db` (SQLite in
  WAL mode: `events`, `schema_version`, `entity_vectors`, `entity_meta`), `co_access_cache.json`,
  `branches/`, `mnemograph.log`, and optionally `.git` for commit, rewind and branch features.
  **confirmed** (source; files observed)
- No external service at run time; the embedding model is downloaded from huggingface.co on first
  semantic use. **confirmed** (observed in the server log)
- The virtual environment was 1.4 GB with the CPU build of PyTorch. **confirmed** (observed)

### License and activity

| Item | Value | Source |
|---|---|---|
| Latest version | 0.5.1, uploaded 2026-02-14 | PyPI |
| Last commit | 2026-02-14 (`4136ad7`) | `git log` |
| History | 66 commits, all between 2026-01-10 and 2026-02-14 (61 in January) | `git log` |
| Stars / forks | 2 / 0 | GitHub search API |
| Issues / PRs | 0 open; 1 closed issue; 0 PRs | GitHub search API |
| License | MIT | `LICENSE`, GitHub API |
| Python | >= 3.11 | `pyproject.toml` |

All **confirmed**.

### Install and documentation

- Documented install: `pip install mnemograph`, then
  `claude mcp add --scope user mnemograph -e MEMORY_PATH="$HOME/.claude/memory" -- uvx mnemograph`
  (README "Quick Start"). **confirmed** (README)
- Documentation is extensive for the size: README plus four guides (`SETUP_CLAUDE_CODE.md`,
  `UNIVERSAL_MCP_COMPATIBILITY.md` and others). Fifteen test modules. **confirmed**
- Three install problems were observed on 2026-11-13; see "Observed by running".

### MCP and coding-agent use

`tools/list` returned 31 tools (**confirmed** by running; three more are defined but hidden from the
list by `HIDDEN_TOOLS` in `server.py`):

| Group | Tools (required inputs in parentheses) |
|---|---|
| Write | `remember` (name, entity_type; optional observations, relations, force), `create_relations` (relations), `add_observations` (observations), `delete_entities` (entityNames), `delete_relations` (relations), `delete_observations` (deletions) |
| Read | `recall` (depth; optional query, focus, max_tokens, format), `get_primer`, `get_strongest_connections` (entity_name), `get_weak_relations` |
| Time | `get_state_at` (timestamp), `diff_timerange` (start), `get_entity_history` (entity_name), `restore_state_at` (timestamp), `rewind`, `reload` |
| Maintenance | `find_similar` (name), `find_orphans`, `merge_entities` (source, target), `get_graph_health`, `suggest_relations` (entity), `set_relation_importance` (relation_id, importance), `clear_graph` |
| Session | `session_start`, `session_end` |
| Branches | `branch_list`, `branch_current`, `branch_create` (name), `branch_checkout` (name), `branch_add` (entity_names), `branch_diff` (branch_b) |

- The README lists branch tools as `create_branch`, `switch_branch`, `merge_branch`; the server
  returns `branch_create`, `branch_checkout` and no merge tool. **confirmed** (README versus run)
- Codex: `UNIVERSAL_MCP_COMPATIBILITY.md` gives `codex mcp add mnemograph -- uvx mnemograph` and a
  `~/.codex/config.yaml` file, marked "awaiting confirmation". Codex's documentation specifies
  `~/.codex/config.toml` (https://learn.chatgpt.com/docs/extend/mcp?surface=cli). **confirmed**

### Observed by running

Setup: `pip install mnemograph==0.5.1` in a fresh virtual environment (Python 3.13, Linux), server
driven over stdio by a Node script sending JSON-RPC, `MEMORY_PATH` set to a scratch directory.

1. **Fresh install does not start.** pip resolved `mcp>=1.25.0` to `mcp` 2.3.0 and the server
   exited with `AttributeError: 'Server' object has no attribute 'list_tools'` (`server.py` line
   52). `mcp` 2.0.0 was published 2026-07-28. With `pip install "mcp<2"` it started. **confirmed**
2. **The documented launch command starts the CLI, not the server.** The package defines two entry
   points: `mnemograph` (CLI) and `mnemograph-server` (MCP server). Running the installed
   `mnemograph` executable with no arguments printed the CLI usage text and exited. `uvx mnemograph`
   runs that same executable. `uvx` itself was not available here, so this is confirmed for the
   executable and **likely** for the documented `uvx` command.
3. With the pin, and using `mnemograph-server`, the scenario ran:

| Step | Call | Result |
|---|---|---|
| 1 | `remember` `payments-service` (project), observation "uses PostgreSQL 14" | created, ULID ids, `source: "default"` |
| 2 | `add_observations` "deployed on Kubernetes" | added |
| 3 | `add_observations` "uses MySQL 8, not PostgreSQL" | added, no warning |
| 4 | `remember` `Payments Service` | refused: `duplicate_warning`, "98% match" with `payments-service` |
| 5 | `remember` `alice` with relation `owns` to `payments-service` | created, 1 relation |
| 6 | `recall` medium, "which database does payments use" | "**payments-service** (project) uses PostgreSQL 14. deployed on Kubernetes. uses MySQL 8, not PostgreSQL." |
| 7 | `get_entity_history` `payments-service` | three events with timestamps and session id |
| 8 | `get_graph_health` | "Graph looks healthy"; the contradiction is not flagged |
| 9 | `get_state_at` "1 hour ago" | empty graph (correct) |

Stored after the run: five rows in `events` (two `create_entity`, two `add_observation`, one
`create_relation`), each `id, ts, op, session_id, source, data` with a JSON payload. Both database
observations are current; neither is marked. Not run: branches, git rewind, `merge_entities`, the
Claude Code plugin, the graph viewer.

### Strengths

Where it is ahead of what a new project can offer today:

- **A working event-sourced graph memory on SQLite plus sqlite-vec**, the same storage family
  Factloom has chosen, with replay to any past recording time, per-entity history, and
  audit-preserving restore. This exists and runs today. **confirmed**
- **Write-time duplicate-entity guard that returns an actionable message to the model** (what
  exists, how similar, what to call instead, how to override). Observed working on a
  hyphen-versus-space variant. **confirmed**
- **Manual hygiene tools** (similar, orphans, merge, health report) over MCP and CLI, and
  **token-budgeted tiered recall with prose output**. **confirmed** (source)
- **Usage-weighted edges, branches, git versioning of memory and a graph viewer.** A new project
  would not have these early. **confirmed** (source)
- No LLM call and no API key on the write path. **confirmed**

### Weaknesses and gaps

- Does not start on a fresh install as of 2026-11-13 without pinning `mcp<2`; no release since
  2026-02-14 addresses it. **confirmed** (run)
- Documented launch command, branch tool names and Codex config file name do not match the shipped
  package or Codex. **confirmed**
- Single time axis; no valid time. **confirmed**
- Contradictions are stored side by side and returned together; the health report does not detect
  them. **confirmed** (run, steps 3, 6, 8)
- Provenance is a session id defaulting to `default`; maintenance is manual. **confirmed**
- No full-text index and no rank fusion; one embedding per entity, so an entity with many
  observations is retrieved as a block. **confirmed** (source)
- 31 listed tools; heavy install (PyTorch) and a model download on first use. **confirmed**
- No commit or release since 2026-02-14 (see the activity table). **confirmed**

## What it means for Factloom

- Mnemograph is the closest existing design to Factloom's storage choice. It shows that an
  append-only event log gives transaction time and an audit trail almost for free, but neither
  valid time nor conflict resolution. Factloom's `valid_from`, `valid_to`, `invalidated_at` and the
  link from an invalidated fact to its replacement are what is new relative to it.
- Worth reusing: the duplicate-warning payload; one `remember` call for entity, facts and
  relations; tiered recall with a token budget; a per-entity history tool.
- Worth avoiding: a large tool list; embedding whole entities; heavy ML dependencies by default
  (`../technical/embeddings.md` leads with a local runtime that measured 745 MB on Linux; see
  `../OPEN-QUESTIONS.md`, D-6); an unpinned MCP SDK major version. Both small Python projects in this evaluation set broke on
  `mcp` 2.0. Factloom should pin the SDK major version and smoke-test start-up in CI.
- Docs drift (tool names, launch command) is cheap to prevent with a test that compares the README
  tool table to `tools/list`.

## Open questions

- Whether `uvx mnemograph` differs from the installed `mnemograph` executable (no `uv` here).
  **unverified**
- Recall quality at scale, `merge_entities`, branches and git rewind were not tested. **unverified**
- qinjianxyz/mnemograph (provenance, typed conflict resolution, confidence scoring) is closer to
  Factloom's goals; it has no registry package and was not examined. **unverified**
