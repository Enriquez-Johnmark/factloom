# MCP reference memory server (`@modelcontextprotocol/server-memory`)

Accessed: 2026-11-13.

## Question

What does the MCP reference "Knowledge Graph Memory Server" do, how does it handle time, conflict
and maintenance, and where is it strong or weak relative to Factloom's goals?

Sources used throughout (all accessed 2026-11-13):

- Source: https://github.com/modelcontextprotocol/servers, directory `src/memory/`, commit `e1dc4b1`
  (2026-11-11). Files cited as `index.ts`, `README.md`, `CHANGELOG.md`, `package.json`.
- Registry: `npm view @modelcontextprotocol/server-memory` (version, dates, engines, dependencies).
- Issues: GitHub search API for `repo:modelcontextprotocol/servers`.
- A local run of version 2.1.1 (see "Observed by running").

Labels: **confirmed** = read in the source or registry, or observed by running; **likely** =
secondary evidence only.

## Findings

### Data model

- The whole model is three TypeScript interfaces: `Entity {name, entityType, observations: string[]}`,
  `Relation {from, to, relationType}`, `KnowledgeGraph {entities, relations}`
  (`index.ts` lines 137-152). **confirmed**
- Identity is the entity `name` string, compared with exact, case-sensitive equality. There are no
  ids. Relations refer to entities by name. **confirmed** (`index.ts` `createEntities`,
  `createRelations`; observed: `payments-service` and `Payments-Service` became two entities).
- An observation is a bare string: no id, timestamp, source, confidence or status. **confirmed**
- Unmodeled fields written by another client are kept on disk but never returned (CHANGELOG 2.0.1).
  **confirmed**

### Time handling

- There are no time fields of any kind: no creation time, no validity interval, no retraction time.
  **confirmed** (`index.ts` schemas; the stored file below).
- It cannot answer "what was true on a past date". It also cannot answer "when was this recorded".
  The only ordering signal is the position of an observation in its array, which is insertion order.
  **confirmed**

### Conflict handling

- None. `add_observations` appends any string that is not an exact duplicate of an existing string
  on that entity (`index.ts` `addObservations`). A contradicting observation is stored next to the
  one it contradicts. **confirmed** (source and run).
- Correction is manual and destructive: the caller must call `delete_observations` with the exact
  old string. The old value is then gone from the file; nothing links old to new. **confirmed**
- `create_entities` skips an entity whose name already exists and drops the observations supplied
  with it; since 1.0.0 it reports the skipped names in a `skipped` array (CHANGELOG 1.0.0, issue
  #4887). **confirmed**

### Maintenance

- No background or scheduled work. No entity merge, decay, re-verification, consolidation or link
  repair. **confirmed** (no such code in `index.ts`).
- Exact-match dedup only (entity name, relation triple, observation string). **confirmed**
- Referential integrity is partly enforced: `create_relations` rejects a relation whose endpoint
  does not exist, and `delete_entities` removes relations that touch the deleted entity.
  **confirmed** (source; observed error `Entity with name ghost not found`).

### Retrieval

- `search_nodes` is a case-insensitive substring test of the whole query string against entity
  name, entity type and each observation (`index.ts`, the block that starts at line 778 with the
  comment "Very basic search function"). No tokenization, ranking, vectors or full-text index. Results come back in stored
  order. **confirmed**
- Consequence observed: the query `postgresql` matched; the natural-language query
  `which database does payments use` returned nothing. **confirmed** (run)
- `open_nodes` fetches by exact name; `read_graph` returns everything. Both `search_nodes` and
  `open_nodes` also return every relation with at least one endpoint in the result. There is no
  multi-hop traversal; the model walks the graph by issuing further calls. **confirmed**
- Version 2.1.0 added optional `observationLimit`, `entityTypes` and `limit` so a large graph need
  not be returned whole (CHANGELOG 2.1.0, PR #5394). **confirmed**

### Sources and audit trail

- None. Nothing records who or what asserted an observation, from which document or session, or
  when. Deletes leave no trace. **confirmed**

### Storage

- One JSONL file, one record per line with a `type` of `entity` or `relation`. Path from
  `MEMORY_FILE_PATH`; the default is `memory.jsonl` inside the package directory, which under `npx`
  is inside `node_modules` and can be deleted by a reinstall or cache clear. The README now tells
  users to set an absolute path and the server warns on stderr (`README.md` "Choosing where the
  graph is stored"; CHANGELOG 2.1.0). **confirmed**
- Every mutation reads and validates the whole file, then rewrites the whole file through a temp
  file and rename, under an in-process queue plus a cross-process lock file (`index.ts`
  `withFileLock`, `saveGraph`). **confirmed**
- Zero external services. Runtime dependencies are `@modelcontextprotocol/server` ^2.3.1 and `zod`
  ^4.2.0 (`package.json`). **confirmed**

### License and activity

| Item | Value | Source |
|---|---|---|
| Latest version | 2.1.1, published 2026-11-11 | npm registry |
| Release cadence | 1.0.0 on 2026-10-11, 2.0.0 on 2026-10-19, 2.0.1, 2.1.0, 2.1.1 since | npm registry `time` |
| Last commit touching `src/memory` | 2026-11-11 | `git log -- src/memory` |
| Repository stars / forks | 91,961 / 11,960 (whole monorepo, not this server alone) | GitHub search API |
| Open issues / PRs (monorepo) | 16 / 2; 4 open issues have "memory" in the title | GitHub search API |
| License | "SEE LICENSE IN LICENSE"; the repository is moving from MIT to Apache-2.0, new contributions are Apache-2.0 | `package.json`, root `LICENSE` |
| Node requirement | `engines.node >= 24` | `package.json`, README "Requirements" |

All **confirmed**. The server is actively maintained: a title search for "memory" in the monorepo
returns 81 issues (a few concern other servers), most of them closed between September and
November 2026.

### Install and documentation

- `npx -y @modelcontextprotocol/server-memory` starts it; no configuration is required.
  **confirmed** (root `README.md`; run via a local install).
- The README (427 lines) documents every tool with inputs, the storage path rules, Docker use,
  sharing one file between clients, and a sample system prompt for chat personalization. It is
  accurate against the code as far as checked. **confirmed**
- The README covers Claude Desktop and VS Code only; no Claude Code or Codex section. **confirmed**

### MCP and coding-agent use

Tool list as returned by `tools/list` from version 2.1.1 (**confirmed** by running):

| Tool | Required input | Optional input | Annotation |
|---|---|---|---|
| `create_entities` | `entities[] {name, entityType, observations[]}` | | additive, idempotent |
| `create_relations` | `relations[] {from, to, relationType}` | | additive, idempotent |
| `add_observations` | `observations[] {entityName, contents[]}` | | additive, idempotent |
| `delete_entities` | `entityNames[]` | | destructive |
| `delete_observations` | `deletions[] {entityName, observations[]}` | | destructive |
| `delete_relations` | `relations[] {from, to, relationType}` | | destructive |
| `read_graph` | | `entityTypes[]`, `observationLimit` | read-only |
| `search_nodes` | `query` (max 2048 chars) | `limit`, `observationLimit` | read-only |
| `open_nodes` | `names[]` | `observationLimit` | read-only |

- One resource, `memory://knowledge-graph`, with change notifications (`index.ts`
  `registerKnowledgeGraphResource`). **confirmed**
- It serves two protocol eras from one process: 2025-era clients (`initialize`) and 2026-07-28
  clients (`server/discover`) (`index.ts` header comment; CHANGELOG 2.0.0). **confirmed**
- Registration in the coding agents uses each agent's generic stdio syntax, not anything specific to
  this server. Claude Code: `claude mcp add [options] <name> -- <command> [args...]`, for example
  `claude mcp add --env MEMORY_FILE_PATH=/abs/memory.jsonl memory -- npx -y
  @modelcontextprotocol/server-memory` (syntax from https://code.claude.com/docs/en/mcp.md).
  Codex: `codex mcp add <name> --env VAR=VALUE -- <command>` or a `[mcp_servers.<name>]` table in
  `~/.codex/config.toml` (syntax from https://learn.chatgpt.com/docs/extend/mcp?surface=cli, the
  redirect target of developers.openai.com/codex/mcp). The syntax is **confirmed** from the docs;
  the two commands were not executed here because neither agent CLI was installed.

### Observed by running

Setup: `npm i @modelcontextprotocol/server-memory@2.1.1` in a scratch directory, driven by a small
Node script that spawns `dist/index.js`, sends `initialize`, `notifications/initialized`,
`tools/list` and a series of `tools/call` requests as newline-delimited JSON-RPC, with
`MEMORY_FILE_PATH` set to a scratch file. Run under Node 24.22.3. The server also started and
answered under Node 22.23.4 despite `engines.node >= 24`; only startup and `tools/list` were
checked there.

| Step | Call | Result |
|---|---|---|
| 1 | `create_entities` `payments-service` (type `service`) with observation "uses PostgreSQL 14" | created |
| 2 | `add_observations` "deployed on Kubernetes" | added |
| 3 | `add_observations` "uses MySQL 8, not PostgreSQL" (contradicts step 1) | added, no warning |
| 4 | `create_entities` again for `payments-service` with a new observation, plus `Payments-Service` and `alice` | first one in `skipped` and its observation dropped; `Payments-Service` created as a separate entity |
| 5 | `create_relations` `alice` owns `payments-service`; then `alice` owns `ghost` | first created; second error "Entity with name ghost not found" |
| 6 | `search_nodes` "postgresql" | returns the entity with all three observations, both database claims side by side |
| 7 | `search_nodes` "which database does payments use" | empty result |
| 8 | `delete_observations` "uses PostgreSQL 14" | `success: true`; the string is gone |

After step 3 the entity read back as
`"observations":["uses PostgreSQL 14","deployed on Kubernetes","uses MySQL 8, not PostgreSQL"]`.
The file on disk after step 8, complete:

```
{"type":"entity","name":"payments-service","entityType":"service","observations":["deployed on Kubernetes","uses MySQL 8, not PostgreSQL"]}
{"type":"entity","name":"Payments-Service","entityType":"service","observations":["case variant"]}
{"type":"entity","name":"alice","entityType":"person","observations":[]}
{"type":"relation","from":"alice","to":"payments-service","relationType":"owns"}
```

No timestamp, source or history of the deleted observation exists anywhere in the file.

### Strengths

Where it is ahead of what a new project can offer today:

- **Distribution and default status.** It ships in the official MCP servers repository (about 92k
  stars) and installs with one `npx` command and no key, model or database. A new project has none
  of that reach. **confirmed**
- **Zero cost per write.** No LLM call, no embedding call. Writes and reads are deterministic and
  free. **confirmed**
- **Transparent storage.** One human-readable JSONL file that can be read, diffed, edited and put
  under version control. **confirmed**
- **Operational hardening of a small surface.** Atomic save, in-process write queue, cross-process
  lock with stale-lock recovery, preservation of unreadable lines and unknown fields, file-mode
  preservation, 16 test files, changeset-based releases. This level of attention to failure modes
  took dozens of issues to reach (CHANGELOG; `__tests__/`). **confirmed**
- **Tool descriptions and annotations tuned for models.** Every input has a description; tools state
  when to prefer a sibling tool; all carry read-only/destructive/idempotent hints (CHANGELOG 2.1.0,
  2.1.1). **confirmed**
- **Protocol currency.** Already on the TypeScript SDK v2 packages and the 2026-07-28 protocol
  revision. **confirmed**

### Weaknesses and gaps

- No time model, no provenance, no confidence, no audit trail (see above). **confirmed**
- Contradictions accumulate silently; resolution is left to the calling model, which must notice
  the conflict in returned text and delete the right string. **confirmed** (run, steps 3 and 6).
- Substring search does not find paraphrases or multi-word questions (run, step 7). **confirmed**
- Entity names are case-sensitive exact keys, so near-duplicates are easy to create (run, step 4)
  and there is no merge tool. **confirmed**
- Whole-file rewrite on every mutation; cost grows linearly with graph size and there are no caps on
  the write side. Issue #5525 measured 411 ms to add one entity at 100,000 entities (24 MB file).
  The issue is closed and described by its reporter as a hardening note, not a bug.
  https://github.com/modelcontextprotocol/servers/issues/5525 **confirmed** (issue text; not
  re-measured here)
- A schema-invalid line is preserved on disk but cannot be removed through any tool (open issue
  #5541). https://github.com/modelcontextprotocol/servers/issues/5541 **confirmed** (issue text)
- The default storage location is inside the package directory (README; issue #5346 discussed moving
  it and the default was left unchanged). **confirmed**

## What it means for Factloom

- This server is the functional floor a coding-agent user already has for one command. Factloom's
  phase 1 has to beat it on exactly the points above: time fields, sources, conflict handling and
  retrieval that answers a question rather than a substring.
- Its tool surface is a useful reference for naming and granularity, but its nine CRUD tools push
  graph bookkeeping onto the model. Factloom can keep the surface smaller (remember, recall,
  correct, history) because the server does the bookkeeping.
- Copy the engineering habits, not the data model: per-property input descriptions, tool
  annotations, a `skipped`-style report instead of silent drops, atomic writes, a test for every
  reported failure mode.
- The run shows a concrete demo script for Factloom. The third write ("uses MySQL 8, not
  PostgreSQL") says the earlier statement was never true, so it is a correction, not a
  succession: it should leave the PostgreSQL fact with `invalidated_at` set (and `valid_to`
  untouched) and linked to the MySQL fact. "Which database now" should then return MySQL only;
  "which database, as known on 2026-11-12" should still return PostgreSQL. A succession variant
  ("migrated to MySQL in June") would instead close `valid_to` and leave `invalidated_at` empty.
  The two cases are defined in `../technical/bi-temporal-modelling.md` (rule 5) and
  `../technical/contradiction-detection.md` (outcome table).
- Version facts that affect Factloom's stack: the reference servers now depend on
  `@modelcontextprotocol/server` 2.x (the split v2 SDK packages) with `zod` 4. This reference
  server package declares `engines.node >= 24`; the SDK packages themselves declare `>= 20`
  (`npm view @modelcontextprotocol/server engines`, 2026-11-13; see `../technical/mcp.md`), so the
  SDK does not raise Factloom's Node floor. The settled decision says "the MCP TypeScript SDK"
  without a version; phase 0 should name the v2 packages. This refines the decision, it does not
  conflict with it. The Node floor itself is an open decision: see `../OPEN-QUESTIONS.md`, D-9.

## Open questions

- How many people use this server in practice is unknown; npm download counts were not retrieved.
  **unverified**
- Issue #5538 mentions new Streamable HTTP endpoints for the memory server. Version 2.1.1 as
  published speaks stdio only; whether an HTTP transport is planned for a release was not checked.
  **unverified**
- The `claude mcp add` and `codex mcp add` commands above follow the documented syntax but were not
  executed. **unverified**
