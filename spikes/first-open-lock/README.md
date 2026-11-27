# Spike: the lock error on first open

Throwaway check for FL-087 in [EPIC-03](../../docs/roadmap/epics/EPIC-03.md). It is not the implementation.

## Question

In the owner's runs of FL-084's comparison on macOS, the maintenance hook of a first session failed to open the new database with `database is locked`, in eight of ten first sessions and then, after FL-086, in five. Outside Claude Code, and without an agent, does the same failure happen when the processes of a first session open a new database at once? If so, at which step of opening?

## How to run

From the repository root, after `pnpm install`:

```sh
node spikes/first-open-lock/run.mjs --rounds 30
```

It needs no package of its own, no LLM key and no network: it starts the app in `apps/mcp-server` as built. Each round makes a new temporary directory with a one-commit git repository, and starts at the same moment, on a new database there:

- the server, over stdio, kept open until the others have exited;
- `maintenance`, as the session start hook runs it;
- `hook recall`, with a prompt on standard input, as the prompt hook runs it.

It prints one line per round and then each open failure, by process and by the step that the error names. The temporary directories are removed at the end.

## Results

Linux x64, Node.js v22.23.4, 2026-11-27, after FL-086: 10 rounds, no process failed to open the database. This is expected: the failure has been seen only on macOS.

macOS 26.5 (Darwin 25.5.0) on the owner's MacBook Air (Apple M1), Node.js v26.13.1, 2026-11-27, after FL-086 and before FL-087's fix: 30 rounds, 12 of the 90 processes failed, in 10 rounds, each with `database is locked, while setting the journal mode to WAL`: the server 6 times, maintenance 4 and the recall hook 2. No other step and no migration failed. So the failure needs no agent, and it is the `journal_mode = WAL` statement on a new file, which reports busy at once instead of waiting for the busy timeout.
