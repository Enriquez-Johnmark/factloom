# Schema

The database schema for SQLite, the rules it enforces, and how it will differ in Postgres.

Terms in bold are defined in [`GLOSSARY.md`](../../GLOSSARY.md). The DDL below was run on 2026-11-13 with 31 checks, which all passed (SQLite 3.54.1, Linux). The checks and their output are in the [spike README](../../spikes/fact-schema/README.md). It has not been run on macOS.

## Rules the schema enforces

1. **Two time axes on every fact.** `valid_from` and `valid_to` hold **valid time**. `created_at` and `invalidated_at` hold **recorded time**. Both periods are half-open: the start is included, the end is not.
2. **Missing means unknown or open.** A missing `valid_from` means the start is not known. A missing `valid_to` means no end is known. There are no sentinel dates. A fact whose text gives no date has a missing `valid_from`, so it is returned for any earlier as-of date.
3. **One timestamp format.** Every timestamp is UTC text, `YYYY-MM-DDTHH:MM:SS.sssZ`, which is what JavaScript's `toISOString()` produces. A `CHECK` on each column rejects anything else, because mixed formats sort wrongly as text ([research](../research/technical/bi-temporal-modelling.md)).
4. **A fact row changes once, at most.** The only permitted change is an **invalidation**: `invalidated_at` goes from missing to a timestamp, and `superseded_by_fact_id` may be set in the same change. A trigger rejects every other update and every delete.
5. **Every fact has a source.** `fact_source` links each fact to one or more sources. The write path refuses a fact with none. A source can be attached to a live fact later.
6. **Every change has an audit entry.** `audit_log` gets one audit entry per change. Its rows hold identifiers and reason codes, never free text. A change is explained by `reason_code`, from a fixed list, and by `source_id`, the source whose content is the explanation. A later **purge** can then remove that content without touching the log.
7. **Everything belongs to a namespace.** `entity`, `source`, `fact` and `audit_log` have a `namespace` column. A source link and an embedding belong to the namespace of their fact. Every query filters on the namespace, a commit refuses an identifier that is not in its namespace with `not_found`, and a trigger refuses a supersession link to a fact in another namespace.
8. **The single-value rule.** For a **single-valued predicate**, no two **live facts** with the same subject and predicate may have overlapping valid periods. A missing bound counts as open, and periods that only touch do not overlap. The store checks this inside the commit transaction, after applying the change set, and fails the commit with `conflict`. Gaps between periods are allowed: they mean the value is not known for that time.
9. **Entities, sources and source links are immutable.** Triggers reject every update and every delete on `entity`, `source` and `fact_source`. Two entities found to be the same are merged by a row in a later table, not by rewriting either.

Rules 1 to 7 and 9 are enforced by the DDL below or by the write path. Rule 8 is a query the SQLite adapter runs inside each commit. The spike checks that the query is right on five cases, by hand; it does not show that the adapter calls it, because the adapter is not built.

## How each change is written

Because a fact row never changes except to be invalidated, anything that looks like an edit is an invalidation plus a new row.

| Change | Rows written |
|---|---|
| Record a new fact | Insert the fact, its source links and its embedding |
| **Restatement** (a source states a live fact again) | Insert the source and a source link to the existing fact. No fact row is written |
| **Revision** (a change to a fact's valid time, such as ending it) | Insert a copy with the new valid period. The copy carries the original's sources plus the source that reported the change. Invalidate the original and link it to the copy |
| **Succession** (the world changed) | Revise the old fact so its `valid_to` is the moment of change. Insert the new fact with that moment as `valid_from` |
| **Correction** (the old fact was wrong) | Insert the right fact, which takes the valid period of the wrong one unless another is given. Invalidate the wrong one and link it to the right one |
| **Retraction** | Invalidate the fact. No link |

Each of these is one database transaction and writes one audit entry per change, all sharing one `operation_id`. A change is one item of the **change set**: an entity created, a source recorded, a fact recorded, a source attached, or a fact invalidated. Recording a fact inserts its row, its source links and its embedding, and is one change.

A change of confidence is not in this table. `fact.confidence` is the confidence at recording and is never rewritten or copied. From the second migration a later confidence is a row of `fact_confidence`; see "Added by later migrations".

A fact has at most one supersession link, set when it is invalidated. A fact retracted with no replacement cannot be linked to one later.

Example: on 2026-04-02 Factloom learns that PostgreSQL was upgraded from 14 to 16 on 2026-03-15.

| id | value | valid_from | valid_to | created_at | invalidated_at | superseded_by |
|---|---|---|---|---|---|---|
| `pg14` | PostgreSQL 14 | 2025-06-01 | | 2026-01-10 | 2026-04-02 | `pg14-ended` |
| `pg14-ended` | PostgreSQL 14 | 2025-06-01 | 2026-03-15 | 2026-04-02 | | |
| `pg16` | PostgreSQL 16 | 2026-03-15 | | 2026-04-02 | | |

`pg14-ended` is an **ended fact**: a live belief about the past. It has two sources: the one `pg14` came from, and the one that reported the upgrade, which is also the source of `pg16`. Asked "what is true now", Factloom returns `pg16`. Asked "what was true on 2026-02-01", it returns `pg14-ended`. Asked "what did you believe on 2026-04-01", it returns `pg14`, because the upgrade had not been recorded yet.

## The time predicate

Every read that returns facts applies the same four conditions. `:valid_at` is the **as-of date** and `:known_at` is the **known-at date**. The store is always given both. In `recall` both default to now, and when only the known-at date is given the as-of date takes the same date.

```sql
    f.created_at <= :known_at
AND (f.invalidated_at IS NULL OR f.invalidated_at > :known_at)
AND (f.valid_from IS NULL OR f.valid_from <= :valid_at)
AND (f.valid_to   IS NULL OR f.valid_to   >  :valid_at)
```

This is the whole of time handling at query time. It is applied inside each **retrieval lane**, not after **rank fusion**, so a lane never spends its result limit on facts that the filter would drop.

There are two exceptions, and both are reads that ask for a row whatever its time: `listFacts` with `time: 'all'`, which serves **fact history**, and `getFact` by identifier.

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

-- Entities are never edited or deleted. Two entities found to be the same are merged
-- by a link in a later table, not by rewriting either.
CREATE TRIGGER entity_never_deleted BEFORE DELETE ON entity
BEGIN
  SELECT RAISE(ABORT, 'entities are never deleted');
END;

CREATE TRIGGER entity_never_updated BEFORE UPDATE ON entity
BEGIN
  SELECT RAISE(ABORT, 'entities are never changed');
END;

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

CREATE TRIGGER source_never_deleted BEFORE DELETE ON source
BEGIN
  SELECT RAISE(ABORT, 'sources are never deleted');
END;

CREATE TRIGGER source_never_updated BEFORE UPDATE ON source
BEGIN
  SELECT RAISE(ABORT, 'sources are never changed');
END;

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
  CHECK (superseded_by_fact_id IS NULL OR invalidated_at IS NOT NULL),
  CHECK (superseded_by_fact_id IS NULL OR superseded_by_fact_id <> id)
) STRICT;

-- Conflict candidates and fact history: the facts for one subject and predicate.
CREATE INDEX fact_subject_predicate ON fact (namespace, subject_entity_id, predicate);
-- Graph lane: facts that point at an entity.
CREATE INDEX fact_object_entity ON fact (namespace, object_entity_id) WHERE object_entity_id IS NOT NULL;
-- Fact history: the facts that a given fact superseded.
CREATE INDEX fact_superseded_by ON fact (superseded_by_fact_id) WHERE superseded_by_fact_id IS NOT NULL;

-- Facts are never deleted, and the only change is one invalidation.
CREATE TRIGGER fact_never_deleted BEFORE DELETE ON fact
BEGIN
  SELECT RAISE(ABORT, 'facts are never deleted');
END;

CREATE TRIGGER fact_changes_only_by_invalidation BEFORE UPDATE ON fact
WHEN NOT (
      OLD.invalidated_at IS NULL AND NEW.invalidated_at IS NOT NULL
  AND NEW.rowid IS OLD.rowid
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

-- A fact is superseded only by a fact in the same namespace.
CREATE TRIGGER fact_superseded_within_namespace BEFORE UPDATE OF superseded_by_fact_id ON fact
WHEN NEW.superseded_by_fact_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM fact AS replacement
  WHERE replacement.id = NEW.superseded_by_fact_id AND replacement.namespace = NEW.namespace
)
BEGIN
  SELECT RAISE(ABORT, 'a fact is superseded only by a fact in its own namespace');
END;

CREATE TABLE fact_source (
  fact_id    TEXT NOT NULL REFERENCES fact (id),
  source_id  TEXT NOT NULL REFERENCES source (id),
  PRIMARY KEY (fact_id, source_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX fact_source_by_source ON fact_source (source_id);

-- A source can be attached to a fact later, but a link is never removed or changed.
CREATE TRIGGER fact_source_never_deleted BEFORE DELETE ON fact_source
BEGIN
  SELECT RAISE(ABORT, 'a fact keeps its sources');
END;

CREATE TRIGGER fact_source_never_updated BEFORE UPDATE ON fact_source
BEGIN
  SELECT RAISE(ABORT, 'a fact keeps its sources');
END;

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

-- One row per change. Rows hold identifiers and codes, never free text: the
-- explanation of a change is the content of the source the row points to.
CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  namespace     TEXT NOT NULL,
  operation_id  TEXT NOT NULL,  -- shared by the entries of one commit
  operation     TEXT NOT NULL,  -- what was being done, for example 'remember', 'succession'
  action        TEXT NOT NULL,  -- what happened to the target, for example 'fact.invalidated'
  target_kind   TEXT NOT NULL,  -- 'entity', 'source' or 'fact'
  target_id     TEXT NOT NULL,
  trigger       TEXT NOT NULL,  -- 'agent', 'person', 'feedback' or 'maintenance'
  reason_code   TEXT NOT NULL,  -- why, from a fixed list, for example 'reported_wrong'
  source_id     TEXT REFERENCES source (id),  -- the source that explains the change, if any
  detail        TEXT CHECK (detail IS NULL OR json_valid(detail)),  -- identifiers and numbers only
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
- **`fact.confidence`** is the confidence when the fact was recorded. The trigger does not let it change. From phase 2 a later confidence is a row in `fact_confidence`, and reads return the latest one recorded at or before the known-at date.
- **Timestamp columns.** The `CHECK` guards the format, not calendar validity: it accepts `9999-99-99T99:99:99.999Z`. `toTimestamp` in `core` is the only producer of stored timestamps.
- **The fact trigger** also refuses a change to the row number, because the keyword index refers to a fact by it.
- **`source.locator` and `source.version`** together are the **anchor**. Both are optional: a note from an agent has neither.
- **`source.content`** is optional and is the only place source text is kept.
- **`fact_embedding.model` and `dimensions`** record which embedding model produced the vector. A database holds vectors from one model; the storage adapter refuses to start with a different one. Changing model means re-embedding, which is possible because `statement` is kept. The two columns are on every row, not in one settings row, because that lets a re-embedding run be resumed and an unfinished one be detected.
- **`audit_log.operation`** names what was being done: `remember`, `revision`, `succession`, `correction`, `retraction`, and from phase 2 `confidence_adjustment`, `feedback`, `purge`, and from phase 3 `merge`. **`action`** names what happened to one target: `entity.created`, `source.recorded`, `fact.recorded`, `fact.source_attached`, `fact.invalidated`, and from phase 2 `fact.confidence_adjusted`, `feedback.recorded`, `source.purged`, `fact.purged`, and from phase 3 `entity.merged`. **`target_kind`** is `entity`, `source`, `fact`, or from phase 2 `feedback`.
- **`audit_log.reason_code`** says why, from a fixed list: `stated`, `restated`, `reported_wrong`, `reported_ended`, `period_corrected` (a valid period found to be wrong, phase 2), `feedback_given` (phase 2), `erasure_requested` and `secret_stored` (purge, phase 2), `same_entity` (phase 3). **`source_id`** is the source that explains the change, if there is one. An agent's own words are never written to the log: they are stored as the content of a source of kind `agent_note`, and the entry points to it.
- **`audit_log.detail`** is JSON restricted to identifiers and numbers, such as the identifier of the superseding fact. The restriction is in the core schema for an audit entry; the database checks only that the text is valid JSON.
- **The lists of operations, actions, target kinds, triggers and reason codes** are closed lists in the core schema, not `CHECK` constraints. Later phases add values, and SQLite cannot alter a `CHECK` without rebuilding the table.

## How the three retrieval lanes use the schema

| Lane | Query | Index |
|---|---|---|
| Vector | `ORDER BY vec_distance_cosine(e.embedding, :query) LIMIT :k` over `fact JOIN fact_embedding`, with the time predicate in `WHERE` | None. It is an exact scan |
| Keyword | `fact_fts MATCH :query` joined to `fact`, ordered by `bm25(fact_fts)`, with the time predicate | FTS5 |
| Graph | Facts whose subject or object is one of the entities found by the other two lanes, one step out, with the time predicate. Ranked by how many of those entities a fact touches, then by how recently it was recorded | `fact_subject_predicate`, `fact_object_entity` |

The vector lane does not use sqlite-vec's `vec0` virtual table. A `vec0` table cannot hold missing values and needs integer copies of the time columns to filter by time. Searching an ordinary table with `vec_distance_cosine()` returned the same ten nearest rows in a test and took about 10 ms for 10,000 vectors of 768 dimensions and about 120 ms for 100,000 ([measurement](../../spikes/sqlite-vec-fts5/README.md)). At 384 dimensions, the size of the chosen model, 100,000 rows took 82.0 ms with the time filter and 87.8 ms without, against 43.7 ms for `vec0` without a filter: about twice as slow. That is enough for one repository's memory. Because the embeddings live in an ordinary table, adding an approximate index later is an added index, not a data migration. See [ADR 0008](adr/0008-vector-search-on-a-plain-table.md).

## Connection settings

Each host session starts its own MCP server, so several processes can have the same database file open. The SQLite adapter therefore does the following on every connection.

| Setting | Why |
|---|---|
| `foreign_keys = ON` | SQLite does not enforce a `REFERENCES` clause unless this is on, and it is set per connection |
| `journal_mode = WAL` | Readers do not block the writer, and the writer does not block readers. There is still one writer at a time |
| `busy_timeout` | A process waits for the write lock when another holds it, and does not fail at once |
| Each commit runs as `BEGIN IMMEDIATE` | The commit takes the write lock before it reads, so the check of the single-value rule and the writes that follow cannot interleave with another process's commit |

The three PRAGMAs and their documented behaviour are in the [SQLite research](../research/technical/sqlite.md), section "WAL mode and other PRAGMAs". That research ran them with a `busy_timeout` of 5,000 ms, which is also the default it observed in `better-sqlite3`. It also lists `synchronous = NORMAL` and `trusted_schema = OFF`, which none of the rules in this document depend on.

Two processes writing to one file was run on 2026-11-15, in the adapter tests of work item [FL-068](../roadmap/epics/EPIC-03.md): while a second process held the write lock with an uncommitted fact, a commit in the first process waited, then ran its single-value check against what the second had committed and returned `conflict`. A process killed before its commit finished left no row behind. The research had listed this as unverified.

## Added by later migrations

The "Tables" block above is the first migration exactly, and a test holds it to that. Tables added since are described here.

### `fact_confidence`, migration `0002_add_fact_confidence.sql` (FL-045)

An append-only history of confidence: the fact, the new confidence, and `adjusted_at`, the change set's `occurredAt`. Two triggers refuse every update and delete. A row belongs to the namespace of its fact; there is no namespace column, because fact identifiers are unique across namespaces and a commit refuses an adjustment to a fact outside its change set's namespace.

A read with a time filter returns, as `confidence`, the latest row recorded at or before its known-at date, or `fact.confidence` when there is none. `getFact` and `listFacts` with `live` or `all` have no known-at date and return the latest row. Rows with the same `adjusted_at` are ordered by `rowid`, so the later insertion wins. The `adjust_confidence` change writes one row and one audit entry, action `fact.confidence_adjusted`, whose `detail` is `{ previousConfidence, confidence }`.

### `feedback`, migration `0003_add_feedback.sql` (FL-046)

One row per piece of feedback: an identifier, the namespace, the fact, the signal (`right`, `wrong` or `outdated`), the trigger, the source that holds what was said or `NULL`, and `recorded_at`. It changes no fact. Two triggers refuse every update and delete. A commit refuses feedback on a fact outside its change set's namespace with `not_found`, and accepts feedback on an invalidated fact, because a fact recalled with a past known-at date can be one. The `record_feedback` change writes the row and one audit entry, action `feedback.recorded`, target kind `feedback`, `detail` `{ factId }`, under the operation `feedback` and the reason code `feedback_given`. The comment is the content of the source, never text in the row or the log.

### Purge, migration `0004_purge.sql` (FL-061)

Designed in [ADR 0012](adr/0012-purge-is-the-one-exception.md), "The phase 2 design", and proven by the [purge spike](../../spikes/purge/README.md). `fact` and `source` gain `purged_at`.

- **Triggers.** `fact_changes_only_by_invalidation` is replaced by `fact_changes_only_by_invalidation_or_purge`, which permits one invalidation as before, now also with `purged_at` unchanged, and one purge: `statement` to `[purged]`, `object_value` to `[purged]` if set, and nothing else. `source_never_updated` is replaced by `source_changes_only_by_purge`: `content` to `[purged]` if set, `content_hash` and `locator` to `NULL`, and nothing else. `fact_embedding_removed_only_by_purge` lets a vector be deleted only when its fact is purged.
- **Keyword index.** `fact_fts_purge` removes the keyword entry with the old statement when `purged_at` is set. The FTS5 option `secure-delete` is on, so the term leaves the index's shadow tables too.
- **The change.** The `purge_content` change writes the marker and `purged_at` on its target, removes a purged fact's vector, and writes one audit entry, action `fact.purged` or `source.purged`, `detail` `null`, under the operation `purge` and the reason code `erasure_requested` or `secret_stored`. A live purged fact is invalidated by an `invalidate_fact` change in the same change set.
- **Freed pages.** They are cleared after the commit by `clearFreedPages` of `@factloom/storage`: `VACUUM`, then `wal_checkpoint(TRUNCATE)`.
- **Completeness.** A test classifies every text and binary column of the migrated schema as content covered by purge or not content, and fails on a column that is in neither list.

### `entity_merge`, migration `0005_add_entity_merge.sql` (FL-052)

One row per merge: an identifier, the namespace, `from_entity_id`, `into_entity_id`, `merged_at`, and `undone_at`, which is set once. No entity row and no fact row is rewritten by a merge. A trigger refuses every delete and every update but setting `undone_at` once; a partial unique index lets an entity be merged into at most one other at a time.

Every read resolves an entity identifier through the merges whose `undone_at` is `NULL`, in SQL (`packages/storage/src/entity-resolution-sql.ts`) and in the in-memory store: a filter by subject or by touching entities matches every identifier merged with the one asked for, through whole chains of merges in one recursive query, and `subject` and `objectEntity` in results are the entity at the end of the chain. The single-value rule inside `commit` is checked across merged entities. A merge is refused inside its commit when it would make a cycle, or when the two entities hold different live values for a single-valued predicate (FL-063); `undo_entity_merge` sets `undone_at` once. A read with a past known-at date resolves through today's merges.

### `fact_usage` and `fact_usage_tracking`, migration `0006_add_fact_usage.sql` (FL-055)

`fact_usage` holds one row per fact: the namespace, `last_recalled_at` and `recall_count`, updated in place. It is the one table whose rows change, because it is bookkeeping and holds no content. `fact_usage_tracking` holds, per namespace, the time of the first usage write, so that a job can tell a fact never used from one used before counting began. Neither is written by `commit` or audited: the store's `recordFactUsage` writes both in one transaction, with one batched upsert for all facts of a recall result, and skips a fact outside the namespace.

### `fact_verification`, migration `0007_add_fact_verification.sql` (FL-049)

One row per verification: an identifier, the namespace, the fact, the outcome (`confirmed`, `contradicted`, `source_missing` or `inconclusive`), the method (`deterministic` or `llm`) and `verified_at`. It changes no fact. Two triggers refuse every update and delete. A commit refuses a verification of a fact outside its change set's namespace with `not_found`, and of an invalidated fact with `already_invalidated`. The `record_verification` change writes the row and one audit entry, action `fact.verified`, target kind `fact`, `detail` `{ verificationId }`, under the operation `verification`. Outcome and method are closed lists in the core schema, as for feedback.

The latest verification of a fact is the row with the latest `verified_at`, then the latest `rowid`. `listStaleFacts` reads current facts with the time predicate at one moment, each with its latest `verified_at` or else `created_at`, and its latest confidence from `fact_confidence`. `listOrphanedFacts` reads live facts with no source whose `purged_at` is `NULL`, or whose latest verification is `source_missing`. The migration adds `fact_verification_by_fact` for the latest verification of a fact. Both lists start from the facts of a namespace through the namespace prefix of `fact_subject_predicate`. A partial index of live facts by namespace was tried and left out, because without statistics the planner then chose it for `listFacts` by subject too.

### `fact_archive`, migration `0008_add_fact_archive.sql` (FL-065)

One row per archiving of a fact: an identifier, the namespace, the fact, `archived_at`, and `unarchived_at`, which is set once. No fact row is changed: an **archived fact** is still a live fact and still counts for the single-value rule. A partial unique index lets a fact have at most one archiving in force, and reads find it by the fact. Triggers refuse every delete and every update but setting `unarchived_at` once. The `archive_fact` and `unarchive_fact` changes write one audit entry each, actions `fact.archived` and `fact.unarchived`, target kind `fact`, `detail` `{ archiveId }`, under the operation `archive`. Every read returns `archivedAt`, the `archived_at` of the archiving in force, or null. Recall leaves archived facts out from FL-073.

### `proposed_change`, migration `0009_add_proposed_change.sql` (FL-043)

One row per succession or correction held for a person to decide, under the correction policy `human_approval`: an identifier, the namespace, the stored fact it would change, its kind (`succession` or `correction`), `changed_at` for a succession, `new_fact` (the new fact and the entities it introduces, as JSON), the source that explains it, the reason code the change will be recorded with, `proposed_at`, `state` (`pending`, `approved` or `rejected`) and `decided_at`. It stores the input of the operation, not a built change set, so the facts an approval writes are recorded at the time of approval ([ADR 0009](adr/0009-one-commit-writes-everything.md)). CHECK constraints tie `changed_at` to a succession and `decided_at` to a decision. A partial index serves the read of pending proposals. Triggers refuse every delete and every update but deciding a pending proposal once. The source is a source row, recorded with the proposal, so purge reaches it; `new_fact` holds the new fact's statement and value and is classified as content in the schema inventory test of FL-061. The `record_proposal` and `decide_proposal` changes write one audit entry each, target kind `proposal`, actions `proposal.recorded`, `proposal.approved` and `proposal.rejected`.

## Planned additions

None remain. Every addition planned for phases 2 and 3 is now a migration, described under "Added by later migrations". An alias table was planned and is left out by [ADR 0021](adr/0021-no-alias-table-merges-serve-as-aliases.md).

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
| The store checks the single-value rule with a query inside the commit transaction | An exclusion constraint could enforce the same rule in the database. Decided when the Postgres adapter is designed |
| One writer at a time. A commit is one synchronous transaction started with `BEGIN IMMEDIATE` | Ordinary transactions |

## Migrations

- Migrations are numbered SQL files in `packages/storage/migrations/`: `0001_initial.sql`, `0002_...sql`.
- The storage adapter applies pending migrations in order when it opens a database, each in its own transaction, and records the number, name, SHA-256 of the file and time in a `schema_migration` table that the adapter creates itself.
- A released migration is never edited. On open, the adapter compares the recorded hash with the file and refuses to continue if they differ.
- Migrations only move forward. There are no down migrations: a mistake is fixed by a new migration.
- The Postgres adapter will have its own migration files with the same numbers and names.
