# Decisions

The index of architecture decision records. Each record is short: what was decided, why, and what was rejected. A decision is changed by adding a new record that supersedes the old one, not by editing the old one.

| No. | Decision | Status |
|---|---|---|
| [0001](adr/0001-typescript-pnpm-monorepo-with-four-packages.md) | TypeScript in one pnpm monorepo with four packages | Accepted |
| [0002](adr/0002-built-from-scratch.md) | Built from scratch, not on an existing memory project | Accepted |
| [0003](adr/0003-dependencies-point-inward-with-manual-injection.md) | Dependencies point inward and are passed as arguments | Accepted |
| [0004](adr/0004-zod-schemas-and-result-values.md) | Zod schemas are the source of types, and failures are Result values | Accepted |
| [0005](adr/0005-sqlite-first-with-hand-written-sql.md) | SQLite first, with hand-written SQL and no ORM | Accepted |
| [0006](adr/0006-facts-change-only-by-invalidation.md) | A fact row changes only by being invalidated once | Accepted |
| [0007](adr/0007-timestamps-as-fixed-width-utc-text.md) | Timestamps are fixed-width UTC text | Accepted |
| [0008](adr/0008-vector-search-on-a-plain-table.md) | Vector search runs on an ordinary table | Accepted |
| [0009](adr/0009-one-commit-writes-everything.md) | One commit method writes facts, sources, embeddings and audit entries | Accepted |
| [0010](adr/0010-conflicts-are-keyed-by-subject-and-predicate.md) | Conflicts are keyed by subject and predicate, with specific predicates | Accepted |
| [0011](adr/0011-namespace-on-every-row.md) | Every row belongs to a namespace | Accepted |
| [0012](adr/0012-purge-is-the-one-exception.md) | Purge is the one exception to keeping everything | Accepted |
| [0013](adr/0013-claude-behind-a-one-method-interface.md) | Claude is the default LLM, behind a one-method interface | Accepted |
| [0014](adr/0014-local-embeddings-with-bge-small.md) | Local embeddings with bge-small-en-v1.5 | Accepted |
| [0015](adr/0015-toolchain.md) | TypeScript 7, Biome, and no build step in development | Accepted |
| [0016](adr/0016-mcp-stdio-server-with-five-tools.md) | A stdio MCP server with five tools | Accepted |
| [0017](adr/0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md) | Rank fusion in TypeScript, with the time filter inside each lane | Accepted |
| [0018](adr/0018-apache-2-licence.md) | Apache-2.0 licence | Accepted |

## How the research questions were settled

The research left twelve decisions open in [`OPEN-QUESTIONS.md`](../research/OPEN-QUESTIONS.md), section B. This is where each one landed.

| Question | Outcome | Record |
|---|---|---|
| D-1 Supersession key | Subject and predicate, no qualifier | 0010 |
| D-2 Time filter before or after rank fusion | Before, inside each lane | 0017 |
| D-3 Missing bounds, sentinels and time format | Missing bounds allowed, no sentinels, fixed-width text | 0007, 0008 |
| D-4 Supersession link table or column | A column, set at invalidation | 0006 |
| D-5 How `valid_to` is closed | Invalidate and insert a copy | 0006 |
| D-6 Embedding model and dimensions | `bge-small-en-v1.5`, 384 | 0014 |
| D-7 Build setup | No build step in development | 0015 |
| D-8 Lint tool | Biome | 0015 |
| D-9 Node version floor | `^22.18.0 \|\| >=24` | 0015 |
| D-10 Invalidate never delete, versus purge | Purge as a narrow exception, built in phase 2 | 0012 |
| D-11 Graph expansion in phase 1 | One step, as the third lane | 0017 |
| D-12 Outcome labels for conflict detection | Four: duplicate, succession, correction, unrelated. Confirmed or changed in phase 2 against the eval set | [`INTERFACES.md`](INTERFACES.md) |

## Proposed in research and left out

Each of these was recommended by a research document for the first schema and is deferred, because it is an added column or table and nothing uses it yet. They are listed under "Planned additions" in [`SCHEMA.md`](SCHEMA.md).

- Entity merge and alias tables: phase 3.
- Usage counters, a retrieval log and a pinned flag: phase 3.
- Line spans and span hashes on sources: when file sources are ingested.
- A qualifier in the conflict key: when a domain needs it.
- Nine entity types and fourteen predicates: the first domain starts with the few its eval scenarios use.
- A separate supersession table with four kinds: the kind is recorded in the audit log.
