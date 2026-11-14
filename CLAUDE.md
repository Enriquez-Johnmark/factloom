# Factloom

A memory layer for AI systems, in two products that share this repository.

- **Product 1, temporal graph RAG:** stores knowledge as entities and facts, records when each fact was true and when it was learned, and recalls facts filtered by time.
- **Product 2, self-correcting and self-healing memory:** keeps that knowledge true and tidy, using only the operations product 1 exposes.

The first use is memory for coding agents through an MCP server. The project is at the design stage: there is no feature code yet.

## Commands

The workspace is created in the scaffold stage. Until then only the spikes run, each from its own folder with `npm ci`.

| Command | Does |
|---|---|
| `pnpm check` | Format check, lint, type check and tests. Run it before every commit |
| `pnpm test` | Tests only |
| `pnpm format` | Rewrites files to the project format |

## Where things are

| Need | Read |
|---|---|
| What a term means | `GLOSSARY.md` |
| How the system is divided and how data flows | `docs/architecture/ARCHITECTURE.md` |
| Which package may import which | `docs/architecture/SYSTEM-BOUNDARIES.md` |
| Tables and the rules they enforce | `docs/architecture/SCHEMA.md` |
| Storage, LLM and embeddings interfaces, fact operations | `docs/architecture/INTERFACES.md` |
| MCP tools | `docs/architecture/MCP-TOOLS.md` |
| How it is tested and measured | `docs/architecture/TESTING.md` |
| Why a decision was made | `docs/architecture/DECISIONS.md` |
| Research behind the design | `docs/research/` |
| What is still unverified | `docs/research/OPEN-QUESTIONS.md` |

## Rules

The conventions are in `.claude/rules/` and are the only copy. Each loads when it applies.

| File | Applies to |
|---|---|
| `git.md` | Everything |
| `engineering-principles.md` | Everything |
| `architecture.md` | `packages/` and `apps/` |
| `typescript.md` | TypeScript files |
| `data.md` | `packages/storage/` |
| `testing.md` | Test files |

## Working here

- Use the glossary's terms exactly, in code, documents and commit messages.
- Do not state a version, an API or a command from memory. Check it, and cite where.
- Build only what the current phase needs.
- `spikes/` holds throwaway scripts that verify a claim. They are not the implementation.

## Agent skills

### Issue tracker

Work is tracked in Markdown under `docs/roadmap/`, not in GitHub Issues. That folder is created in the roadmap stage and does not exist yet. See `docs/agents/issue-tracker.md`.

### Domain docs

Single context: `GLOSSARY.md` at the root, decision records in `docs/architecture/adr/`. See `docs/agents/domain.md`.
