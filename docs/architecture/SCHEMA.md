# Schema

The database schema for SQLite, the rules it enforces, and how it will differ in Postgres.

Terms in bold are defined in [`GLOSSARY.md`](../../GLOSSARY.md). The DDL below was run, with the checks listed in [`spikes/fact-schema`](../../spikes/fact-schema/README.md), on 2026-11-13 (SQLite 3.54.1, Linux). It has not been run on macOS.

## Rules the schema enforces

1. **Two time axes on every fact.** `valid_from` and `valid_to` hold **valid time**. `created_at` and `invalidated_at` hold **recorded time**. Both periods are half-open: the start is included, the end is not.
2. **Missing means unknown or open.** A missing `valid_from` means the start is not known. A missing `valid_to` means no end is known. There are no sentinel dates.
3. **One timestamp format.** Every timestamp is UTC text, `YYYY-MM-DDTHH:MM:SS.sssZ`, which is what JavaScript's `toISOString()` produces. A `CHECK` on each column rejects anything else, because mixed formats sort wrongly as text ([research](../research/technical/bi-temporal-modelling.md)).
4. **A fact row changes once, at most.** The only permitted change is an **invalidation**: `invalidated_at` goes from missing to a timestamp, and `superseded_by_fact_id` may be set in the same change. A trigger rejects every other update and every delete.
5. **Every fact has a source.** `fact_source` links each fact to one or more sources. The write path refuses a fact with none.
6. **Every change has an audit entry.** `audit_log` gets one row per row changed. Its rows hold identifiers and reasons, never fact or source text, so that a later **purge** can remove content without touching the log.
7. **Everything belongs to a namespace.** Every table that holds memory has a `namespace` column, and every query filters on it.

## How each change is written

Because a fact row never changes except to be invalidated, anything that looks like an edit is an invalidation plus a new row.

| Change | Rows written |
|---|---|
| Record a new fact | Insert the fact, its source link and its embedding |
| **Revision** (end a fact, or change its confidence) | Insert a copy carrying the change. Invalidate the original and link it to the copy |
| **Succession** (the world changed) | Revise the old fact so its `valid_to` is the moment of change. Insert the new fact with that moment as `valid_from` |
| **Correction** (the old fact was wrong) | Insert the right fact. Invalidate the wrong one and link it to the right one |
| **Retraction** | Invalidate the fact. No link |

Each of these is one database transaction and writes one audit entry per row inserted or invalidated, all sharing one `operation_id`.

Example: on 2026-04-02 Factloom learns that PostgreSQL was upgraded from 14 to 16 on 2026-03-15.

| id | value | valid_from | valid_to | created_at | invalidated_at | superseded_by |
|---|---|---|---|---|---|---|
| `pg14` | PostgreSQL 14 | 2025-06-01 | | 2026-01-10 | 2026-04-02 | `pg14-ended` |
| `pg14-ended` | PostgreSQL 14 | 2025-06-01 | 2026-03-15 | 2026-04-02 | | |
| `pg16` | PostgreSQL 16 | 2026-03-15 | | 2026-04-02 | | |

`pg14-ended` is an **ended fact**: a live belief about the past. Asked "what is true now", Factloom returns `pg16`. Asked "what was true on 2026-02-01", it returns `pg14-ended`. Asked "what did you believe on 2026-04-01", it returns `pg14`, because the upgrade had not been recorded yet.

## The time predicate

Every read that returns facts applies the same four conditions. `:valid_at` is the **as-of date** and `:known_at` is the **known-at date**; both default to now.

```sql
    f.created_at <= :known_at
AND (f.invalidated_at IS NULL OR f.invalidated_at > :known_at)
AND (f.valid_from IS NULL OR f.valid_from <= :valid_at)
AND (f.valid_to   IS NULL OR f.valid_to   >  :valid_at)
```

This is the whole of time handling at query time. It is applied inside each **retrieval lane**, not after **rank fusion**, so a lane never spends its result limit on facts that the filter would drop.

## Tables

```sql
CREATE TABLE entity (
  id          TEXT PRIMARY KEY,
  namespace   TEXT NOT NULL,
  type        TEXT NOT NULL,
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL,  -- normalised name, used for exact matching
  created_at  TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  UNIQUE (namespace, type, name_key)
) STRICT;

CREATE TABLE source (
  id            TEXT PRIMARY KEY,
  namespace     TEXT NOT NULL,
  kind          TEXT NOT NULL,  -- for example 'agent_note', 'conversation', 'file'
  locator       TEXT,           -- where it is: a path, a URL, an identifier
  version       TEXT,           -- which version: for a file in git, the commit
  content       TEXT,           -- the text the facts were taken from, when kept
  content_hash  TEXT,           -- SHA-256 of the content, hex
  observed_at   TEXT NOT NULL CHECK (observed_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  created_at    TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z')
) STRICT;

CREATE TABLE fact (
  id                     TEXT PRIMARY KEY,
  namespace              TEXT NOT NULL,
  subject_entity_id      TEXT NOT NULL REFERENCES entity (id),
  predicate              TEXT NOT NULL,
  object_entity_id       TEXT REFERENCES entity (id),
  object_value           TEXT,
  statement              TEXT NOT NULL,
  confidence             REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  valid_from             TEXT CHECK (valid_from IS NULL OR valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  valid_to               TEXT CHECK (valid_to IS NULL OR valid_to GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  created_at             TEXT NOT NULL CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  invalidated_at         TEXT CHECK (invalidated_at IS NULL OR invalidated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  superseded_by_fact_id  TEXT REFERENCES fact (id),
  CHECK ((object_entity_id IS NULL) <> (object_value IS NULL)),
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from < valid_to),
  CHECK (invalidated_at IS NULL OR invalidated_at >= created_at),
  CHECK (superseded_by_fact_id IS NULL OR invalidated_at IS NOT NULL)
) STRICT;

-- Conflict candidates and fact history: the facts for one subject and predicate.
CREATE INDEX fact_subject_predicate ON fact (namespace, subject_entity_id, predicate);
-- Graph lane: facts that point at an entity.
CREATE INDEX fact_object_entity ON fact (namespace, object_entity_id) WHERE object_entity_id IS NOT NULL;

-- Facts are never deleted, and the only change is one invalidation.
CREATE TRIGGER fact_never_deleted BEFORE DELETE ON fact
BEGIN
  SELECT RAISE(ABORT, 'facts are never deleted');
END;

CREATE TRIGGER fact_changes_only_by_invalidation BEFORE UPDATE ON fact
WHEN NOT (
      OLD.invalidated_at IS NULL AND NEW.invalidated_at IS NOT NULL
  AND NEW.id IS OLD.id
  AND NEW.namespace IS OLD.namespace
  AND NEW.subject_entity_id IS OLD.subject_entity_id
  AND NEW.predicate IS OLD.predicate
  AND NEW.object_entity_id IS OLD.object_entity_id
  AND NEW.object_value IS OLD.object_value
  AND NEW.statement IS OLD.statement
  AND NEW.confidence IS OLD.confidence
  AND NEW.valid_from IS OLD.valid_from
  AND NEW.valid_to IS OLD.valid_to
  AND NEW.created_at IS OLD.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'a fact changes only by being invalidated once');
END;

CREATE TABLE fact_source (
  fact_id    TEXT NOT NULL REFERENCES fact (id),
  source_id  TEXT NOT NULL REFERENCES source (id),
  PRIMARY KEY (fact_id, source_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX fact_source_by_source ON fact_source (source_id);

-- Vector lane. One embedding per fact, in an ordinary table, searched with
-- vec_distance_cosine() so the time filter is plain SQL.
CREATE TABLE fact_embedding (
  fact_id     TEXT PRIMARY KEY REFERENCES fact (id),
  model       TEXT NOT NULL,
  dimensions  INTEGER NOT NULL,
  embedding   BLOB NOT NULL
) STRICT;

-- Keyword lane. External-content FTS5 index over the statement. Fact rows are
-- insert-only, so one trigger keeps it in step.
CREATE VIRTUAL TABLE fact_fts USING fts5 (statement, content = 'fact', content_rowid = 'rowid');

CREATE TRIGGER fact_fts_insert AFTER INSERT ON fact
BEGIN
  INSERT INTO fact_fts (rowid, statement) VALUES (NEW.rowid, NEW.statement);
END;

-- One row per change. Rows hold identifiers and reasons, never fact or source text.
CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  namespace     TEXT NOT NULL,
  operation_id  TEXT NOT NULL,  -- shared by the entries of one commit
  operation     TEXT NOT NULL,  -- what was being done, for example 'remember', 'succession'
  action        TEXT NOT NULL,  -- what happened to the target, for example 'fact.invalidated'
  target_kind   TEXT NOT NULL CHECK (target_kind IN ('entity', 'source', 'fact')),
  target_id     TEXT NOT NULL,
  trigger       TEXT NOT NULL CHECK (trigger IN ('agent', 'person', 'feedback', 'maintenance')),
  reason        TEXT NOT NULL,
  detail        TEXT CHECK (detail IS NULL OR json_valid(detail)),
  occurred_at   TEXT NOT NULL CHECK (occurred_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z')
) STRICT;

CREATE INDEX audit_log_target ON audit_log (namespace, target_kind, target_id);

CREATE TRIGGER audit_log_never_deleted BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit entries are never deleted');
END;

CREATE TRIGGER audit_log_never_updated BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit entries are never changed');
END;
```

Notes on the columns:

- **Identifiers** are text UUIDs generated by the caller, so a set of related rows can be built before it is written and tests can use fixed identifiers. `audit_log.id` is the exception: it is an integer that grows with each entry and gives the log its order.
- **`entity.name_key`** is the name lower-cased, trimmed, with runs of white space collapsed. The unique index on `(namespace, type, name_key)` is what makes phase 1 **entity resolution** an exact match.
- **`fact.object_entity_id` and `fact.object_value`**: exactly one is set. A fact relates its subject either to another entity or to a literal such as a version or a command.
- **`fact.statement`** is what the keyword and vector lanes search, and what recall returns for a person or an agent to read.
- **`source.locator` and `source.version`** together are the **anchor**. Both are optional: a note from an agent has neither.
- **`source.content`** is optional and is the only place source text is kept.
- **`fact_embedding.model` and `dimensions`** record which embedding model produced the vector. A database holds vectors from one model; the storage adapter refuses to start with a different one. Changing model means re-embedding, which is possible because `statement` is kept.
- **`audit_log.operation`** names what was being done (`remember`, `succession`, `correction`, `retraction`, `revision`). **`action`** names what happened to one row (`entity.created`, `source.recorded`, `fact.recorded`, `fact.invalidated`). **`detail`** is JSON for identifiers and non-content values, such as the identifier of the superseding fact.

## How the three retrieval lanes use the schema

| Lane | Query | Index |
|---|---|---|
| Vector | `ORDER BY vec_distance_cosine(e.embedding, :query) LIMIT :k` over `fact JOIN fact_embedding`, with the time predicate in `WHERE` | None. It is an exact scan |
| Keyword | `fact_fts MATCH :query` joined to `fact`, ordered by `bm25(fact_fts)`, with the time predicate | FTS5 |
| Graph | Facts whose subject or object is one of the entities found by the other two lanes, to a fixed depth, with the time predicate | `fact_subject_predicate`, `fact_object_entity` |

The vector lane does not use sqlite-vec's `vec0` virtual table. A `vec0` table cannot hold missing values and needs integer copies of the time columns to filter by time. Searching an ordinary table with `vec_distance_cosine()` returned the same ten nearest rows in a test and took about 10 ms for 10,000 vectors of 768 dimensions and about 120 ms for 100,000 ([measurement](../../spikes/sqlite-vec-fts5/README.md)). That is enough for one repository's memory. Because the embeddings live in an ordinary table, adding an approximate index later is an added index, not a data migration. See [ADR 0008](adr/0008-vector-search-on-a-plain-table.md).

## Planned additions

These are designed so that the interfaces in [`INTERFACES.md`](INTERFACES.md) are stable, but they are not in the first migration. Each is an added column or table, so none forces a rewrite.

| Phase | Addition | Why it can wait |
|---|---|---|
| 2 | `fact.purged_at`, `source.purged_at`, and a second permitted change in the fact trigger that blanks `statement` and `object_value` | Purge is first needed when memory holds real user data. The part that could not be added later, an audit log with no content in it, is in the first migration |
| 2 | `feedback` table: fact, signal, trigger, time | Nothing reads feedback before conflict handling exists |
| 3 | `entity.merged_into_entity_id`, set once, and an `entity_alias` table | Phase 1 resolves entities by exact name only and never merges. Facts keep their original entity identifiers; reads follow the merge link |
| 3 | `fact_verification` table: fact, outcome, time | Nothing verifies facts before phase 3 |
| 3 | `fact_usage` table: fact, last recalled, count | Archiving by disuse starts counting when it is introduced. Keeping it out of phase 1 keeps recall a pure read |

## What differs in Postgres

The Postgres adapter is a later phase. The schema is written so the move is a translation.

| SQLite | Postgres |
|---|---|
| Timestamps as fixed-format text with a `CHECK` | `timestamptz`. The text format casts directly |
| `STRICT` tables | Ordinary typed columns |
| `fact_embedding.embedding BLOB`, `vec_distance_cosine()` | `vector(n)` from pgvector with the `<=>` operator, and an HNSW index when needed |
| FTS5 virtual table with an insert trigger, `bm25()` | A generated `tsvector` column with a GIN index, `ts_rank_cd()`. Ranking differs, which is one reason rank fusion works on ranks and not on scores |
| `audit_log.detail TEXT` checked with `json_valid` | `jsonb` |
| `audit_log.id INTEGER PRIMARY KEY AUTOINCREMENT` | `bigint GENERATED ALWAYS AS IDENTITY` |
| Triggers with `RAISE(ABORT, ...)` | The same rules as PL/pgSQL triggers |
| The write path checks that two current facts for a single-valued predicate do not overlap | An exclusion constraint could enforce it. Not planned until needed |
| One writer at a time, so a commit is one synchronous transaction | Ordinary transactions |

## Migrations

- Migrations are numbered SQL files in `packages/storage/migrations/`: `0001_initial.sql`, `0002_...sql`.
- The storage adapter applies pending migrations in order when it opens a database, each in its own transaction, and records the number, name, SHA-256 of the file and time in a `schema_migration` table that the adapter creates itself.
- A released migration is never edited. On open, the adapter compares the recorded hash with the file and refuses to continue if they differ.
- Migrations only move forward. There are no down migrations: a mistake is fixed by a new migration.
- The Postgres adapter will have its own migration files with the same numbers and names.
