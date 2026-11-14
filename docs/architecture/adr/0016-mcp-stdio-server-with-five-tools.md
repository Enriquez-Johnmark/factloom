# A stdio MCP server with five tools

Status: accepted

Coding agents reach Factloom through a local MCP server over stdio, built on the version 2 MCP TypeScript SDK (`@modelcontextprotocol/server`). It exposes five tools, `recall`, `remember`, `record_fact`, `invalidate_fact` and `get_fact_history`, and no resources or prompts. The server keeps no state between calls. The surface is specified in [`MCP-TOOLS.md`](../MCP-TOOLS.md).

Five is the phase 1 surface, and a deliberate limit. Phase 2 adds one tool, `give_feedback`, when feedback has something to act on it. Hosts load tool names up front and definitions on demand, and every tool is something an agent must choose between. A tool handler only translates input, calls a use case, and translates the result.

## Considered options

- **One tool per operation in `core`.** Rejected: it would give the agent `invalidate_fact` and `end_fact` and ask it to understand two time axes before it could say a fact is out of date. One tool with a `because` field asks the question in the agent's terms.
- **The version 1 SDK package.** Still maintained, but new servers and the reference servers use version 2.
- **An HTTP transport.** Phase 4, with the API.

## Consequences

The SDK major version is pinned exactly, and a smoke test starts the server on every check, because two projects studied did not start on a fresh install after an unpinned MCP dependency moved.
