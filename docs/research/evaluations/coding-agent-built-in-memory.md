# Memory that the coding agents ship themselves (Claude Code, OpenAI Codex)

Accessed: 2026-11-13.

## Question

What memory does a user of Claude Code or the OpenAI Codex CLI already have without installing
anything, how does it handle time, conflict and maintenance, and what does that leave for Factloom?

Sources (all accessed 2026-11-13):

- Claude Code: https://code.claude.com/docs/en/memory.md and https://code.claude.com/docs/en/mcp.md.
  Claude API memory tool:
  https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool.md.
- Codex: https://github.com/openai/codex at commit `69231e1` (2026-11-13), mainly
  `codex-rs/memories/README.md`, `codex-rs/ext/memories/templates/memories/read_path.md`,
  `codex-rs/memories/write/templates/memories/consolidation.md`, `codex-rs/config/src/types.rs`,
  `codex-rs/features/src/lib.rs`. The pages under developers.openai.com/codex now redirect to
  learn.chatgpt.com: `/docs/customization/memories`, `/docs/agent-configuration/agents-md`,
  `/docs/extend/mcp`.
- Versions on npm today: `@anthropic-ai/claude-code` 2.1.323, `@openai/codex` 0.169.0.

Nothing in this document was observed by running either CLI; all findings are from documentation
and source. Labels: **confirmed** = stated in the vendor's docs or source; **likely** = inferred.

## Findings

### Claude Code: instruction files (written by the user)

- `CLAUDE.md` files are Markdown instructions loaded into every session. Locations, broadest first:
  a managed policy file (for example `/etc/claude-code/CLAUDE.md`), `~/.claude/CLAUDE.md`, the
  project's `./CLAUDE.md` or `./.claude/CLAUDE.md`, and `./CLAUDE.local.md`. Files from the working
  directory and every directory above it are concatenated, not overridden; subdirectory files load
  when Claude touches a file there. **confirmed** (memory.md "Choose where to put CLAUDE.md files",
  "How CLAUDE.md files load")
- `@path` imports pull other files in, up to four hops deep. **confirmed**
- `.claude/rules/*.md` holds modular rules; a `paths:` frontmatter field scopes a rule to matching
  files so it loads only when relevant. **confirmed** ("Organize rules with `.claude/rules/`")
- Claude Code reads `AGENTS.md` when the repository has no `CLAUDE.md` (v2.1.277 or later).
  **confirmed** ("AGENTS.md")
- Limits: a launch-time file over 4 MiB is skipped; files over about 200 lines "consume more context
  and may reduce adherence"; on-demand files are truncated at 40,000 characters on a 200K context
  window. **confirmed**
- The docs describe these files as "context, not enforced configuration". **confirmed**

### Claude Code: auto memory (written by Claude)

- On by default in local sessions. Claude saves notes of four types, recorded in frontmatter:
  `user`, `feedback`, `project`, `reference`. It is told to skip what can be derived from the code
  and what CLAUDE.md already says. **confirmed** ("Auto memory")
- Storage: `~/.claude/projects/<project>/memory/`, one directory per git repository, shared across
  its worktrees, containing a `MEMORY.md` index (one line per memory) and one Markdown topic file
  per memory. Machine-local; not shared across machines. **confirmed** ("Storage location")
- Loading: the first 200 lines or 25 KB of `MEMORY.md` are injected at the start of every
  conversation. Topic files are not loaded; Claude reads them with its file tools when it decides
  to. **confirmed** ("How it works")
- Time: when Claude writes a memory file with frontmatter, Claude Code stamps a `modified` ISO 8601
  timestamp, described as showing "how current the fact is". That is a last-write time. There is
  no validity interval and no history of earlier versions. **confirmed**
- Conflict and maintenance: no mechanism beyond the model editing its own files. When `MEMORY.md`
  nears its limit, Claude Code reminds Claude to shorten it and "merge or drop stale entries".
  Edits overwrite; nothing is invalidated or linked. **confirmed** (docs describe no other
  mechanism)
- Retrieval: the index is always in context; everything else is file reads and text search by the
  model. No vector or ranked search is documented. **confirmed**
- Audit: files are plain Markdown the user can browse with `/memory`, edit or delete. Memory files
  are excluded from transcript cleanup. No change log. **confirmed**
- Subagents can have their own separate memory directory. **confirmed**

### Claude API memory tool (for applications, not Claude Code itself)

- Tool type `memory_20250818`, name `memory`. It is client-side: Claude requests `view`, `create`,
  `str_replace`, `insert`, `delete` and `rename` operations on paths under `/memories`, and the
  application executes them against storage it controls. **confirmed** (memory-tool.md)
- It is a file interface, not a data model. Time, conflict handling, retrieval and audit are
  whatever the application's handler implements; by default there is none. **confirmed**

### Codex: `AGENTS.md` (written by the user)

- Discovery: in the Codex home (`~/.codex` unless `CODEX_HOME` is set) `AGENTS.override.md`, else
  `AGENTS.md`; then, from the project root down to the current directory, one file per directory
  (`AGENTS.override.md`, then `AGENTS.md`, then names in `project_doc_fallback_filenames`). Files
  are concatenated root-first, so closer files come later. **confirmed** (agents-md page)
- Combined size is capped by `project_doc_max_bytes`, default 32 KiB. **confirmed** (docs;
  `DEFAULT_PROJECT_DOC_MAX_BYTES = 32 * 1024` in `codex-rs/config/src/config_toml.rs`)
- The documentation describes the user writing these files; it does not describe Codex writing to
  them on its own. **confirmed**

### Codex: memories (written by Codex)

- Off by default. Enabled with `[features] memories = true` in `config.toml` or a setting in the
  desktop app. In source the feature key `memories` is `Stage::Stable`, `default_enabled: false`.
  **confirmed** (memories page; `codex-rs/features/src/lib.rs`)
- Pipeline, run in the background when a root session starts (`codex-rs/memories/README.md`):
  **confirmed**
  - Phase 1: for recent idle sessions ("rollouts"), a model extracts a `raw_memory` and a
    `rollout_summary`; secrets are redacted; results go to a local state database.
  - Phase 2: a consolidation sub-agent, with no network and local write access only, merges the
    selected phase-1 outputs into files under the memories root, guided by a git-style diff against
    the previous successful run.
- Defaults (`codex-rs/config/src/types.rs`): sessions at most 10 days old and idle at least 6
  hours are eligible; at most 2 per startup; up to 256 raw memories feed consolidation; memories
  unused for 30 days drop out of selection. **confirmed**
- Storage: `~/.codex/memories/` (or `memories_v2/` on a fresh home): `memory_summary.md`,
  `MEMORY.md`, `raw_memories.md`, `rollout_summaries/`, `skills/`; the directory is kept as a git
  baseline. **confirmed** (README, read_path.md, memories page)
- Loading: `memory_summary.md` is injected into the prompt; the agent is told to search `MEMORY.md`
  by keyword and open rollout summaries only when needed, within a budget of about 4 to 6 search
  steps. **confirmed** (`read_path.md`)
- Time: entries carry `updated_at`, and the consolidation prompt says "fresher validated evidence
  usually wins". No validity interval; no query for a past date. **confirmed**
  (`consolidation.md`)
- Conflict: handled by the consolidation agent following prompt rules, for example "If evidence
  conflicts and validation is unclear, preserve the uncertainty explicitly" and instructions to
  remove stale guidance. The result is rewritten Markdown; the old text is deleted, not kept as an
  invalidated record. **confirmed** (`consolidation.md` lines 157-176, 334-352)
- Maintenance: this is the one built-in system with scheduled consolidation, deduplication,
  usage-based forgetting (`usage_count`, `last_usage`, `max_unused_days`) and pruning of stale
  summaries. It runs at session start, not on a clock. **confirmed**
- Sources: `MEMORY.md` entries reference rollout summaries, which point to the session transcript
  file (`rollout_path`), and the read path includes memory citation parsing. **confirmed**
- The docs advise: "Treat memories as a helpful recall layer, not as the only source for rules that
  must always apply", and call the files "generated state" that should not be hand-edited as the
  primary control. **confirmed** (memories page)

### Side by side

| Dimension | Claude Code CLAUDE.md / rules | Claude Code auto memory | Codex AGENTS.md | Codex memories |
|---|---|---|---|---|
| Written by | user | model, during the session | user | model, background pipeline |
| Default | on | on (local sessions) | on | off |
| Unit | Markdown file | Markdown file per memory + index | Markdown file | Markdown registry + per-session summaries |
| Valid time ("true from/to") | no | no | no | no |
| Record time | file mtime / git | `modified` stamp | file mtime / git | `updated_at`, git baseline |
| "What was true on date X" | no | no | no | no |
| Conflict handling | none | model rewrites file | none | consolidation agent rewrites, prompt-guided |
| Old value kept and linked | no | no | no | no (only in git baseline or transcripts) |
| Scheduled maintenance | no | size reminder only | no | yes, at session start |
| Retrieval | always in context | index in context, then file reads | always in context | summary in context, then keyword search |
| Vector or graph search | no | no | no | no |
| Source pointer per fact | no | no | no | per-session summary and transcript path |
| Confidence | no | no | no | no |
| Scope | user, project, org | one repository, one machine | user, project | one user, one machine, all projects |
| Shared with a team | yes, via git | no | yes, via git | no |

All cells **confirmed** from the sources above, except "file mtime / git", which is **likely** (the
docs do not discuss it; it follows from these being ordinary files).

### Registering an external memory server

- Claude Code: `claude mcp add [options] <name> -- <command> [args...]` for stdio servers, with
  `--env KEY=VALUE` and `--scope local|project|user`; project scope writes `.mcp.json` at the
  project root, which each user must approve. **confirmed** (mcp.md)
- Codex: `codex mcp add <name> --env VAR=VALUE -- <command>`, or a `[mcp_servers.<name>]` table in
  `~/.codex/config.toml` with `command`, `args`, `env`, `env_vars`, `cwd`; a project
  `.codex/config.toml` is honored for trusted projects. **confirmed** (mcp page)
- Codex has `memories.disable_on_external_context`, which keeps sessions that used MCP tool calls
  or web search out of memory generation; it defaults to `false`. **confirmed** (memories page;
  `codex-rs/config/src/types.rs`)

## What it means for Factloom

- The free baseline is good at standing instructions and preferences: small, human-readable, always
  in context, shared through git. Factloom should not try to replace `CLAUDE.md` or `AGENTS.md`. A
  rule that must always apply belongs there, and both vendors say so.
- The baseline has no notion of when a fact was true, keeps no superseded value, has no confidence,
  and (except Codex's per-session summaries) no source pointer. It retrieves by putting an index in
  context and letting the model read files. Those are precisely Factloom's product 1 and product 2
  features, so the differentiation is real. It is also narrow: for a single developer on one
  repository with a few dozen memories, the built-in files are probably enough.
- Factloom's value for coding agents is therefore in cases the files handle badly: many facts
  (beyond a 200-line index or a 32 KiB cap), facts that change (dependency versions, owners,
  decisions reversed), questions about the past ("what did we decide before the migration"), memory
  shared across machines, teammates or both agents at once, and an audit trail. Phase 1 demos should
  target these, not "remembers my preference for pnpm".
- Both vendors chose plain files plus model-driven consolidation, with no vector store. That is
  evidence that simple retrieval is sufficient at small scale and that users value inspectable
  storage. Factloom should offer a readable export or view of current facts.
- Codex's pipeline is a worked example of scheduled self-healing: leased background jobs, a single
  global consolidation lock, usage-based selection, a diff against the last good state, and a
  sandboxed agent. Its trigger (session start, bounded work per start) suits a local tool with no
  daemon and is worth copying for Factloom phase 3.
- Integration notes: one MCP server works for both agents; the registration commands differ only in
  form. If a user turns on `memories.disable_on_external_context`, sessions that call Factloom
  tools are excluded from Codex's own memory generation.

### Conflicts with settled decisions

None with the settled list. One caution for the stated first use: both target agents now ship
memory that is free and (for Claude Code) on by default, so "the agent forgets between sessions" is
no longer an unsolved problem by itself. The remaining gap is the temporal, conflict, provenance and
sharing behavior listed above.

## Open questions

- How well auto memory and Codex memories work in daily use (precision of what is saved, how often
  stale notes mislead the agent) was not measured. **unverified**
- Whether Codex memories are scoped or filtered per project at read time, beyond the model matching
  keywords in a global `MEMORY.md`, was not established. **unverified**
- The exact semantics of `memories.version` and `memories.dual_write` were not checked in source.
  **unverified**
- Neither vendor's roadmap for memory was researched; either could add temporal or shared memory.
  **unverified**
- Claude Code's managed "cloud" sessions and Claude.ai chat memory are separate features and were
  not covered.
