# TypeScript in one pnpm monorepo with four packages

Status: accepted

Factloom is written in TypeScript on Node.js in a single pnpm workspace. It starts with three packages, `core`, `graph-rag` and `storage`, and one app, `mcp-server`, because those are the only ones with code in the early phases. One repository keeps the two products, their shared types and their tests in step for a single developer.

## Considered options

- **A single package.** Rejected: the rule that `core` knows nothing about SQL or MCP could then only be kept by convention, not by the package manager and the type checker.
- **A package per future concern now** (maintenance, adapters, Postgres, API). Rejected: empty packages are structure with nothing in it. Each is created when its phase starts.
- **Separate repositories.** Rejected: every change to a shared type would become a release and an upgrade.
