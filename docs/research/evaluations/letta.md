# Evaluation: Letta (formerly MemGPT)

Accessed: 2026-11-13.

## Question

What does Letta do, how does it handle time, conflict and maintenance, and where is it strong or
weak relative to Factloom's goals?

## Findings

Sources used throughout:

- `letta-ai/letta`, default branch at commit `8816d3a` (2026-10-18), and its `archive` branch at
  commit `56ba9c2` (2026-08-13), cloned 2026-11-13. <https://github.com/letta-ai/letta>
- `letta-ai/letta-code` at commit `bd31b0a` (2026-11-13), cloned 2026-11-13. Paths prefixed
  `letta-code/` are relative to that repository. <https://github.com/letta-ai/letta-code>
- Packages: `@letta-ai/letta-code` 0.34.59 on npm (2026-11-13); `letta` 0.34.12 on PyPI
  (2026-10-12). <https://www.npmjs.com/package/@letta-ai/letta-code>,
  <https://pypi.org/project/letta/>
- Paper: Packer et al., "MemGPT: Towards LLMs as Operating Systems", arXiv:2310.08560 (cited in
  `CITATION.cff`).

Labels: **confirmed** = read in a primary source or observed by running; **likely** = secondary
support; unverified items are only in "Open questions".

### Important context: the project changed shape in 2026

- The default branch of `letta-ai/letta` is now a landing page of about ten files. Its README
  says: "The current source code lives in `letta-ai/letta-code`" and "The `archive` branch
  contains the retired Letta V1 API server." **confirmed**
- The repository's `AGENTS.md` states that the archived code "is unsupported, receives no fixes
  or security updates, and does not represent current Letta", and that the old `letta/letta`
  Docker image and Python server packages are retired. **confirmed**
- Current Letta ("Letta Code") is a complete agent harness: a terminal UI, an app server, chat
  channels, subagents, skills, scheduling. Memory is one part of it. It is a TypeScript project
  run with Node or Bun. `letta-code/README.md`; `letta-code/package.json`. **confirmed**
- The PyPI package `letta` now installs the same Node-based tool ("`uv tool install letta` ...
  Node.js is bundled"). `letta-code/README.md`. **confirmed**

This evaluation describes current Letta first. The retired V1 server is described briefly, and
labelled as historical, because most third-party write-ups about "Letta memory" describe V1.

### Data model

Current (Letta Code):

- Memory is a directory of Markdown files per agent, called MemFS, tracked in a git repository.
  The system prompt describes it as "a git-backed projection of your memory".
  `letta-code/src/agent/prompts/letta_local_memfs.md` lines 19-46. **confirmed**
- "Memory blocks" are files that are compiled into the system prompt (for example `persona.md`,
  `human.md`, `MEMORY.md`). "External memory" is every other file: reference notes and skills
  (procedural memory), reachable through `[[path]]` links from the blocks. Same file, lines
  26-41. **confirmed**
- Files have YAML front matter (`name`, `description`). Observed in the run below. **confirmed**
- "Recall memory" is the full message history, stored automatically and not editable by the
  agent. Same file, line 12. **confirmed**
- Limits on file size, directory depth and read-only files are enforced by a git pre-commit
  validator configured through `.memfs.config.json`.
  `letta-code/src/agent/memory-constraints.ts` lines 1-25. **confirmed**
- There are no entities, facts, edges or embeddings in the memory model. The unit is a text
  file. **confirmed**

Historical (retired V1 server, `archive` branch):

- `Block` rows (label, value, character limit, version) attached to agents; `BlockHistory`
  rows (sequence number, actor) for block versions; "archival" passages with embeddings and
  tags; messages. `letta/orm/block.py` lines 35-56, `letta/orm/block_history.py` lines 25-46,
  `letta/orm/passage.py` lines 27-32. **confirmed**
- Agent tools included `core_memory_append`, `core_memory_replace`, `memory_rethink`,
  `archival_memory_insert`, `archival_memory_search`, `conversation_search`.
  `letta/functions/function_sets/base.py`. **confirmed**

### Time handling

- Memory content has no validity time. A statement in a Markdown file is whatever the agent
  last wrote. **confirmed** (source and run)
- Record time comes from git: each change to memory is a commit with a timestamp and message.
  A past state of memory can be read with ordinary git commands (`git log`, `git show`).
  **confirmed** (run)
- This answers "what did the agent believe on date X" at the granularity of files and commits.
  It does not answer "what was true in the world on date X", and there is no query interface
  for either question beyond git. **confirmed**
- The reflection prompt instructs the subagent to "convert relative dates to absolute ones"
  when writing memory. `letta-code/src/agent/subagents/builtin/reflection-v2.md`. **confirmed**

### Conflict handling

- Conflicts are handled by the agent editing text. The main agent can rewrite its own memory
  files during a conversation. In the run below it replaced the old statement in place and
  described the change in the commit message. **confirmed** (run)
- A background "reflection" subagent reviews recent transcripts and updates memory. Its prompt
  lists "Contradictions — anything that conflicts with what's currently stored in memory" as
  something to look for, and says to "resolve contradictions in favor of the latest evidence".
  `letta-code/src/agent/subagents/builtin/reflection-v2.md`. **confirmed**
- The old value is overwritten in the working files. It survives only in git history; there is
  no "invalidated" state and no structured link between the old and new statement.
  **confirmed** (run)
- Whether a contradiction is noticed at all depends on the model reading the relevant file.
  There is no deterministic check. **confirmed** (design, from the prompts above)
- Separate from factual conflict, `memory-conflict-repair.ts` handles git merge conflicts when
  memory is synced between machines. `letta-code/src/agent/memory-conflict-repair.ts`.
  **confirmed**

### Maintenance

- Reflection ("sleeptime" or "dreaming") can run on a trigger: after a number of steps or on a
  context-compaction event (`--reflection-trigger`, `--reflection-step-count`), or manually with
  `/dream` and `/reflect`. `letta --help` output; `letta-code/README.md`. **confirmed**
- The reflection subagent has skills named `maintaining-core-memory`,
  `maintaining-deferred-memory` and `creating-skills`, and may replay earlier transcripts "for
  deduplication, contradiction resolution, and cross-session pattern extraction".
  `letta-code/src/agent/subagents/builtin/reflection-v2.md`. **confirmed**
- Crons and heartbeats let agents schedule their own work. `letta-code/README.md`. **confirmed**
- All maintenance is LLM-driven free-text editing. There is no entity merge, link repair,
  decay, or re-verification against sources as defined operations. A `/doctor` check flags an
  oversized system prompt. `letta_local_memfs.md` line 33. **confirmed**

### Retrieval

- Memory blocks are always in context; nothing is retrieved for them. Other files are found by
  the agent following links or using file and shell tools. **confirmed** (prompts above)
- Message history search: with the Letta Cloud backend the search mode can be `vector`, `fts`
  or `hybrid`. `letta-code/src/backend/message-search.ts` lines 11, 36-44. **confirmed**
- With the local backend only lexical search is available; the code raises "Local backend does
  not support "vector" message search. Use "fts"".
  `letta-code/src/backend/local/transcript-search.ts` lines 563-566. **confirmed**
- A "recall" subagent can search past conversations on the main agent's behalf.
  `letta-code/src/agent/subagents/builtin/recall.md`. **confirmed**

### Sources and audit trail

- The git history of MemFS is a complete change log: every memory edit is a commit with author
  and message, and reflection commits carry trailers (`Generated-By: Reflection`, `Agent-ID`)
  and list the transcripts reviewed. `reflection-v2.md`, "Commit" section. **confirmed**
- An individual statement does not point to the message it came from. Provenance is at commit
  level. **confirmed**
- Memory can be synced to a user's own GitHub repository (`/memory-repository set ...`).
  `letta-code/README.md`. **confirmed**

### Storage

- Local backend: plain files under `~/.letta/lc-local-backend/` (agent records as JSON,
  conversations, and a `memfs/<agent>/memory` git repository). No database and no external
  service. **confirmed** (run)
- Cloud backend (the default): agent state, memory and conversations are stored by Letta Cloud.
  `letta-code/README.md`, "Letta Cloud is the default". **confirmed**

### License and activity

| Item | Value | Source |
|---|---|---|
| License | Apache-2.0 | `letta-code/package.json`; GitHub pages |
| Latest release | `@letta-ai/letta-code` 0.34.59, 2026-11-13 | npm |
| Last commit, `letta-code` | 2026-11-13 | clone |
| Stars, `letta-code` | 3.8k | GitHub page, 2026-11-13 |
| Open issues / pull requests, `letta-code` | 216 / 135 | GitHub page, 2026-11-13 |
| Stars, `letta-ai/letta` (landing page plus archive) | 25.4k | GitHub page, 2026-11-13 |
| Last version in archived V1 source | 0.16.8 | `archive` branch `pyproject.toml` |

All **confirmed**. The star count of `letta-ai/letta` reflects the retired project; the active
code base has 3.8k.

### Install and documentation

- `npm install -g @letta-ai/letta-code` (Node 22.23.4 or later), or `uv tool install letta`.
  `letta-code/README.md`; `letta-code/package.json` `engines`. **confirmed**
- On first launch the user chooses Letta Cloud (default) or local. For local use an LLM
  provider key is needed (`/connect`, or an environment variable). **confirmed** (README, run)
- Documentation is at docs.letta.com. The repository itself has little prose documentation
  beyond the README; behaviour is defined largely by prompt files in `src/agent/prompts/` and
  `src/agent/subagents/builtin/`. **confirmed**

### MCP and coding-agent use

- Letta Code is an MCP client: `letta mcp ...` lists and calls MCP servers available to an
  agent. `letta --help`; `letta-code/src/mcp-client.ts`. **confirmed**
- I found no MCP server in `letta-code` that exposes Letta memory to other coding agents such as
  Claude Code or Codex. **confirmed** (repository search); see "Open questions".
- Letta Code is itself a coding agent and competes with Claude Code and Codex rather than
  serving them. It can import context from them (prompt files `source_claude.md`,
  `source_codex.md`) and has `claude` and `codex` personality presets. **confirmed**

### Observed by running

Environment: Linux, Node 22.23.4. Files are in the session scratchpad (`a1/run-letta/`), with
`HOME` pointed at a scratch directory. All items **confirmed** by observation on 2026-11-13.
Only current Letta Code was run; the retired V1 server was not.

1. `npm install --prefix . @letta-ai/letta-code@0.34.59`: 333 packages, 401 MB, 18 seconds.
2. `letta --help` works with no account and no key.
3. Headless local run with an Anthropic key in `ANTHROPIC_API_KEY`:
   `letta --backend local --new-agent -m anthropic/claude-haiku-5-5 -p "Remember this fact in
   your memory: the payments service uses Postgres 14. ..."`. It replied and exited with status
   0. No server, database or Letta account was needed.
4. It created `~/.letta/lc-local-backend/memfs/<agent>/memory/` as a git repository with
   `persona.md`, `human.md`, `MEMORY.md`, `projects/MEMORY.md` and
   `projects/payments-service.md`, and two commits: "chore: initialize local memory" and
   "Record that the payments service uses Postgres 14".
5. A second run in a new conversation: "Correction: we migrated the payments service to
   Postgres 16 last week. Update your memory ...". The agent edited three files and committed
   "Correct payments service database to Postgres 16 (migrated last week)". The fact file then
   read: "The payments service uses Postgres 16 (migrated from Postgres 14 in November 2026)."
6. The Postgres 14 statement no longer exists in the working files; `git log` and `git show`
   recover it.
7. Not tested: reflection or dreaming, message search, Cloud backend, and whether memory works
   at all without an LLM key (the design requires a model to write memory).

### Strengths

Where Letta is ahead of what a new project could offer today:

- A complete, actively developed agent product (version 0.34.59 was published, and the last
  commit made, on the day of access) with memory integrated into the agent loop, including background reflection,
  scheduling, subagents, skills and multi-device sync. **confirmed**
- Memory that is human-readable, diffable and versioned with standard tools. A user can open
  the files, read the git log, revert a commit, or push memory to their own repository. No
  custom tooling is needed for inspection or audit. **confirmed** (run)
- Zero-service local mode that worked first time. **confirmed** (run)
- Procedural memory (skills the agent writes for itself) and system-prompt learning, which a
  fact store does not attempt. **confirmed**
- A long research lineage (MemGPT paper, 2023) and name recognition: 25.4k stars on the
  original repository. **confirmed**

### Weaknesses and gaps

- No structured facts, no validity time, no point-in-time query, no confidence, no per-fact
  source. **confirmed**
- Correction overwrites text. History exists only as git diffs, and finding when a particular
  statement changed means searching commit history. **confirmed** (run)
- Correctness of memory depends entirely on model behaviour guided by prompts; there are no
  deterministic checks for contradiction or duplication. **confirmed**
- Memory blocks consume context on every turn, so their size is limited by design ("Keep blocks
  lean"). `letta_local_memfs.md` line 33. **confirmed**
- Local search is lexical only, and an open issue reports "Local conversation search limits by
  recency before relevance" (<https://github.com/letta-ai/letta-code/issues/5493>).
  **confirmed** (issue open)
- Open memory-related issues: "Memory not working and /init gives errors"
  (<https://github.com/letta-ai/letta-code/issues/3042>); "Local backend: preflight compaction
  ignores mid-conversation memory update"
  (<https://github.com/letta-ai/letta-code/issues/4893>); "`letta memory resolve` advertised but
  not implemented" (<https://github.com/letta-ai/letta-code/issues/4040>). **confirmed** (issues
  open; not reproduced)
- It is not usable as a memory layer for another agent. To get Letta's memory a user must adopt
  Letta's harness. **confirmed** (no MCP server found)
- Discontinuity: the V1 server, its Python packages, its Docker image and its REST-based
  memory API were retired in 2026. Integrations and comparisons written against V1 no longer
  describe the product. **confirmed**
- Cloud is the default backend, so by default memory is stored off the machine. **confirmed**

## What it means for Factloom

- Letta is not a direct competitor for "memory layer behind an MCP server". It is a competing
  agent. The overlap is in the user's question "how does my coding agent remember things", where
  Letta's answer is a self-edited, git-tracked notebook and Factloom's is a temporal fact graph.
- The notebook approach has real advantages that Factloom should not dismiss: the user can read
  and edit memory directly, and git gives history for free. Factloom's audit log and
  "invalidate, never delete" rule provide the same guarantees in a queryable form, but only if
  Factloom also makes memory easy to inspect (for example an export of current facts as
  Markdown, and a readable history per fact).
- Letta's observed correction ("uses Postgres 16 (migrated from Postgres 14 in November 2026)")
  shows what a good human-readable outcome looks like. Factloom's retrieval output for a
  superseded fact could present the same sentence, generated from the fact pair and its dates.
- Reflection over transcripts on a trigger (step count, compaction) is a practical schedule for
  self-healing in a coding-agent setting, simpler than wall-clock scheduling.
- The retirement of Letta V1 is a caution about API stability: users who built on its memory
  API had to migrate. A small, stable MCP tool surface is worth protecting.
- Storing secrets in memory is called out as a risk in Letta's prompt ("Never store secrets ...
  Memory is git-tracked and may be synced"). Factloom ingests text from coding sessions and
  needs the same rule.

## Open questions

- Does Letta offer a hosted or packaged MCP server that exposes agent memory to other clients?
  None was found in `letta-code`; other Letta repositories and the docs site were not searched
  exhaustively.
- How well does reflection resolve contradictions in practice over long histories? Not tested.
- What the Cloud backend stores beyond what the local backend does (for example embeddings for
  hybrid message search), and its pricing. Unverified.
- Whether the docs site documents MemFS behaviour that differs from the prompt files read here.
  Not checked.
