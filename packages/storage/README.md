# @factloom/storage

The SQLite adapter for the `MemoryStore` interface in `@factloom/core`, with its SQL and its migrations. It is the only package that contains SQL.

It imports `@factloom/core` only. It enforces the rules of the schema and makes no decisions about facts.

**Status:** the first migration and the migration runner exist. The adapter itself does not yet, and the export in `src/index.ts` is still a placeholder.

- Design: [`docs/architecture/SCHEMA.md`](../../docs/architecture/SCHEMA.md)
- Rules for this package: [`.claude/rules/data.md`](../../.claude/rules/data.md)
- Work items: [`EPIC-03`](../../docs/roadmap/epics/EPIC-03.md)
