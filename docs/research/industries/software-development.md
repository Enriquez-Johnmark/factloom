# Software development adapter: memory for coding agents

Accessed: 2026-11-13.

## Question

Factloom phase 1 is memory for coding agents (Claude Code, OpenAI Codex) through an MCP server. What
do coding agents need to remember across sessions, what do today's file-based memories do well and
badly, and what should a small software-development adapter look like: entity and relation types,
staleness signals, cheap verification against a repository, memory sources, scoping, and how agents
actually get to call memory tools? Where do bi-temporal facts help a coding agent, concretely?

Confidence labels: **confirmed** (read in a primary source or run here), **likely** (secondary
sources), **unverified** (listed under Open questions only). All URLs accessed 2026-11-13.

## Findings

### 1. What coding agents are told to remember today

| # | Finding | Source | Confidence |
|---|---|---|---|
| 1.1 | Claude Code has two mechanisms: CLAUDE.md files (written by the user, "instructions and rules") and auto memory (written by Claude, "learnings and patterns"). Both are loaded at the start of every conversation and are "context, not enforced configuration". | https://code.claude.com/docs/en/memory | confirmed |
| 1.2 | The docs say to keep CLAUDE.md to "facts Claude should hold in every session: build commands, conventions, project layout, 'always do X' rules", and to add an entry when Claude repeats a mistake, when a review catches something Claude should have known, or when the user retypes the same correction. Multi-step procedures and path-specific material belong in skills or path-scoped rules. | same | confirmed |
| 1.3 | Auto memory saves four typed kinds of note (`type` in frontmatter): `user` (role, expertise, working preferences), `feedback` (corrections and confirmed approaches), `project` (ongoing work, deadlines, decisions "that Claude can't derive from the code or git history"), `reference` (where to find information outside the project). It deliberately skips "anything it can derive from the codebase, such as architecture, file paths, or debugging fixes" and anything CLAUDE.md already says. | same | confirmed |
| 1.4 | Auto memory is stored at `~/.claude/projects/<project>/memory/` as a `MEMORY.md` index plus one topic file per memory. Only the first 200 lines or 25KB of `MEMORY.md` is loaded at session start; topic files are read on demand with ordinary file tools. It is machine-local and shared by all worktrees of one repository. | same | confirmed |
| 1.5 | AGENTS.md is described as "a README for agents", reported on its site as used by over 60k open-source projects and stewarded by the Agentic AI Foundation under the Linux Foundation. Suggested sections: project overview, build and test commands, code style, testing instructions, security considerations, plus commit/PR guidelines and deployment steps. No section is required. | https://agents.md/ | confirmed |
| 1.6 | Codex builds its instruction chain once per run: a global file in `~/.codex` (`AGENTS.override.md`, else `AGENTS.md`), then one file per directory from the project root down to the working directory, concatenated root-first so nearer files come later. The combined size limit `project_doc_max_bytes` defaults to 32 KiB. | https://learn.chatgpt.com/docs/agent-configuration/agents-md (redirect target of developers.openai.com/codex/guides/agents-md) | confirmed |
| 1.7 | Codex also has a separate, opt-in "memories" feature (`[features] memories = true`): generated in the background from eligible past chats after they go idle, stored under `$CODEX_HOME` (`memories_v2/` on fresh profiles), described as "generated state" not meant for hand edits, and as a recall layer rather than a place for mandatory rules. The page does not describe expiry, staleness handling, or per-project scoping. | https://learn.chatgpt.com/docs/customization/memories | confirmed |
| 1.8 | Cursor rules: project rules in `.cursor/rules` (`.mdc`, version-controlled) with `description`, `globs`, `alwaysApply`; user rules; team rules; AGENTS.md. Guidance: keep rules under 500 lines, reference files instead of copying them "so rules don't go stale", do not document common commands or duplicate codebase content, add a rule when the agent repeats a mistake. | https://cursor.com/docs/context/rules | confirmed |
| 1.9 | Claude Code now reads `AGENTS.md` directly when no `CLAUDE.md` exists in the working directory or above (v2.1.277 or later), so one file can serve both agents. | https://code.claude.com/docs/en/memory | confirmed |

Empirical studies of what these files contain:

| # | Finding | Source | Confidence |
|---|---|---|---|
| 1.10 | "Agent READMEs" studied 2,303 context files from 1,925 repositories. In the manually classified sample of 332 Claude Code files, the share of files containing each category was: testing 75.0%, implementation details 69.9%, architecture 67.7%, development process 63.3%, build and run 62.3%, system overview 59.0%, maintenance 43.7%, configuration and environments 38.0%, documentation 26.8%, debugging 24.4%, AI integration 24.4%, DevOps 18.1%, performance 14.5%, security 14.5%, UI/UX 8.7%, project management 5.4%. | https://arxiv.org/html/2511.12884v1 (Chatlatanagulchai et al., Nov 2025; the abstract of the later v2 gives slightly different figures, e.g. testing 75.9%) | confirmed |
| 1.11 | The same study: files change "like configuration code through frequent, small additions"; 67.4% of Claude Code files were modified in more than one commit; median additions per commit were 57 words while deletions were negligible (median under 15 words). The paper does not measure how much content is outdated; it raises "context debt" in discussion only. | same | confirmed |
| 1.12 | An earlier study of 253 CLAUDE.md files from 242 repositories found content dominated by operational commands, technical implementation notes and high-level architecture. | https://arxiv.org/abs/2509.14744 | confirmed (abstract) |
| 1.13 | A study of 466 open-source projects found "no established content structure yet" for AGENTS.md-style files, with instructions phrased as descriptive, prescriptive, prohibitive, explanatory or conditional. | https://arxiv.org/abs/2510.21413 | confirmed (abstract) |
| 1.14 | "Evaluating AGENTS.md" (Gloaguen et al., Feb 2026) tested Claude Code, Codex and Qwen Code on SWE-bench Lite (300 tasks) and a new 138-task set from 12 repositories with developer-committed context files. LLM-generated files changed resolution rate by -0.5% and -2% (not significant) and raised cost by about 20-23%; developer-written files raised resolution by 2.4% (not significant) at up to 19% more cost. Repository overviews did not reduce the steps needed to find the relevant files. Agents did follow the instructions (a tool named in the file was used about 1.6 times per task versus under 0.01 otherwise). The authors recommend including only what the agent cannot get from the README or the code, such as non-standard conventions. | https://arxiv.org/html/2602.11988 | confirmed |

Research on agent memory for software engineering:

| # | Finding | Source | Confidence |
|---|---|---|---|
| 1.15 | "Improving Code Localization with Repository Memory" (ICLR 2026) builds memory from a repository's commit history (recent commits, linked issues, summaries of frequently changed areas) and reports improved localization on SWE-bench Verified and SWE-bench-Live. Numbers are not in the abstract. | https://arxiv.org/abs/2510.01003 | confirmed (abstract) |
| 1.16 | MemGovern converts GitHub issue and PR discussions into 135K "experience cards" and reports a 4.65% higher resolution rate on SWE-bench Verified. | https://arxiv.org/abs/2601.06789 | confirmed (abstract) |

Categories of memory, mapped to who covers them today. "Derivable" means an agent can recover it from
the working tree or git without memory.

| Category | Example | Covered by CLAUDE.md / AGENTS.md guidance | Claude auto memory | Derivable from repo |
|---|---|---|---|---|
| Decisions and their reasons | "Chose SQLite over Postgres for local use because ..." | architecture sections (1.10) | `project` | reason usually not |
| Conventions | "Named exports only" | yes (1.2, 1.5) | `feedback` | partly (linter config) |
| Commands and recipes | "Run `pnpm test --filter core`" | yes, most common (1.10, 1.12) | skipped if in CLAUDE.md | partly (package.json scripts) |
| Environment gotchas | "Tests need Docker running" | sometimes | `feedback` / `project` | no |
| Dependency choices and versions | "Stay on v3 of X until Y is fixed" | rarely | `project` | version yes, reason no |
| Bug causes and fixes | "Flaky test caused by shared temp dir" | debugging 24% (1.10) | explicitly skipped (1.3) | fix yes, cause sometimes (commit message) |
| User preferences | "Prefers small PRs" | user-level files | `user`, `feedback` | no |
| In-progress work | "Migration half done; next step is ..." | no | `project` | no |
| Ownership and pointers | "Payments owned by team B; dashboard at ..." | sometimes | `reference` | partly (CODEOWNERS) |

### 2. What file-based memory cannot do, and what it does well

| # | Limitation | Evidence | Confidence |
|---|---|---|---|
| 2.1 | No conflict handling. "If two instructions contradict each other, Claude may pick one arbitrarily"; user and project rules do not override each other. Codex resolves by position only (nearer file later in the prompt). | https://code.claude.com/docs/en/memory ; https://learn.chatgpt.com/docs/agent-configuration/agents-md | confirmed |
| 2.2 | Goes stale; cleanup is manual. The docs tell users to "review ... periodically to remove outdated or conflicting instructions" and provide `/doctor prompt-audit`, an LLM pass that looks for "references to files or commands that don't exist" and files that contradict each other. Cursor's docs warn that copied content goes stale. | same; https://cursor.com/docs/context/rules | confirmed |
| 2.3 | No notion of time. None of the formats (CLAUDE.md, AGENTS.md, `.mdc` rules, auto memory frontmatter `type`) has a field for when a statement became true or stopped being true. Git history of the file records when text was edited, not when the fact held. | format descriptions in the pages above | confirmed (absence in the documented formats) |
| 2.4 | Loaded wholesale. CLAUDE.md is loaded in full each session (up to 4 MiB per file); guidance is to stay under 200 lines because "longer files consume more context and reduce adherence". Imports do not reduce cost. Codex stops adding files at 32 KiB. | https://code.claude.com/docs/en/memory ; Codex page above | confirmed |
| 2.5 | Hard index cap for auto memory: content past 200 lines or 25KB of `MEMORY.md` is "dropped on the next load". | https://code.claude.com/docs/en/memory | confirmed |
| 2.6 | Grows by accretion: additions dominate, deletions are negligible (1.11). | https://arxiv.org/html/2511.12884v1 | confirmed |
| 2.7 | Benefit is not guaranteed and has a cost: about 20% more inference cost with no significant gain in task success in one controlled study (1.14). | https://arxiv.org/html/2602.11988 | confirmed |
| 2.8 | Auto memory is machine-local: "not shared across machines or cloud environments". Codex memories are per machine. | pages above | confirmed |

What file-based memory does well, which Factloom must not make worse:

| # | Strength | Evidence | Confidence |
|---|---|---|---|
| 2.9 | Zero setup and always present: project-root CLAUDE.md is in context from the first turn and is re-read from disk after compaction. No tool call has to happen. | https://code.claude.com/docs/en/memory | confirmed |
| 2.10 | Transparent and editable: plain Markdown that the user can open, edit or delete (`/memory`); auto memory files are also plain Markdown. | same | confirmed |
| 2.11 | Version-controlled and reviewable: project files are shared "via source control", so changes go through normal review and blame. | same | confirmed |
| 2.12 | Portable across agents: AGENTS.md is read by Codex, Cursor, Claude Code and many others. | https://agents.md/ ; 1.9 | confirmed |
| 2.13 | Instructions in these files are followed reliably when present (1.14). | https://arxiv.org/html/2602.11988 | confirmed |

### 3. Existing code knowledge-graph schemas

| # | Finding | Source | Confidence |
|---|---|---|---|
| 3.1 | Kythe's schema has 25 node kinds (anchor, file, function, record, variable, package, ...) and about 50 edge kinds (defines, defines/binding, ref, ref/call, childof, extends, overrides, ...). It models the syntactic and semantic structure of source code, anchored to byte offsets. | https://kythe.io/docs/schema/ | confirmed |
| 3.2 | SCIP models an Index of Documents; each Document has Occurrences (a range bound to a Symbol with role bits such as Definition, Import, WriteAccess, ReadAccess, Test) and SymbolInformation with Relationships (`is_reference`, `is_implementation`, `is_type_definition`, `is_definition`). Symbols carry package manager, name and version. | https://github.com/sourcegraph/scip/blob/main/scip.proto | confirmed |
| 3.3 | Both schemas describe facts that are fully derivable from the code at one commit, produced by a compiler-grade indexer. Neither has decisions, conventions, reasons, people or time. | reading of 3.1 and 3.2 | confirmed |
| 3.4 | ADR formats already carry a small lifecycle: MADR 4.0.0 has optional `status` (proposed, rejected, accepted, deprecated, superseded by a later ADR) and `date`, and recommends `docs/decisions`. | https://adr.github.io/madr/ | confirmed |

### 4. Repository checks, run here

Throwaway repository in a directory outside this repository (git 2.43.0, ripgrep 14.1.0): one file created, renamed
(`src/util.ts` to `src/dates.ts`), then a function renamed inside it.

| # | Check | Command | Result | Confidence |
|---|---|---|---|---|
| 4.1 | Path exists at HEAD | `git cat-file -e HEAD:src/util.ts` | exit 128 for the old path; no working tree needed | confirmed (run) |
| 4.2 | Find where a missing path went | `git log --diff-filter=D --format=%H -1 -- <old>` then `git show -M --name-status <sha>` | prints `R100 src/util.ts src/dates.ts` | confirmed (run) |
| 4.3 | History across a rename | `git log --follow --name-status --format='%h %cI %s' -- <new>` | all three commits with A, R100, M and committer timestamps | confirmed (run) |
| 4.4 | Symbol still present | `rg -n -w -F 'parseDate' src` | exit 1 (no match) after the rename; `rg -c -w -F parseIsoDate src` gives `src/dates.ts:1` | confirmed (run) |
| 4.5 | When a symbol's occurrence count changed | `git log -S'parseDate(' --format='%h %cI %s'` | lists the adding commit and the commit that removed it | confirmed (run) |
| 4.6 | Has this file changed since the fact was extracted | compare stored blob id with `git rev-parse HEAD:<path>`; for uncommitted edits `git hash-object <path>` | ids differ after the edit; `hash-object` equals the blob id when the tree is clean | confirmed (run) |
| 4.7 | Is the fact's commit on this branch | `git merge-base --is-ancestor <sha> HEAD` | exit 0 for an ancestor, 1 for a commit on another branch | confirmed (run) |
| 4.8 | Stable repository identity | `git rev-list --max-parents=0 HEAD` (root commit), `git rev-parse --git-common-dir` | both work; the common dir is shared by worktrees (git documentation behaviour, not tested with a second worktree here) | confirmed for a single worktree |

Package versions seen on the npm registry on 2026-11-13 (`npm view <pkg> version`): `typescript`
7.0.2, `ts-morph` 28.0.0, `web-tree-sitter` 0.27.2, `tree-sitter` 0.25.1, `tree-sitter-typescript`
0.23.2, `@ast-grep/napi` 0.51.2. **confirmed** as registry values; none was installed or exercised.

### 5. How agents come to use memory tools

| # | Finding | Source | Confidence |
|---|---|---|---|
| 5.1 | MCP tools are "model-controlled": the model decides when to call them from its context and the tool metadata. Nothing in the protocol makes a call happen. | https://modelcontextprotocol.io/specification/2025-11-25/server/tools | confirmed |
| 5.2 | In Claude Code, MCP tool search is on by default: tool definitions are deferred, and "only tool names and server instructions load at session start". Server instructions "help Claude understand when to search for your tools". | https://code.claude.com/docs/en/mcp | confirmed |
| 5.3 | Claude Code truncates server instructions and upfront-loaded tool descriptions at 4,096 characters, and descriptions of deferred tools at 16,384 characters; the search matches only the first part. A server can mark a tool `_meta["anthropic/alwaysLoad"]: true`. Advice: put critical details and searchable words first. | same | confirmed |
| 5.4 | MCP tool output warns above 10,000 tokens and is limited to 25,000 tokens by default (`MAX_MCP_OUTPUT_TOKENS`). | same | confirmed |
| 5.5 | Anthropic's guidance on tools: describe a tool as to "a new hire", name parameters unambiguously, return high-signal fields rather than opaque ids, offer concise and detailed response formats, and prefer a few consolidated tools ("more tools don't always lead to better outcomes"). | https://www.anthropic.com/engineering/writing-tools-for-agents | confirmed |
| 5.6 | The Claude API memory tool does not rely on the model's initiative alone: when the tool is present the API adds a system instruction that begins "IMPORTANT: ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE" and tells the model to assume its context may be reset at any time. The same page says Claude "usually refuses to write sensitive information" and recommends validation that strips sensitive data, plus expiry of files not accessed for a long time. | https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool | confirmed |
| 5.7 | Claude Code hook events relevant to memory (names as documented today): `SessionStart` (matchers `startup`, `resume`, `clear`, `compact`, `fork`), `UserPromptSubmit`, `PreCompact` (`manual`, `auto`), `PostCompact`, `Stop`, `SubagentStop`, `SessionEnd`, `PostToolUse`, `FileChanged`, `InstructionsLoaded`. The full list has over 30 events. | https://code.claude.com/docs/en/hooks | confirmed |
| 5.8 | `SessionStart` and `UserPromptSubmit` hooks can inject text into context (`hookSpecificOutput.additionalContext` or plain stdout). `SessionEnd` cannot inject context and shares a default 1.5-second budget. `PreCompact` stdout becomes instructions for the compaction summary, not conversation context. Hooks receive `session_id`, `transcript_path` and `cwd`; `Stop` also receives `last_assistant_message`. | same | confirmed |
| 5.9 | Hook handler types are `command`, `http`, `mcp_tool`, `prompt` and `agent` (experimental). `SessionStart` supports only `command` and `mcp_tool`, so a hook can call a Factloom MCP tool directly with no shell script. | same | confirmed |
| 5.10 | Codex has hooks, enabled by default, configured in `hooks.json` or `[hooks]` in `config.toml` under `~/.codex/` or `<repo>/.codex/`. Events include `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `PostCompact`, `Stop`, `SessionEnd`. `SessionStart` and `UserPromptSubmit` can add developer context via stdout or `additionalContext`. Non-managed hooks must be trusted with `/hooks` before they run. | https://learn.chatgpt.com/docs/hooks (redirect target of developers.openai.com/codex/hooks) | confirmed |
| 5.11 | MCP server configuration in Claude Code has three scopes: local and user (both in `~/.claude.json`) and project (`.mcp.json`, committed, needs approval on first use). | https://code.claude.com/docs/en/mcp | confirmed |

### 6. Secrets handling in comparable tools

| # | Finding | Source | Confidence |
|---|---|---|---|
| 6.1 | Codex "redacts secrets from generated memory fields", still tells users to review memory files before sharing and not to store secrets, and offers `memories.disable_on_external_context` to keep chats that used MCP tools or web search out of memory generation. | https://learn.chatgpt.com/docs/customization/memories | confirmed |
| 6.2 | The Claude API memory tool relies on the model usually declining to store sensitive data and recommends a validation layer in the handler (5.6). | memory tool page | confirmed |
| 6.3 | GitHub push protection blocks pushes containing provider-pattern credentials, private keys and custom patterns before they reach the repository. | https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection | confirmed |
| 6.4 | Gitleaks (MIT) detects secrets with regular-expression rules and optional Shannon-entropy thresholds. Its README states it is feature complete and will receive security patches only, with the maintainer moving to a successor project. | https://github.com/gitleaks/gitleaks | confirmed |

## What it means for Factloom

### A. Position: complement the files, do not replace them

The evidence points one way. Files are good at standing instructions that must be present on turn one
(2.9, 2.13), and both vendors keep "must follow" rules there (1.7). They are weak exactly where
Factloom is strong: time, conflicts, staleness and selective recall (2.1 to 2.6). Claude's own auto
memory already avoids storing what the code can tell it (1.3), and the one controlled study found
that overviews of the codebase do not help (1.14).

Consequences for the adapter:

- Store what is not derivable from the repository: reasons, reversals, preferences, gotchas, the state
  of unfinished work, and the history of facts that changed. Do not index code structure (3.3).
- Keep every memory inspectable as plain text. A `factloom export` to Markdown per repository costs
  little and preserves 2.10 and 2.11 for users who want to review or commit a snapshot.
- Do not ask users to move rules out of CLAUDE.md or AGENTS.md. Later, those files are a memory
  source (section F), not a competitor.
- Recall must be selective and small. A recall result that returns everything recreates 2.4 and 2.7.

### B. Proposed entity types (9)

| Entity type | Definition | Example |
|---|---|---|
| Repository | One git repository, identified by root commit SHA plus remote URL when present | `factloom` |
| Path | A file or directory inside a repository (also a monorepo package) | `packages/core/src/fact.ts` |
| Symbol | A named code element inside a Path | function `invalidateFact` |
| Dependency | An external package, tool, runtime or service | `vitest`, `node`, `sqlite-vec` |
| Command | A runnable recipe | `pnpm test --filter @factloom/core` |
| Decision | A choice with a reason, possibly from an ADR | "No ORM; hand-written SQL" |
| Convention | A rule about how code or process is done here | "Named exports only" |
| WorkItem | A bug, incident or unit of in-progress work | "Flaky retrieval test on CI" |
| Person | A user, teammate or team | "Alice" |

### C. Proposed relation (predicate) types (14)

"Functional" means at most one current fact per key, so a new value supersedes the old one
automatically. The key is given per row. Several rows need a key that includes a qualifier (called
`slot` here) in addition to subject and predicate.

| Predicate | Subject to object | Definition and example | Functional? (key) |
|---|---|---|---|
| `uses` | Repository or Path to Dependency, optional `slot` | "Project uses Vitest as its test framework" (`slot=test_framework`); also `package_manager`, `runtime`, `linter` | Yes when `slot` is set (subject, slot); multi-valued otherwise |
| `pins_version` | Repository or Path to Dependency, value = version or range | "`packages/core` pins zod at 4.x" | Yes (subject, object) |
| `runs_with` | Repository or Path to Command, `slot` = purpose | "Tests run with `pnpm test`" (`slot=test`); `build`, `lint`, `dev`, `release` | Yes (subject, slot) |
| `located_at` | Symbol to Path | "`parseIsoDate` lives in `src/dates.ts`" | Yes (subject) |
| `follows` | Repository or Path to Convention | "`apps/` follows 'no default exports'" | No |
| `prefers` | Person to Convention | "Alice prefers small PRs" | No |
| `supersedes` | Decision to Decision, Convention to Convention | "ADR-0007 supersedes ADR-0003" | No |
| `motivated_by` | Decision or Convention to WorkItem, Dependency or Decision | "Switch to Vitest was motivated by ESM issues in Jest" | No |
| `affects` | Decision, Convention or WorkItem to Path, Symbol or Dependency | "'No ORM' affects `packages/storage`" | No |
| `caused_by` | WorkItem to Path, Symbol, Dependency or Decision | "Flaky test caused by shared temp directory in `test/setup.ts`" | No |
| `fixed_by` | WorkItem to Path or Symbol, value = commit SHA | "Fixed by commit `9163923`" | No |
| `works_around` | Path, Symbol or Convention to WorkItem or Dependency | "Retry wrapper works around bug in driver v2" | No |
| `owns` | Person to Path or Dependency | "Team B owns `services/payments`" | No |
| `has_status` | WorkItem or Decision to value | "Migration: in progress, next step X" / "ADR-0003: superseded" | Yes (subject) |

Notes:

- Compared with Kythe and SCIP (3.1 to 3.3), this schema is deliberately not a code graph. It has two
  anchors into code (Path, Symbol) and treats everything derivable from source as out of scope. The
  code-graph schemas are the right model if Factloom ever needs call or reference edges; they could be
  produced by an existing indexer rather than by Factloom.
- `supersedes` and Decision `has_status` mirror MADR's status field (3.4), so ADR ingestion maps onto
  existing predicates.
- A fact is true for a scope (repository, sometimes a Path subtree, sometimes a branch). Scope should
  be a property of the fact, not a predicate (section G).
- **Core requirement to check against the fact schema:** functional predicates need a key that can
  include a qualifier, not only (subject, predicate). Without it, "uses Vitest as test framework" and
  "uses pnpm as package manager" either collide or require a separate predicate per role. This is the
  one schema-level request from this adapter. The technical documents key supersession on
  (subject, predicate) only; see `../OPEN-QUESTIONS.md`, D-1.
- An independent review questioned starting with 9 entity types and 14 predicates before any data
  exists, and noted that `Symbol` and `located_at` sit close to the code structure this document
  says not to index. Recorded as open in `../OPEN-QUESTIONS.md`, section C.

### D. What makes a code memory stale, and the signal

| Cause | Detectable signal | Check | Cost |
|---|---|---|---|
| File deleted | Path absent at HEAD | 4.1 | one git call |
| File moved or renamed | Path absent; rename record in history | 4.2 | two git calls |
| Symbol renamed or removed | No word match in the recorded Path, or anywhere | 4.4; history via 4.5 | one ripgrep call |
| Source text of the fact changed | Stored blob id differs from current blob id | 4.6 | one git call |
| Dependency version changed | Manifest or lockfile entry differs from the stored value | parse `package.json` and the lockfile | file read |
| Dependency removed or replaced | Name missing from manifest and lockfile | same | file read |
| Config or command changed | `scripts` entry or config file blob id changed | parse `package.json`; 4.6 on the config file | file read |
| Decision reversed | New statement conflicts with a functional fact; ADR status changes to superseded; user correction | write-time conflict detection (phase 2) | LLM for free text, none for ADR status |
| Workaround obsolete | The Dependency it `works_around` crossed the fixed version; linked WorkItem closed | version comparison | file read |
| Branch difference | The fact's source commit is not an ancestor of HEAD | 4.7 | one git call |
| Never used | Not returned or confirmed for a long time | usage counters | none |

Deterministic checks can show that a fact's anchor is gone or changed. They cannot show that a
free-text reason is still right. A changed blob means "re-verify", not "false".

### E. Verification ladder, cheapest first

| Rung | Check | Outcome | LLM |
|---|---|---|---|
| 0 | Fact has no code anchor (preference, reason) | skip to usage and age rules | no |
| 1 | Branch and repository match (4.7, 4.8) | out of scope: do not return, do not invalidate | no |
| 2 | Path exists (4.1); if not, find rename (4.2) | renamed: repair the link; deleted: mark the fact for review | no |
| 3 | Blob id unchanged since extraction (4.6) | unchanged: still supported, stop here | no |
| 4 | Structured value check: manifest version, script entry, ADR status | equal: supported; different: supersede with the new value, source = the file | no |
| 5 | Symbol word search with ripgrep (4.4) | found: supported; not found: search the repository, then history (4.5) | no |
| 6 | Syntax-aware symbol check (tree-sitter or the TypeScript compiler) | only if rung 5 is ambiguous (common names, comments, strings) | no |
| 7 | LLM re-reads the changed span against the fact | supported, contradicted or unclear | yes |

Recommendation: implement rungs 1 to 5 with git and ripgrep only. They need no parser, are language
independent, and were run above. Add rung 6 later and only if false matches show up in practice; it
is the only rung that adds a dependency per language. Most facts should stop at rung 3, because most
files do not change between checks.

What belongs to which phase (an independent review questioned whether blob id, line span and span
hash are needed in phase 1, when only explicit "remember" calls are ingested; recorded as open in
`../OPEN-QUESTIONS.md`, section C):

| Phase | Needed |
|---|---|
| 1 (must record, or later phases are impossible) | On every source: repository identity (root commit SHA, remote URL), commit SHA at extraction, branch name, path, blob id of the file, line span, a hash of the extracted span text, source kind, and the commit's committer time when the source is a commit. On every fact: the anchors (Path, Symbol) as entities, not only as words in the text. |
| 1 (cheap, optional) | Rungs 1 and 2 at recall time for the handful of facts being returned, so the agent is not handed a path that no longer exists. |
| 2 (self-correction) | Rung 4 as a deterministic conflict source; functional-predicate supersession. |
| 3 (self-healing) | The full ladder on a schedule, link repair after renames, rung 7 for what remains. |

Commit timestamps are usable valid-time evidence: `valid_from` can be the committer time of the commit
that introduced a change (4.3, 4.5) rather than the time the agent happened to learn it. Author and
committer times can be rewritten by rebases, so treat them as evidence, not proof.

### F. Sources of memory, in order of support

| Order | Source | Why this position |
|---|---|---|
| 1 | Explicit "remember this" from the agent or user through an MCP tool | Simplest; the statement is already distilled; the agent supplies the anchor paths; no background processing |
| 2 | ADR files and CLAUDE.md / AGENTS.md | Small, structured, version-controlled; ADR status and date map directly to validity (3.4); content is already curated |
| 3 | Commit messages and PR descriptions | Timestamped and tied to a diff, which gives valid time and anchors for free; quality varies; Conventional Commits (`type(scope): description`, `BREAKING CHANGE:`) help when present (https://www.conventionalcommits.org/en/v1.0.0/, confirmed) |
| 4 | Conversation transcripts (via `transcript_path` from hooks, 5.8) | Richest and noisiest; needs LLM extraction, deduplication and secret filtering; highest cost and privacy exposure |
| 5 | Code comments | Mostly derivable; go stale silently; low value per token |

Phase 1 should ship source 1 only, with the provenance fields of section E. Source 2 is the natural
first addition. Sources 3 to 5 depend on extraction quality and belong after self-correction exists,
because they will produce conflicting statements in volume. Research findings 1.15 and 1.16 suggest
commit and issue history is valuable, which supports adding source 3 before source 4.

### G. Scoping

| Question | Recommendation | Basis |
|---|---|---|
| Per repository, per user or global | Two scopes at first: `repository` and `user`. Repository facts are about the code; user facts are preferences that follow the person. Defer an organisation scope. | Mirrors project and user scopes in Claude Code and Codex (1.4, 1.6, 5.11) |
| Repository identity | Root commit SHA plus normalised remote URL; never the directory path, which differs per clone and worktree | 4.8; Claude derives its project key from the git repository so worktrees share memory (1.4) |
| Branches and worktrees | One store per repository, shared by worktrees. Record branch and commit on each source. At recall, prefer facts whose source commit is an ancestor of HEAD (4.7); return others marked as "from branch X". Do not invalidate a fact because it is false on another branch. | 4.7 |
| Monorepos | A fact may carry a Path scope (a package directory). Recall filters by the paths the agent is working in, the same idea as nested AGENTS.md and path-scoped rules. | 1.5, 1.6, 1.8 |
| Storage location | Outside the repository by default (user data directory), so nothing is committed by accident; export on request | 1.4 does the same |
| Secrets | Scan every text before it is stored or sent for extraction; refuse or redact on a match; never store the matched value, including in the audit log. Start with a small set of high-precision patterns (private key headers, provider-prefixed tokens, `password=`-style assignments) plus an entropy check. | 6.1 to 6.4 |

Secrets detail: Factloom's "invalidate, never delete" rule makes a stored secret permanent, so the
filter has to run before the first write. A purge path for the rare miss is a core question, covered
in `other-industries.md` (hard deletion) and listed as `../OPEN-QUESTIONS.md`, D-10.

### H. Getting the agent to save and recall

The main risk is that the agent never calls the tools (5.1). With tool search on, the agent sees only
tool names and the server's instructions until it searches (5.2), so those two strings carry the
whole burden. What the verified facts support:

1. Write server instructions that say when to recall and when to save, within the first few hundred
   characters, and well inside the 4,096-character cut (5.3).
2. Keep the tool count small and the names self-explanatory, with a common prefix (5.5), for example
   recall, remember, correct. Mark recall as always loaded (5.3) so it is not hidden behind search.
3. Keep recall output small by default with a detail option (5.4, 5.5), and return readable
   statements with dates and source paths, not ids.
4. Do not depend on the model's initiative for recall. Offer an optional `SessionStart` hook that
   calls a Factloom tool or command and injects a short digest (5.8, 5.9), also on the `compact`
   matcher so memory returns after compaction. Codex supports the same pattern (5.10).
5. For saving, the explicit tool comes first. A `Stop` or `PreCompact` hook that hands
   `transcript_path` to an extractor is the route to source 4 later. `SessionEnd` is a poor place for
   slow work because of its short default budget (5.8).
6. A one-line pointer in CLAUDE.md or AGENTS.md ("this repository has Factloom memory; recall before
   non-trivial work") is the lowest-tech trigger and is followed reliably when present (2.13).

Hooks are optional extras. The server must be useful with no hook installed, because hooks need
per-user configuration and, in Codex, an explicit trust step (5.10).

### I. Where bi-temporal facts help: scenarios for an evaluation set

Each scenario has a fact that changes, a question about now, and a question about the past. Valid
time is when it was true in the repository; recorded time is when Factloom learned it.

| # | Scenario | "Now" question | "Then" question | Tests |
|---|---|---|---|---|
| 1 | Test framework switched from Jest to Vitest in March | "How do I run one test file?" must answer with Vitest | "Why does the February CI log show Jest?" | functional supersession on `uses[slot=test_framework]` and `runs_with[slot=test]` |
| 2 | A function moved from `util.ts` to `dates.ts` and was renamed | "Where is date parsing?" | "What was `parseDate` in the commit I am bisecting?" | link repair by 4.2; `located_at` history |
| 3 | Convention reversed: default exports allowed, later banned | "Which export style here?" | "Was this old file written against the rule of its time?" | invalidation with a link to the replacement |
| 4 | Workaround no longer needed after a dependency upgrade fixed the bug | "Should new code use the retry wrapper?" must say no | "Why is the wrapper in this module?" | `works_around` ended by a `pins_version` change |
| 5 | Dependency pinned because of a regression, then unpinned | "Can I upgrade X?" | "Why were we on 3.x in June?" | `pins_version` with a reason via `motivated_by` |
| 6 | Late-arriving knowledge: the agent learns in May that the deploy target changed in April | "Where do we deploy?" | "What did the agent believe on 20 April?" versus "What was true on 20 April?" | the two time axes give different answers; only a bi-temporal store separates them |
| 7 | Wrong memory corrected: the agent recorded port 5433; the user says it was always 5432 | "Which port?" | "Which facts did the agent act on last week?" | retraction: recorded time ends, valid time is replaced, the audit trail explains the earlier behaviour |
| 8 | Branch divergence: `main` uses the old API client, a long-lived branch uses the new one | on each branch, "Which client do I use?" | none | scope filter by commit ancestry, no invalidation |

Scenarios 6 and 7 are the ones a single timestamp cannot express; 1 to 5 need valid time and
supersession; 8 shows that some apparent conflicts are scope, not time. A small eval set can be built
as scripted git repositories with a list of statements fed in order and questions asked at fixed
points.

## Conflicts with settled decisions

None found. Two observations that stay inside the settled design:

- "Automatic correction for coding agents" should not mean automatic invalidation on a failed
  deterministic check. A changed blob or a fact from another branch is a reason to re-verify or to
  filter, not to invalidate (sections D, G).
- "Invalidate, never delete" needs one exception path for secrets stored by mistake (section G).

## Open questions

- **unverified**: How often agents call a memory MCP server unprompted in real sessions. No measured
  source was found; section H assumes the worst case. Worth measuring with Factloom's own logs.
- **unverified**: Current state of Cursor's Memories feature. Search results show forum posts saying
  the management UI was removed in version 2.1 and conflicting staff replies; no current official
  documentation page was found, so it is not used as evidence above.
- **unverified**: Whether Codex memories are scoped per project. The official page does not say.
- **unverified**: Whether Codex defers MCP tool descriptions the way Claude Code does, and its
  truncation limits. Not checked.
- **unverified**: The published `typescript` package is now 7.0.2. Whether its programmatic compiler
  API is compatible with what `ts-morph` 28 and similar tools expect was not checked. This matters
  only if rung 6 is built on the TypeScript compiler rather than tree-sitter.
- **unverified**: tree-sitter grammar and runtime compatibility (`web-tree-sitter` 0.27.2 with
  `tree-sitter-typescript` 0.23.2) was not tested.
- **unverified**: LSP-based symbol checks were not evaluated; they need a running language server per
  language and are likely too heavy for a scheduled job, but this was not measured.
- **unverified**: The 4.8 claim that worktrees share one identity was reasoned from git's documented
  behaviour and not tested with a second worktree.
- **unverified**: Quantitative gains in the repository-memory papers (1.15, 1.16) were taken from
  abstracts; methods and baselines were not reviewed.
- Open design question: the functional key with a `slot` (section C) needs a decision in the core
  fact schema before phase 1 data is written.
- Open design question: which secret patterns to ship first, and whether to reuse an existing rule
  set. Gitleaks' rules are MIT licensed but the project is in maintenance mode (6.4).
