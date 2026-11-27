# The project is named Kronomind

Status: accepted.

The project, first named Factloom, is named Kronomind (KRO-no-mind) from 2026-11-27: the repository, the packages (`@kronomind/*`), the MCP server and its tools (`mcp__kronomind__*`), the commands, the variables (`KRONOMIND_NAMESPACE`, `KRONOMIND_DB`, `KRONOMIND_REPO`, `KRONOMIND_ARCHIVE_AFTER_DAYS`), the data folder (`~/.kronomind`) and the living documents. Records of what was done under the old name keep it.

## Why

- **The old name is hard to say.** The owner found "Factloom" hard to say clearly, and its first syllable can be heard as an offensive word.
- **The new name says what the project is.** *Krono*, time, for the two time axes of every fact; *mind*, memory, which keeps itself correct. It covers both products: temporal graph RAG and self-correcting, self-healing memory.
- **It was free.** On 2026-11-27 no npm package, GitHub repository or GitHub account named Kronomind was found (FL-085).

## Alternatives rejected

- **Truelink, Chronolink, Truetime and Timelink.** Each had an existing npm package, GitHub account or product on 2026-11-27.
- **A Tagalog name.** The owner asked for an English one.
- **Keeping Factloom.** The reason above stands for as long as the name is said aloud.
- **Keeping the old variables as aliases.** The owner is the one user. A guide moves the set-up across, so the code does not carry two names.

## What keeps the old name

A record is kept as it was written, so that it still describes what was run:

- the committed results and reports of the agent comparisons, `apps/mcp-server/evals/agent-comparison/results/`;
- the released migrations, which are never edited and whose hashes are recorded in every database ([`data.md`](../../../.claude/rules/data.md));
- the decision records, ADR 0001 to 0024, and this one, which must name the old name;
- the epic files and the index generated from them, `docs/roadmap/`, whose work items and recorded evidence were written under the old name;
- the research, `docs/research/`, whose findings carry their sources and dates;
- the spikes, `spikes/`, throwaway scripts that ran under the old name;
- the guide that moves a set-up across, and one sentence of the README that says what the project was called.

A script run by `pnpm check` finds every use of the old name, in any letter case, outside these.

## Consequences

- An existing set-up stops working until it is moved across: the server is registered under the new name, the hooks call the new commands, and `~/.factloom` is moved to `~/.kronomind`, with `factloom.db` renamed `kronomind.db`, so that the memory is kept.
- The GitHub repository is renamed by the owner; GitHub forwards the old address.
- Trademarks, domains and social handles were not checked.
