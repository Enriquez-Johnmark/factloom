-- Factloom schema, first migration (draft checked by spikes/fact-schema/check.mjs).
-- Timestamps are UTC text in one fixed-width format, YYYY-MM-DDTHH:MM:SS.sssZ, so that
-- text comparison equals time comparison. The CHECKs guard the format, not the calendar.

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
