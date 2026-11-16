# @factloom/storage

The SQLite adapter for the `MemoryStore` interface in `@factloom/core`, with its SQL and its migrations. It is the only package that contains SQL.

It imports `@factloom/core` only. It enforces the rules of the schema and makes no decisions about facts.

**Status:** the SQLite adapter is complete for phase 1. `openSqliteMemoryStore` opens a file, applies the migrations, writes a change set with `commit`, and reads facts by structure, by keyword and by vector, each read with the time predicate. All four groups of the storage contract suite run against it.

- Design: [`docs/architecture/SCHEMA.md`](../../docs/architecture/SCHEMA.md)
- Rules for this package: [`.claude/rules/data.md`](../../.claude/rules/data.md)
- Work items: [`EPIC-03`](../../docs/roadmap/epics/EPIC-03.md)
