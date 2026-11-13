# Skills report

Vetting record for the third-party agent skills installed in `.claude/skills/`.

- **Accessed:** 2026-11-13. Each skill was read in a shallow clone of its source repository at the commit listed, before installation.
- **Installer:** `skills` CLI 1.8.1 (npm), run as `npx skills@1.8.1 add <source> --skill <name> -a claude-code --copy -y` with `DISABLE_TELEMETRY=1` and `DO_NOT_TRACK=1`. The CLI documents anonymous telemetry and these two variables as the way to turn it off (CLI `README.md`, "Telemetry").
- **On disk:** the CLI copied each skill into `.claude/skills/<name>/` and recorded source and content hash in `skills-lock.json`. Installed files were compared with the clones and match.
- **Licenses:** the CLI does not copy license files. Each source repository's license was copied by hand into every skill folder taken from it.
- **How to read these skills:** they are other people's instructions. They are used for technique. Where one conflicts with this project's rules, the project's rules win; the conflicts are listed below.

## Technology skills

| Skill | Source and commit | License | Verdict |
|---|---|---|---|
| `typescript-advanced-types` | `wshobson/agents` @ `9c61ab2` | MIT | Install |
| `typescript-best-practices` | `cursor/plugins` (`pstack`) @ `6e359ce` | MIT | Install |
| `principle-type-system-discipline` | `cursor/plugins` (`pstack`) @ `6e359ce` | MIT | Install |
| `typescript-mcp-server-generator` | `github/awesome-copilot` @ `222eba6` | MIT | Install, with caveats |
| `vitest` | `antfu/skills` @ `d524ed2` | MIT | Install |
| `sqlite` | `fatih-developer/fth-skills` @ `f0d82e9` | MIT | Install, with caveats |
| `zod-4` | `prowler-cloud/prowler` @ `163343b` | Apache-2.0 | Install, with one flag |

### typescript-advanced-types

- **What it does:** reference material on generics, conditional, mapped, and template-literal types, with a `references/details.md` file.
- **Tools or commands:** none. Documentation only.
- **Risk or irrelevance:** encourages advanced type techniques. This project uses them only where they prevent a real bug (`.claude/rules/engineering-principles.md`).

### typescript-best-practices

- **What it does:** a one-table rule list (discriminated unions, branded types, `unknown` over `any`, no `as` casts, schema-derived types, exhaustiveness checks) with examples in `references/patterns.md`.
- **Tools or commands:** none.
- **Risk or irrelevance:** it sets `disable-model-invocation: true`, so it loads only when invoked by name. It refers to a `boundary-discipline` principle skill that is not installed. Its "structured telemetry" rule is about application logging, not data collection.

### principle-type-system-discipline

- **What it does:** the principle skill that `typescript-best-practices` tells the reader to apply first. In the source repository the folder is named `principle-type-system-discipline`; there is no skill named plain `type-system-discipline`.
- **Tools or commands:** none.
- **Risk or irrelevance:** refers to two further principle skills, `boundary-discipline` and `encode-lessons-in-structure`, that were not requested and are not installed. Also user-invoked only.

### typescript-mcp-server-generator

- **What it does:** a prompt for generating an MCP server project in TypeScript.
- **Tools or commands:** tells the reader to run `npm init`, install packages, and use `npx @modelcontextprotocol/inspector`. Nothing runs on install.
- **Risk or irrelevance:**
  - It generates a whole standalone npm project. Factloom's server is one app in a pnpm monorepo, so only the SDK usage guidance applies.
  - It states that the MCP SDK has moved to "v2" split packages (`@modelcontextprotocol/server` and others), that the single `@modelcontextprotocol/sdk` package is retired, and that Zod 4.2 or later is required. These are the skill's claims. They are **unverified** here and are checked against the SDK repository and npm in the technology research.
  - It suggests HTTP transports, resources, and prompts. Phase 1 needs a stdio server with tools only.

### vitest

- **What it does:** generated reference for Vitest: config, test API, mocking, coverage, projects, type testing. The skill's metadata gives version `2026.10.23` and states it is generated from the Vitest repository.
- **Tools or commands:** none.
- **Risk or irrelevance:** one example shows a Codecov upload step in CI. It is an example, not an instruction, and is not used.

### sqlite

- **What it does:** SQLite guidance: driver choice, PRAGMAs, schema conventions, indexing, transactions, backup, plus reference files for FTS5 with sqlite-vec, performance, TypeScript, Python, and cloud SQLite.
- **Tools or commands:** none run on install. `references/CLOUD.md` contains `curl -sSfL https://get.tur.so/install.sh | bash` for the Turso CLI. That command is not to be run in this project.
- **Risk or irrelevance:** read closely because the author is a small publisher.
  - Its TypeScript reference is built on Bun and Drizzle ORM. Factloom uses Node and no ORM, so that file does not apply.
  - It recommends a soft-delete pattern. Factloom invalidates facts through bi-temporal fields, which is a different mechanism.
  - Its PRAGMA values and sqlite-vec examples are treated as claims to verify in the technology spike, not as facts.
  - The Turso, Cloudflare D1, and Python material is irrelevant to the early phases.
- No instruction to send data anywhere or to work outside the repository was found.

### zod-4

- **What it does:** Zod 4 patterns and the breaking changes from Zod 3.
- **Tools or commands:** none in the body.
- **Risk or irrelevance:** read closely because a listing rated it medium risk.
  - **Flag:** its frontmatter declares `allowed-tools: Read, Edit, Write, Glob, Grep, Bash, WebFetch, WebSearch, Task`. In Claude Code this pre-approves those tools while the skill is active. The body needs none of them. This is the likely reason for the medium rating. The file is installed unmodified; removing that line is a decision for the repository owner.
  - Several lines refer to Prowler's own files (`ui/types/formSchemas.ts`) and to React Hook Form. They do not apply.
  - Its Zod 4 API claims are verified against Zod's documentation in the technology research.

## Workflow skills: mattpocock/skills

- **Source and commit:** `mattpocock/skills` @ `5863806`. License MIT. The `pr` skill also ships its own `CREDITS.md`, which is kept.
- **Verdict:** install the whole set, as its skills call each other (for example `grill-with-docs` only invokes `grilling` and `domain-modeling`).
- **Installed:** 38 skills. One skill in the repository, `in-progress/software-factory`, was skipped by the CLI because its frontmatter failed to parse as YAML. It is not needed.
- **Name overlap:** the set includes a skill named `code-review`. Claude Code also has a built-in skill of that name. Not used in this run.

Used in this run:

| Skill | What it does | Tools or commands |
|---|---|---|
| `research` | Runs a background agent that investigates a question against primary sources and writes one cited Markdown file | Subagent, web reading, file write |
| `grill-with-docs` | Invokes `grilling` and `domain-modeling` together | None of its own |
| `grilling` | Interviews the user round by round over a tree of decisions, with a recommended answer per question | Subagents for fact-finding |
| `domain-modeling` | Maintains `GLOSSARY.md` and ADRs as terms and decisions are settled | File writes |
| `codebase-design` | Vocabulary and principles for deep modules: small interfaces, seams, adapters | None |
| `prototype` | Throwaway code that answers one design question | Writes and runs prototype code |
| `to-spec` | Turns the conversation into a spec and publishes it to the configured tracker | Tracker writes |
| `to-tickets` | Breaks a spec into vertical-slice tickets with blocking edges | Tracker writes |
| `handoff` | Writes a summary so a new session can continue | File write outside the workspace |
| `setup-matt-pocock-skills` | Records the tracker, labels, and domain-doc layout in `docs/agents/` | `gh` or `glab` when a hosted tracker is chosen |

Installed but not used in this run, with what to know before invoking them:

- `git-guardrails-claude-code` installs a hook that blocks `git push` and other git commands, optionally in `~/.claude`. It would stop the push-often rule from working.
- `setup-pre-commit` runs `npx husky init` and adds dependencies.
- `implement-spec` creates an integration branch and may open a draft pull request. This repository works on `main` only.
- `triage`, `wayfinder`, and the GitHub tracker template use `gh issue` and `gh label` commands.
- `wizard` and `diagnosing-bugs` ship shell script templates. Nothing executes them on install.

### Setup

`setup-matt-pocock-skills` is an interactive skill that asks the user three questions. It was applied with the answers this project's rules already determine, for the owner to confirm:

- **Issue tracker:** "other". Work is tracked in `docs/roadmap/`, recorded in `docs/agents/issue-tracker.md`.
- **Triage labels:** not written. The `triage` skill is not used, and the roadmap has its own status values.
- **Domain docs:** single context, recorded in `docs/agents/domain.md`.
- The `## Agent skills` block that the skill adds to `CLAUDE.md` is added when `CLAUDE.md` is created in the architecture stage.

### Conflicts with this project's rules

In each case the project's rule applies.

| Skill | What the skill says | What this project does |
|---|---|---|
| `to-tickets` | One file per ticket, `.scratch/<feature>/issues/NN-slug.md`, numbered from `01`, or one GitHub issue per ticket | Work items live inside their epic file `docs/roadmap/epics/EPIC-NN.md` with permanent `FL-NNN` identifiers |
| `to-tickets` | Ticket body is "what to build", "blocked by", and acceptance criteria | The roadmap framework requires more fields per work item: objective, scope, non-goals, functional and technical requirements, constraints, affected components, validation, completion evidence |
| `to-tickets` | Status `ready-for-agent` | Status `Pending`, `Completed`, `Blocked`, or `Under Review` |
| `to-tickets` | Every ticket is a vertical slice through all layers | Kept where it fits. Design-only items in phase 0 are not vertical slices |
| `to-spec`, `to-tickets` | No file paths or code in specs | The framework asks for affected components. Package names are given, not file paths |
| `to-spec` | Spec is a long list of user stories published as one tracker issue | The spec content is written into the epic. User stories are used only where they add information |
| `to-spec`, `to-tickets` | Ask the user to confirm seams and the ticket breakdown before publishing | Confirmation happens at the roadmap checkpoint |
| `prototype` | Commit the prototype to a throwaway branch, out of main | No branches other than `main`. Spikes live in `spikes/` |
| `prototype` | Logic prototypes are a single HTML file | Spikes here are small scripts that verify a technical claim |
| `domain-modeling` | ADRs in `docs/adr/` | ADRs in `docs/architecture/adr/` |
| `domain-modeling` | Offer an ADR only when a decision is hard to reverse, surprising, and a real trade-off | One short ADR per significant decision, including the settled ones |
| `handoff` | Save the handoff document to the OS temporary directory | A cloud session's temporary directory is lost when the VM is reclaimed, so the location must be agreed with the owner before use |

## Deferred

Not installed. To be vetted when their phase starts.

- A Postgres best-practices skill (Supabase's or Neon's): phase 4.
- `nodejs-backend-patterns` from `wshobson/agents`: phase 4, with the HTTP API.

## Things no skill asked for

None of the skills read for this report instructs the agent to send data to a third party, to read credentials, or to run commands outside the repository as part of normal use. The exceptions are opt-in and listed above: the Turso install command in the `sqlite` cloud reference, and the `~/.claude` option in `git-guardrails-claude-code`.
