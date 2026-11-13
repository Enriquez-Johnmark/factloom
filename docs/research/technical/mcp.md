# MCP: TypeScript SDK, specification, and registration in Claude Code and Codex

Accessed: 2026-11-13.

Versions were read from the npm registry on 2026-11-13. SDK facts come from the
`modelcontextprotocol/typescript-sdk` repository (`main` at commit 919bb8e, dated 2026-11-10,
cloned read-only) and from running the SDK in this session (Linux x64, Node.js v22.23.4).

## Question

Which MCP TypeScript SDK packages and version should the Factloom MCP server use, which parts of
the current MCP specification matter for a memory server, and how do Claude Code and OpenAI Codex
start a local stdio server?

## Findings

### The SDK: what is true today

An installed skill claimed that the SDK moved to "v2" split packages, that the monolithic package
is retired, that Zod 4.2 or later is required, and that the API is `registerTool(name, {description,
inputSchema}, handler)` with stdio at `@modelcontextprotocol/server/stdio`. Checked claim by claim:

| Claim | Verdict | Evidence |
| --- | --- | --- |
| The SDK is split into `@modelcontextprotocol/server`, `/client`, `/node`, `/core` | **confirmed** | npm: `server` 2.4.0, `client` 2.4.0, `core` 2.4.0 (all published 2026-10-23), `node` 2.1.2. The README on `main` says: "This is the `main` branch: v2 of the SDK ... the stable release line". Nine packages are published in total (docs/get-started/packages.md). |
| v2 is stable, not a pre-release | **confirmed** | 2.0.0 was published 2026-07-27 after alphas (from 2026-04-01) and betas (from 2026-06-30). `latest` points at 2.4.0. |
| The monolithic `@modelcontextprotocol/sdk` is retired | **partly true** | It is not deprecated on npm (`npm view @modelcontextprotocol/sdk deprecated` is empty) and still receives releases: 1.32.2 was published 2026-10-23. The README says v1.x "continues to receive bug fixes and security updates for at least six months after the v2 release (2026-07-27)", which means at least until late January 2027. It is the previous line, in maintenance. |
| Zod 4.2 or later is required | **confirmed** | `@modelcontextprotocol/server@2.4.0` depends on `zod: ^4.2.0`. The README adds that tool schemas accept any Standard Schema library (Zod 4, Valibot, ArkType). |
| `registerTool(name, {description, inputSchema: z.object(...)}, handler)` | **confirmed** | docs/servers/tools.md; ran it. |
| stdio transport at `@modelcontextprotocol/server/stdio` | **confirmed** | The subpath exports `serveStdio` and `StdioServerTransport` (docs/get-started/packages.md); ran it. |

Sources: `npm view <pkg> version dist-tags time dependencies`;
https://github.com/modelcontextprotocol/typescript-sdk (README.md and docs/ on `main`).

Other facts about v2 (all **confirmed** from the same sources):

- The packages are ES modules with a CommonJS build as well, and require Node.js 20 or later.
- `@modelcontextprotocol/server` is the only package a stdio server installs. `core` arrives as its
  dependency. `@modelcontextprotocol/node` is an adapter for serving over Node's `http` module and
  is needed only for the later HTTP API.
- The documented entry point for stdio is `serveStdio(createServer)`, where `createServer` returns
  a new `McpServer`. `server.connect(new StdioServerTransport())` is the older form and serves only
  the 2025 protocol era.
- The SDK validates tool arguments against `inputSchema` before the handler runs and validates
  `structuredContent` against `outputSchema` before the result leaves the server.
- A handler that throws is converted into a result with `isError: true`.
- `new McpServer(info, { instructions })` sets the server instructions string (ran it).

Which line Factloom should use: **v2, `@modelcontextprotocol/server@2.4.0`.** It is the stable
line, it is where the documentation lives, it matches the settled choice of Zod 4, and v1 has a
stated maintenance horizon.

### Proof: a minimal stdio server and two clients

Run in the scratchpad with `@modelcontextprotocol/server@2.4.0`, `@modelcontextprotocol/client@2.4.0`
and `zod@4.6.7`, executed by Node.js directly from `.ts` files. Both files also type-check with
TypeScript 7.0.2 under `strict`, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.

`server.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod";

const facts = [
  { id: "f1", text: "Factloom uses pnpm", validFrom: "2026-11-01T00:00:00Z" },
  { id: "f2", text: "Factloom stores facts in SQLite", validFrom: "2026-11-02T00:00:00Z" },
];

function createServer(): McpServer {
  const server = new McpServer({ name: "factloom-proof", version: "0.0.0" });

  server.registerTool(
    "search_facts",
    {
      title: "Search facts",
      description: "Search stored facts by substring. Returns matching facts with their validity start.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Substring to look for in fact text"),
        limit: z.number().int().min(1).max(20).optional().describe("Maximum results, default 5"),
      }),
      outputSchema: z.object({
        facts: z.array(z.object({ id: z.string(), text: z.string(), validFrom: z.string() })),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, limit }) => {
      if (query === "boom") {
        return { content: [{ type: "text", text: "Storage unavailable; retry later." }], isError: true };
      }
      const hits = facts.filter((f) => f.text.toLowerCase().includes(query.toLowerCase())).slice(0, limit ?? 5);
      const output = { facts: hits };
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  return server;
}

void serveStdio(createServer);
console.error("factloom-proof MCP server running on stdio");
```

`client-raw.mjs` uses no SDK. It spawns the server and writes newline-delimited JSON-RPC, which
shows the wire messages for `initialize`, `tools/list` and `tools/call`:

```js
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const child = spawn(process.execPath, ["server.ts"], { stdio: ["pipe", "pipe", "inherit"] });
const pending = new Map();
createInterface({ input: child.stdout }).on("line", (line) => {
  const msg = JSON.parse(line);
  console.log("<-", line);
  pending.get(msg.id)?.(msg);
});
let id = 0;
function request(method, params) {
  const msg = { jsonrpc: "2.0", id: ++id, method, params };
  console.log("->", JSON.stringify(msg));
  child.stdin.write(`${JSON.stringify(msg)}\n`);
  return new Promise((resolve) => pending.set(msg.id, resolve));
}
function notify(method) {
  const msg = { jsonrpc: "2.0", method };
  console.log("->", JSON.stringify(msg));
  child.stdin.write(`${JSON.stringify(msg)}\n`);
}
await request("initialize", {
  protocolVersion: "2025-11-25",
  capabilities: {},
  clientInfo: { name: "raw-client", version: "0.0.0" },
});
notify("notifications/initialized");
await request("tools/list", {});
await request("tools/call", { name: "search_facts", arguments: { query: "pnpm", limit: 1 } });
child.stdin.end();
```

Output of `node client-raw.mjs` (complete, exit code 0):

```text
-> {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"raw-client","version":"0.0.0"}}}
factloom-proof MCP server running on stdio
<- {"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"factloom-proof","version":"0.0.0"}},"jsonrpc":"2.0","id":1}
-> {"jsonrpc":"2.0","method":"notifications/initialized"}
-> {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
<- {"result":{"tools":[{"name":"search_facts","title":"Search facts","description":"Search stored facts by substring. Returns matching facts with their validity start.","inputSchema":{"type":"object","$schema":"https://json-schema.org/draft/2020-12/schema","properties":{"query":{"type":"string","minLength":1,"description":"Substring to look for in fact text"},"limit":{"description":"Maximum results, default 5","type":"integer","minimum":1,"maximum":20}},"required":["query"]},"annotations":{"readOnlyHint":true,"openWorldHint":false},"outputSchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"facts":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"text":{"type":"string"},"validFrom":{"type":"string"}},"required":["id","text","validFrom"],"additionalProperties":false}}},"required":["facts"],"additionalProperties":false}}]},"jsonrpc":"2.0","id":2}
-> {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_facts","arguments":{"query":"pnpm","limit":1}}}
<- {"result":{"content":[{"type":"text","text":"{\"facts\":[{\"id\":\"f1\",\"text\":\"Factloom uses pnpm\",\"validFrom\":\"2026-11-01T00:00:00Z\"}]}"}],"structuredContent":{"facts":[{"id":"f1","text":"Factloom uses pnpm","validFrom":"2026-11-01T00:00:00Z"}]}},"jsonrpc":"2.0","id":3}
```

`client-sdk.ts` does the same through the SDK client and also exercises the error paths:

```ts
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const mode = process.argv[2] === "auto" ? "auto" : "legacy";
const client = new Client({ name: "proof-client", version: "0.0.0" }, { versionNegotiation: { mode } });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ["server.ts"] }));
console.log("era:", client.getProtocolEra(), "| server:", JSON.stringify(client.getServerVersion()));
const { tools } = await client.listTools();
console.log("tools/list:", JSON.stringify(tools, null, 2));
const ok = await client.callTool({ name: "search_facts", arguments: { query: "sqlite" } });
console.log("tools/call ok:", JSON.stringify(ok));
const bad = await client.callTool({ name: "search_facts", arguments: { query: "" } });
console.log("tools/call invalid args:", JSON.stringify(bad));
const err = await client.callTool({ name: "search_facts", arguments: { query: "boom" } });
console.log("tools/call handler isError:", JSON.stringify(err));
try {
  await client.callTool({ name: "no_such_tool", arguments: {} });
} catch (e) {
  console.log("unknown tool ->", (e as Error).constructor.name, (e as { code?: unknown }).code, (e as Error).message);
}
await client.close();
```

Output of `node client-sdk.ts` (the `tools/list` block is the same schema as above and is omitted):

```text
factloom-proof MCP server running on stdio
era: legacy | server: {"name":"factloom-proof","version":"0.0.0"}
tools/call ok: {"content":[{"type":"text","text":"{\"facts\":[{\"id\":\"f2\",\"text\":\"Factloom stores facts in SQLite\",\"validFrom\":\"2026-11-02T00:00:00Z\"}]}"}],"structuredContent":{"facts":[{"id":"f2","text":"Factloom stores facts in SQLite","validFrom":"2026-11-02T00:00:00Z"}]}}
tools/call invalid args: {"content":[{"type":"text","text":"Input validation error: Invalid arguments for tool search_facts: query: Too small: expected string to have >=1 characters"}],"isError":true}
tools/call handler isError: {"content":[{"type":"text","text":"Storage unavailable; retry later."}],"isError":true}
unknown tool -> ProtocolError -32602 Tool no_such_tool not found
```

`node client-sdk.ts auto` printed `era: modern`: the same server also answers the 2026-07-28
handshake. A raw `server/discover` request returned
`{"supportedVersions":["2026-07-28"],"capabilities":{"tools":{"listChanged":true}},"resultType":"complete",...}`.

All of the above: **confirmed**, ran it.

### Specification

- Current revision: **2026-07-28**. The previous revision is 2025-11-25. **confirmed.** Source:
  https://modelcontextprotocol.io/specification/2026-07-28/changelog.
- The main change in 2026-07-28 is that the protocol became stateless: the `initialize` handshake
  and protocol-level sessions are removed, every request carries its protocol version and client
  capabilities in `_meta`, and servers must implement `server/discover`. `ping` and
  `logging/setLevel` are removed. Roots, Sampling and Logging are deprecated, with a minimum
  twelve-month window; the changelog's suggested replacement for logging on stdio is to log to
  stderr. **confirmed** (same source).
- The SDK names the two behaviours "eras": `legacy` (2024-10-07 to 2025-11-25, with `initialize`)
  and `modern` (2026-07-28). `serveStdio` serves both from one process unless told otherwise.
  **confirmed** (docs/protocol-versions.md; ran both).

Features relevant to a memory server (source for all:
https://modelcontextprotocol.io/specification/2026-07-28/server/tools, **confirmed**):

| Feature | What the specification says | Use in phase 1 |
| --- | --- | --- |
| Tools | Model-controlled. Defined by `name`, optional `title`, `description`, `inputSchema`, optional `outputSchema`, optional `annotations`. Names should be 1 to 128 characters from `A-Z a-z 0-9 _ - .`. Servers should return tools in a deterministic order. | Yes. This is the whole interface. |
| Structured output | `structuredContent` holds a JSON value that must conform to `outputSchema` when one is declared. For backwards compatibility the server should also return the serialized JSON in a text block. | Yes. Return both, as the proof does. |
| Annotations | Optional properties describing tool behaviour. Clients must treat them as untrusted unless the server is trusted. The SDK documents `readOnlyHint`, `destructiveHint` and `idempotentHint` (docs/servers/tools.md) and its types also accept `openWorldHint` (compiled and ran). They do not change execution. | Yes. Mark search tools `readOnlyHint: true`; a host can use that to skip a confirmation. |
| Tool execution errors | A normal result with `isError: true`. Meant for failures the model can act on: input validation errors, API failures, business logic errors. Clients should pass them to the model. | Yes. Put the recovery hint in the text. |
| Protocol errors | A JSON-RPC error. For unknown tools, malformed requests and server errors. The model may never see them. | Left to the SDK. |
| State across calls | There is no session. A server that needs state returns an explicit handle and accepts it as an argument. | Fits: facts and entities already have ids. |
| Resources and prompts | Separate features with their own list and read methods. | Not needed. See below. |

Resources and prompts in phase 1: **not needed.** A coding agent reaches memory by calling tools.
Claude Code does surface resources (through `@` mentions) and prompts (as slash commands), but
both are started by the user, not by the model (**confirmed**:
https://code.claude.com/docs/en/mcp). They can be added later without changing the tools.

### Claude Code

Source for this section: https://code.claude.com/docs/en/mcp. **confirmed** from the
documentation; not run, because this session has no interactive Claude Code to register a server
in.

- Command: `claude mcp add [options] <name> -- <command> [args...]`. Options: `--transport`
  (`stdio` here), `--scope` (`local`, `project` or `user`), `--env KEY=value`. Everything after
  `--` is the server command.
- Scopes: `local` (default; this project only, private, stored in `~/.claude.json`), `project`
  (stored in `.mcp.json` at the project root, meant to be committed), `user` (all projects, stored
  in `~/.claude.json`).
- `.mcp.json` supports `${VAR}` and `${VAR:-default}` in `command`, `args`, `env`, `url` and
  `headers`. An unset variable with no default is left as literal text and `claude mcp list` warns.
- Claude Code sets `CLAUDE_PROJECT_DIR` in the spawned server's environment. Inside `.mcp.json`,
  `command` and `args` must write it with a default: `${CLAUDE_PROJECT_DIR:-.}`.
- Approval: in interactive sessions Claude Code asks before using project-scoped servers from
  `.mcp.json`. `claude mcp reset-project-choices` clears the answers. In `claude -p` and SDK
  sessions the prompt cannot be shown and project servers load without it.
- Other commands: `claude mcp list`, `claude mcp get <name>`, `claude mcp remove <name>`,
  `claude mcp add-json <name> '<json>'`; `/mcp` inside a session shows status and tools.
- Tools appear to the model as `mcp__<server>__<tool>`. A tool whose full name exceeds 128
  characters is left out.

Command for Factloom (project scope, run from the repository root):

```sh
claude mcp add --transport stdio --scope project factloom -- node apps/mcp-server/dist/main.js
```

Equivalent `.mcp.json` at the repository root:

```json
{
  "mcpServers": {
    "factloom": {
      "type": "stdio",
      "command": "node",
      "args": ["${CLAUDE_PROJECT_DIR:-.}/apps/mcp-server/dist/main.js"],
      "env": {
        "FACTLOOM_DB": "${FACTLOOM_DB:-.factloom/memory.db}"
      }
    }
  }
}
```

`FACTLOOM_DB` is a placeholder name for whatever setting the server ends up reading; it is not an
existing variable. The `args` form with `${CLAUDE_PROJECT_DIR:-.}` avoids depending on the working
directory the server is started in.

### OpenAI Codex

Sources: https://learn.chatgpt.com/docs/extend/mcp?surface=cli (the address
`developers.openai.com/codex/mcp` redirects there) and the `openai/codex` repository at commit
69231e1 (2026-11-13): `codex-rs/cli/src/mcp_cmd.rs`, `codex-rs/config/src/loader/README.md`.
**confirmed** from documentation and source; not run.

- Command: `codex mcp add <server-name> --env VAR=VALUE -- <stdio server-command>`. The source
  comment states that `add` writes the entry to `~/.codex/config.toml`. Other subcommands: `list`,
  `get`, `remove`, `login`, `logout`. `/mcp` in the terminal UI lists active servers.
- Configuration: one `[mcp_servers.<name>]` table per server. Keys for stdio: `command`
  (required), `args`, `env`, `env_vars` (names of variables to forward), `cwd`,
  `startup_timeout_sec` (default 10), `tool_timeout_sec` (default 60), `enabled`, `required`,
  `enabled_tools`, `disabled_tools`.
- Project-level configuration exists: `.codex/config.toml` in the repository, applied only for
  trusted projects. In the loader's precedence list the project layer overrides the user layer.

Command:

```sh
codex mcp add factloom -- node /absolute/path/to/factloom/apps/mcp-server/dist/main.js
```

User configuration, `~/.codex/config.toml`:

```toml
[mcp_servers.factloom]
command = "node"
args = ["/absolute/path/to/factloom/apps/mcp-server/dist/main.js"]
startup_timeout_sec = 10
tool_timeout_sec = 60

[mcp_servers.factloom.env]
FACTLOOM_DB = "/absolute/path/to/factloom/.factloom/memory.db"
```

Project configuration, `.codex/config.toml` in a trusted repository:

```toml
[mcp_servers.factloom]
command = "node"
args = ["apps/mcp-server/dist/main.js"]
```

The relative path in the project form assumes Codex starts the server in the project root. The
documentation read today does not state the default working directory, so this form is **likely**,
not confirmed; `cwd` or an absolute path removes the doubt.

### Practical constraints

- **stdout carries only protocol messages.** On stdio the host parses every stdout line as
  JSON-RPC; one `console.log` from the server or a dependency breaks the connection. Log with
  `console.error`. **confirmed** (typescript-sdk docs/troubleshooting.md and
  docs/get-started/first-server.md). The proof server's banner goes to stderr and the raw client
  parsed every stdout line as JSON without error.
- **Time limits.** Codex: 10 s to start and 60 s per tool call by default. Claude Code: start-up
  limit set by `MCP_TIMEOUT`; a per-server `"timeout"` field in milliseconds limits tool calls.
  **confirmed** (sources above). Opening a SQLite file is fast; a tool that calls an LLM (for
  example extraction during a write) can exceed 60 s and should return before the LLM work is done
  or be given a larger timeout.
- **Result size in Claude Code.** A warning appears when a tool result exceeds 10,000 tokens; the
  default limit is 25,000 tokens (`MAX_MCP_OUTPUT_TOKENS`). **confirmed.** Search tools need a
  `limit` argument and compact results.
- **How Claude Code decides to call a tool.** With tool search, which is on by default, only tool
  names and the server instructions are loaded at session start; full definitions are fetched when
  Claude searches for them. Server instructions and the description of a tool loaded up front are
  cut at 4,096 characters; a description loaded through tool search is cut at 16,384. The
  documentation advises that instructions say what category of tasks the tools handle and when to
  search for them, with key words near the start. A server entry can set `"alwaysLoad": true` to
  keep its tools in context on every turn. **confirmed.**
- **Tool count.** Claude Code states no fixed per-server cap; the limit is context budget.
  **confirmed.** No Codex guidance on tool count was found today (**unverified**).
- **In other hosts** the model chooses from each tool's name, description and input schema
  (typescript-sdk docs/get-started/real-host.md). **confirmed.** Nothing forces an agent to
  consult memory. Names and descriptions that state when to use the tool, plus a line in the
  project's `CLAUDE.md` or `AGENTS.md`, are the available levers (**likely**; standard practice,
  not measured here).
- **Schema size.** Ran it: `z.iso.datetime()` and `z.uuid()` each add a regular expression of
  several hundred characters as `pattern` in the JSON Schema that `tools/list` sends. In tool
  input schemas a plain `z.string().describe("ISO 8601 UTC timestamp")`, checked inside the
  handler, keeps the listing small.

## What it means for Factloom

- Depend on `@modelcontextprotocol/server@2.4.0` and `zod@4.6.7` in `apps/mcp-server`. Do not use
  `@modelcontextprotocol/sdk`.
- Use `serveStdio(createServer)`; it serves both protocol eras, so older and newer hosts connect
  without extra work. Do not rely on a session or on `initialize` having happened: every tool call
  must be self-contained. This matches the bi-temporal design, where every query carries its own
  "as of" time.
- Phase 1 is tools only. Give each tool an `inputSchema`, an `outputSchema`, a `readOnlyHint`
  where true, and return both `structuredContent` and the same JSON as text.
- Report recoverable failures with `isError: true` and a message that says what to try next. Let
  the SDK produce protocol errors.
- Set server `instructions` to one or two sentences that say what the memory holds and when to
  search it, with the important words first.
- Keep the tool list short and stable in order. A handful of tools (search, record, correct, fetch
  by id) fits every limit found.
- Never write to stdout. Route all logging through one stderr logger from the first commit.
- Use the `FACTLOOM_DB`-style setting only as an example; the storage research decides the real
  configuration surface.
- For a test client in the repository's own tests, use `@modelcontextprotocol/client@2.4.0` as a
  dev dependency, or the in-memory client wiring described in the SDK's docs/testing.md.

## Open questions

- **unverified:** the registration snippets for Claude Code and Codex were written from
  documentation and not executed. First check on the Mac: `claude mcp add ...` then `/mcp`, and
  `codex mcp add ...` then `/mcp`.
- **unverified:** which protocol era Claude Code and Codex use today when they connect to a stdio
  server. It does not affect the server, since `serveStdio` answers both.
- **unverified:** the default working directory of a stdio server started from a project
  `.codex/config.toml`, and from `.mcp.json` when `args` is relative. Use absolute paths or
  `${CLAUDE_PROJECT_DIR:-.}` until checked.
- **unverified:** whether Codex truncates tool descriptions or defers tool loading. No statement
  was found in the pages read today.
- **unverified:** how reliably agents call memory tools without being told to. This needs an
  experiment with a real agent once the server exists; it cannot be settled from documentation.
- The v1 line's support window ("at least six months after the v2 release") is a minimum. It is not
  a reason to choose v1, but anyone reading older tutorials should expect v1 import paths such as
  `@modelcontextprotocol/sdk/server/mcp.js`, which do not exist in v2.
