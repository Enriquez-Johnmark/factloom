# @factloom/mcp-server

The MCP server that Claude Code and Codex start as a local process, and the composition root: the one place that names the concrete storage, LLM and embedding implementations and passes them to the use cases.

It is an application and exports nothing. Its entry point is `src/main.ts`. A tool handler only translates input, calls one use case, and translates the result.

## Register the server

Claude Code and Codex each start the server as a local process over stdio. The steps below start it from a clone of this repository; nothing is published. The commands follow the "Claude Code" and "OpenAI Codex" sections of the [MCP research](../../docs/research/technical/mcp.md), which read them from each host's documentation. They have not yet been run on a Mac in either host: the owner runs them in FL-038, and this section then carries the date and the versions they were confirmed with. On 2026-11-17, on Linux with Claude Code 2.1.326 and a throwaway home directory, the `claude mcp add` command below registered the server and `claude mcp list` reported it connected, and the `.mcp.json` entry was listed as waiting for approval. No session was started and no tool was called. Codex was not available there.

**Prerequisites.** Node.js `^22.18.0 || >=24`, the range in the root `package.json` ([ADR 0015](../../docs/architecture/adr/0015-toolchain.md)). A clone of the repository, and `pnpm install` at its root. Replace `/absolute/path/to/factloom` below with the path of the clone: the guide uses absolute paths because the working directory a host starts a server in is unverified (Q-16).

**Configuration.** The server reads three variables ([`MCP-TOOLS.md`](../../docs/architecture/MCP-TOOLS.md)):

| Variable | Meaning | Default |
|---|---|---|
| `FACTLOOM_NAMESPACE` | The memory every tool call reads and writes. Use one name per repository, such as `repo:shop-api` | None. Required: the server does not start without it |
| `FACTLOOM_DB` | Path of the SQLite file | `~/.factloom/factloom.db` |
| `ANTHROPIC_API_KEY` | Key for `remember`, the one tool that calls an LLM | None. The other five tools work without it |

The first tool call that embeds a text, `record_fact`, `remember` or `recall`, downloads the embedding model from huggingface.co into `~/.factloom/models`, so it needs network access and takes longer than later calls. Never write a real key into a command or a file you commit: the examples show the variable's name only.

**Claude Code.** In the repository whose memory this is, register the server for that project only (`local` scope, stored in `~/.claude.json`):

```sh
claude mcp add --transport stdio --scope local factloom --env FACTLOOM_NAMESPACE=repo:shop-api -- node /absolute/path/to/factloom/apps/mcp-server/src/main.ts
```

The server's name comes before `--env`: `--env` takes several values, and given first it takes the name as one of them and the command fails with "Invalid environment variable format". To let `remember` work, add `--env ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY` after the first `--env`: the shell puts in the key from your environment, and Claude Code stores it in `~/.claude.json`, which is not in any repository. The equivalent entry in a project's `.mcp.json`, which is meant to be committed, takes the key from the environment Claude Code runs in and is empty when none is set:

```json
{
  "mcpServers": {
    "factloom": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/factloom/apps/mcp-server/src/main.ts"],
      "env": {
        "FACTLOOM_NAMESPACE": "repo:shop-api",
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY:-}"
      }
    }
  }
}
```

Claude Code asks before it uses a server from `.mcp.json` in an interactive session. Check the registration with `claude mcp list`, or with `/mcp` in a session, which shows the server as connected with its six tools.

**Codex.** Register the server in `~/.codex/config.toml`:

```sh
codex mcp add factloom --env FACTLOOM_NAMESPACE=repo:shop-api -- node /absolute/path/to/factloom/apps/mcp-server/src/main.ts
```

The equivalent table in `~/.codex/config.toml`. `env_vars` passes `ANTHROPIC_API_KEY` on from the environment Codex runs in, so the key is never written to the file. Codex stops a tool call after `tool_timeout_sec`, 60 seconds by default; the larger value leaves room for the model download on the first call:

```toml
[mcp_servers.factloom]
command = "node"
args = ["/absolute/path/to/factloom/apps/mcp-server/src/main.ts"]
env_vars = ["ANTHROPIC_API_KEY"]
tool_timeout_sec = 300

[mcp_servers.factloom.env]
FACTLOOM_NAMESPACE = "repo:shop-api"
```

Check the registration with `codex mcp list`, or with `/mcp` in a session.

### Subscriptions and API keys

The agent's own plan and Factloom's key are separate ([`MCP-TOOLS.md`](../../docs/architecture/MCP-TOOLS.md), "Subscriptions and API keys"). Factloom is a local process the agent starts, so the agent's plan should not change how it is registered. Only `remember` needs `ANTHROPIC_API_KEY`, and a subscription cannot stand in for it. Without a key, the agent records what it learns with `record_fact`, as the server's instructions tell it to.

| Set-up | Registered as above | Tools that work with no key of Factloom's own | Confirmed |
|---|---|---|---|
| Claude Code on a subscription | Expected (Q-79) | All but `remember` | Not yet (FL-038) |
| Claude Code on an API key | Expected (Q-79) | All but `remember` | Not yet (FL-038) |
| Codex on a subscription | Expected (Q-79) | All but `remember` | Not yet (FL-038) |
| Codex on an API key | Expected (Q-79). An OpenAI key does not serve `remember`, which calls Anthropic | All but `remember` | Not yet (FL-038) |

## Modes

`src/main.ts` reads its database and namespace from `FACTLOOM_DB` (default `~/.factloom/factloom.db`) and `FACTLOOM_NAMESPACE` (required), in every mode.

| Command | Does |
|---|---|
| `node src/main.ts` | Serves MCP over stdio: the six tools of [`MCP-TOOLS.md`](../../docs/architecture/MCP-TOOLS.md) |
| `node src/main.ts maintenance` | Runs the maintenance jobs once, prints one JSON report and exits (FL-048) |
| `node src/main.ts purge sources <fact-id>` | Lists the sources behind a fact, without their content (FL-072) |
| `node src/main.ts purge source <source-id> --reason secret_stored` | Purges one source ([ADR 0012](../../docs/architecture/adr/0012-purge-is-the-one-exception.md)) |

## Running maintenance

Factloom runs no daemon. Maintenance is the command above, started by hand, by a scheduler, or by a host's session start hook. It runs each job once, one after another, and prints the report to standard output as one JSON document: the start and end times, and for each job its name, `ok` or `failed`, and the items it examined, changed, flagged for a person, and failed on, with the identifier and reason of each flagged item. It exits with 0 when no job failed. The jobs of EPIC-09 are added to `src/maintenance-jobs.ts`.

The first job is `verify_anchored_facts` (FL-050). It reads the git repository at `FACTLOOM_REPO`, by default the working directory, at `HEAD` and never the working tree. For each fact not verified for seven days whose source is a file at a commit, it records `confirmed` when the file is unchanged since that commit, `inconclusive` when it changed, and `source_missing` when it is gone, which flags the fact for a person. It changes no fact and needs no API key. A fact from a commit that is not on the current branch is skipped. If `FACTLOOM_REPO` is not a git repository, the job fails and the command exits with 1.

The second job, `repair_moved_anchors` (FL-054), runs after it. For each fact whose file was found missing, it asks git where the file went. If the file was renamed, once or several times, the fact gains a source at the new path at `HEAD`, recorded with the reason `anchor_moved`, and a fresh verification: `confirmed` if the file is unchanged and `inconclusive` if it was also edited. The fact keeps its identifier. If git shows no rename, the fact stays flagged.

The third job, `find_duplicate_entities` (FL-053), compares the entities of the namespace within each type. Two whose names are equal once case, punctuation, spaces and Unicode compatibility forms are set aside, such as `Node.js` and `nodejs`, are merged into the one created earlier. The domain's correction policy decides whether it merges or only reports the pair. A pair whose merge someone undid is not merged again, and a merge refused because the two hold different values is reported with the facts in the way. It needs no embedding model and no API key.

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
