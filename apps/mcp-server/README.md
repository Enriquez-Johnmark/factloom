# @factloom/mcp-server

The MCP server that Claude Code and Codex start as a local process, and the composition root: the one place that names the concrete storage, LLM and embedding implementations and passes them to the use cases.

It is an application and exports nothing. Its entry point is `src/main.ts`. A tool handler only translates input, calls one use case, and translates the result.

## Modes

`src/main.ts` reads its database and namespace from `FACTLOOM_DB` (default `~/.factloom/factloom.db`) and `FACTLOOM_NAMESPACE` (required), in every mode.

| Command | Does |
|---|---|
| `node src/main.ts` | Serves MCP over stdio: the six tools of [`MCP-TOOLS.md`](../../docs/architecture/MCP-TOOLS.md) |
| `node src/main.ts maintenance` | Runs the maintenance jobs once, prints one JSON report and exits (FL-048) |
| `node src/main.ts purge sources <fact-id>` | Lists the sources behind a fact, without their content (FL-072) |
| `node src/main.ts purge source <source-id> --reason secret_stored` | Purges one source ([ADR 0012](../../docs/architecture/adr/0012-purge-is-the-one-exception.md)) |

## Running maintenance

Factloom runs no daemon. Maintenance is the command above, started by hand, by a scheduler, or by a host's session start hook. It runs each job once, one after another, and prints the report to standard output as one JSON document: the start and end times, and for each job its name, `ok` or `failed`, and the items it examined, changed, flagged for a person, and failed on. It exits with 0 when no job failed. No job exists yet; the jobs of EPIC-09 are added to `src/maintenance-jobs.ts`.

By hand, from `apps/mcp-server`:

```sh
FACTLOOM_NAMESPACE=repo:shop-api node src/main.ts maintenance
```

Both hosts add what a session start hook prints to standard output to the session's context. The examples below therefore write the report to a file, so that it does not fill the agent's context on every session. Replace the path to Factloom and the namespace with yours.

**Claude Code.** A `SessionStart` hook, in the repository's `.claude/settings.json` or in `~/.claude/settings.json`. The event, the matcher values (`startup`, `resume`, `clear`, `compact`, `fork`), the `type` and `command` fields, the `timeout` in seconds (default 600), and "Claude Code adds plain-text stdout as context" are from https://code.claude.com/docs/en/hooks, read on 2026-11-17. Where the settings files go was read only as a summary of that page, so it is **likely**, not confirmed.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "FACTLOOM_NAMESPACE=repo:shop-api node /path/to/factloom/apps/mcp-server/src/main.ts maintenance > ~/.factloom/last-maintenance.json",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

**Codex.** A `SessionStart` hook, in `~/.codex/hooks.json` or a trusted repository's `.codex/hooks.json`. Codex runs a hook only after it has been reviewed and trusted with `/hooks`. The event, the matcher values, the file locations, the trust rule, the `timeout` in seconds (default 600) and "Plain text on `stdout` is added as extra developer context" are from https://learn.chatgpt.com/docs/hooks, to which https://developers.openai.com/codex/hooks redirects, read on 2026-11-17.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "FACTLOOM_NAMESPACE=repo:shop-api node /path/to/factloom/apps/mcp-server/src/main.ts maintenance > ~/.factloom/last-maintenance.json",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

Neither hook has been run yet. The owner runs each once on the Mac and records the report in FL-048.

- Design: [`docs/architecture/MCP-TOOLS.md`](../../docs/architecture/MCP-TOOLS.md)
- Work items: [`EPIC-06`](../../docs/roadmap/epics/EPIC-06.md), [`EPIC-08`](../../docs/roadmap/epics/EPIC-08.md), [`EPIC-09`](../../docs/roadmap/epics/EPIC-09.md)
