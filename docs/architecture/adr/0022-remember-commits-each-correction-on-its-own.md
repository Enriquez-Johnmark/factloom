# `remember` commits each correction on its own

Status: accepted

From phase 2, one call of `remember` can make more than one commit. The facts that need no correction, new ones and restated ones, are written by one `recordFacts` call, as in phase 1. Then each **succession** is written by one `endFact` call and each **correction** by one `invalidateFact` call, each in its own commit, after the first has succeeded. Each of those commits records its own source with the text of the call, so one call leaves one source per commit, all with the same content hash.

## Why

- **A change set carries one operation.** `operation` and `reasonCode` are fields of the change set, not of each change, and fact history reads the kind of a supersession from the operation of its `fact.invalidated` entry. A succession must be recorded as `succession` and a correction as `correction`. Writing them inside the `remember` change set would record them as `remember`, and the history would no longer say which it was.
- **The operations already exist and are tested.** `endFact` and `invalidateFact` are what `changeFact` calls when an agent reports the same thing by hand ([ARCHITECTURE.md](../ARCHITECTURE.md), "Remember"). Calling them keeps one path for a succession and one for a correction, whoever decides on it.
- **Each change keeps its own guarantee.** [ADR 0009](0009-one-commit-writes-everything.md) still holds for every commit: a succession, with its ended copy, its invalidation and its successor, is one commit, and cannot be left half done. What changes is that one call of the use case is no longer one commit.

## What a caller sees when a correction fails

The plain facts are committed first. If a later commit fails with `conflict` or `already_invalidated`, because another process changed memory between the read and the write, the call still succeeds: the facts of the first commit stay recorded, and the new fact is returned in `skipped` with the stored fact in `conflictingFactIds`. Any other failure of a later commit is returned as the result of the call, and the first commit stays. Calling `remember` again with the same text is safe: the facts already recorded are restatements and gain a source.

## Alternatives rejected

- **One commit for the whole call, with a change set that holds several operations.** It would change the shape of `ChangeSet` and of every audit entry's operation, for one caller.
- **One commit under the operation `remember`.** It loses the kind of each supersession from the audit log, which fact history and the scenario runner read.
- **The corrections first, then the plain facts.** A correction would then be applied even when the plain facts fail, and the stored fact would give way to a call that otherwise wrote nothing.

## Consequences

- A call can be partly applied: new facts recorded and a succession skipped. The result says which.
- Purge must cover every source of one call. It does: `purgeContent` covers every source with the same content hash ([INTERFACES.md](../INTERFACES.md), "purgeContent").
- The sentences that stated the old rule are changed with this record: the boundary in EPIC-04, the description of `remember` in `INTERFACES.md` and in `MCP-TOOLS.md`, and the name of one test of FL-023.
