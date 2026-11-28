# Moving a set-up across after the rename

The project was called Factloom until 2026-11-27, and is now Kronomind ([ADR 0025](../../docs/architecture/adr/0025-the-project-is-named-kronomind.md)). The server, its commands, its variables and its data folder changed name with it, and the old names are not kept as aliases. A set-up made under the old name stops working until these steps are done. They keep the memory: the database file is moved, not recreated.

The commands are for macOS or Linux, in zsh or bash. Run them with every Claude Code and Codex session closed, so that no process has the database open.

## 1. Note each registration's namespace

In each repository where the server is registered, print its registration and note the value of `FACTLOOM_NAMESPACE`:

```sh
claude mcp get factloom
```

The memory of a repository is found by its namespace. Register the new server with the same value, or the facts recorded before the rename are not recalled.

## 2. Move the data folder

```sh
mv ~/.factloom ~/.kronomind
```

```sh
for file in ~/.kronomind/factloom.db*; do mv "$file" "${file/factloom.db/kronomind.db}"; done
```

The second command renames the database and, if they are there, its `-wal` and `-shm` files. The embedding model in `~/.kronomind/models` moves with the folder and is not downloaded again. If `FACTLOOM_DB` pointed elsewhere, set `KRONOMIND_DB` to that file instead.

## 3. Register the server under its new name

In each repository, remove the old registration and add the new one, with the namespace of step 1 and the path of your clone:

```sh
claude mcp remove --scope local factloom
```

```sh
claude mcp add --transport stdio --scope local kronomind --env KRONOMIND_NAMESPACE=repo:shop-api -- node /absolute/path/to/kronomind/apps/mcp-server/src/main.ts
```

`--scope` is from `claude mcp remove --help` (Claude Code 2.1.332, read on 2026-11-27); without it the command removes the server from whichever scope has it. A registration in a project's `.mcp.json` is renamed by editing the file: the server's key becomes `kronomind`, and `FACTLOOM_` becomes `KRONOMIND_` in its variables. In Codex, `[mcp_servers.factloom]` and `[mcp_servers.factloom.env]` in `~/.codex/config.toml` become `[mcp_servers.kronomind]` and `[mcp_servers.kronomind.env]`, with the variables renamed the same way.

## 4. Rename the hooks and permissions

The recall hook, the maintenance hook and any permission for the tools name the old server. List what is left:

```sh
grep -n -i factloom ~/.claude/settings.json ~/.claude.json .claude/settings.json .claude/settings.local.json 2>/dev/null
```

In each line it prints, `FACTLOOM_` becomes `KRONOMIND_`, `mcp__factloom__` becomes `mcp__kronomind__`, and `~/.factloom` becomes `~/.kronomind`. The hooks of the [registration guide](README.md) show the new form.

Claude Code may keep its configuration in another folder than `~/.claude`. The `File modified:` line that `claude mcp remove` prints in step 3 names the file it changed; if that file is, for example, `~/.claude-personal/.claude.json`, search `~/.claude-personal/settings.json` and `~/.claude-personal/.claude.json` instead. On the owner's Mac on 2026-11-28, the maintenance hook was found only there.

## 5. If the clone moved

GitHub forwards the old address of the repository. To use the new one:

```sh
git remote set-url origin https://github.com/Enriquez-Johnmark/kronomind.git
```

If you rename the folder of the clone, change the path in every registration and hook as well.

## 6. Check

Start a session in a repository and run `/mcp`: the server is listed as `kronomind`, connected, with six tools. Ask for something you recorded before the rename; `recall` finds it.
