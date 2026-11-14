# @factloom/mcp-server

The MCP server that Claude Code and Codex start as a local process, and the composition root: the one place that names the concrete storage, LLM and embedding implementations and passes them to the use cases.

It is an application and exports nothing. Its entry point is `src/main.ts`. A tool handler only translates input, calls one use case, and translates the result.

**Status:** scaffold only. There is no server yet. Running the entry point proves that Node.js runs the workspace from source:

```sh
node apps/mcp-server/src/main.ts
```

- Design: [`docs/architecture/MCP-TOOLS.md`](../../docs/architecture/MCP-TOOLS.md)
- Work items: [`EPIC-06`](../../docs/roadmap/epics/EPIC-06.md)
