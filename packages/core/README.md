# @factloom/core

The innermost package. It owns the types and schemas, the `Result` type and error codes, the interfaces for storage, the LLM and embeddings, and the fact operations that change memory.

It imports no other `@factloom` package and no database, LLM, embedding or MCP library. Everything else in the workspace depends on it.

**Status:** scaffold only. The export in `src/index.ts` is a placeholder until the first work item, `FL-004`.

- Design: [`docs/architecture/INTERFACES.md`](../../docs/architecture/INTERFACES.md)
- Import rules: [`docs/architecture/SYSTEM-BOUNDARIES.md`](../../docs/architecture/SYSTEM-BOUNDARIES.md)
- Work items: [`EPIC-02`](../../docs/roadmap/epics/EPIC-02.md)
