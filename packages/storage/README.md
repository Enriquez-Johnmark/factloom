# @factloom/storage

The SQLite adapter for the `MemoryStore` interface in `@factloom/core`, with its SQL and its migrations. It is the only package that contains SQL.

It imports `@factloom/core` only. It enforces the rules of the schema and makes no decisions about facts.

**Status:** `openSqliteMemoryStore` opens a file, applies the migrations and writes a change set with `commit`, which enforces the single-value rule and returns the documented error codes. Its read methods do not exist yet, so the storage contract suite does not run against it.

- Design: [`docs/architecture/SCHEMA.md`](../../docs/architecture/SCHEMA.md)
- Rules for this package: [`.claude/rules/data.md`](../../.claude/rules/data.md)
- Work items: [`EPIC-03`](../../docs/roadmap/epics/EPIC-03.md)
