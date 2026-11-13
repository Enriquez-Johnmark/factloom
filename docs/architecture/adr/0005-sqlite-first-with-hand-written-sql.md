# SQLite first, with hand-written SQL and no ORM

Status: accepted

The only storage in the early phases is one SQLite file, opened with `better-sqlite3`, with FTS5 for keyword search and `sqlite-vec` for vector distance. Postgres with pgvector comes in phase 4 as a second adapter behind the same interface. All SQL is written by hand.

A single local file needs no service to run, which matters for a tool that a coding agent starts on a developer's machine. The combination was run on Linux ([spike](../../../spikes/sqlite-vec-fts5/README.md)); on Apple Silicon it is expected to work from the published binaries but has not been run.

## Considered options

- **An ORM or query builder.** Rejected: vector distance, full-text ranking, recursive graph queries and two SQL dialects are exactly where an ORM stops helping, and the schema's rules live in triggers and checks that an ORM does not model.
- **Postgres from the start.** Rejected for the first use: it requires a running service.
- **The built-in `node:sqlite` module.** It also ran the spike. Not chosen yet because its extension loading is newer and less widely used; it remains an option that would remove a native dependency.
- **A graph database.** Rejected: the graph queries Factloom needs are one or two steps along a table of facts.

## Consequences

`sqlite-vec` is before version 1 and has had long gaps between releases. Factloom uses only its distance function on an ordinary table ([ADR 0008](0008-vector-search-on-a-plain-table.md)), so replacing it would not be a data migration.
