-- Factloom schema, ninth migration: proposed changes (FL-043). Never edit this file once it is
-- released: fix a mistake with a new migration.
--
-- A proposed change is a succession or a correction held for a person to approve, under the
-- correction policy human_approval. It stores the input of the operation it would run, not a
-- built change set: approval builds the change set then, so the facts it writes are recorded at
-- the time of approval (ADR 0009). It changes no fact until then. Its one change is the
-- decision, made once. Its source is a source row, recorded with it, so that purge reaches it;
-- new_fact holds the new fact's statement and value, and is content. A row belongs to the
-- namespace of the fact it would change.
--
-- What the Postgres version of this migration will do differently:
--   * proposed_at and decided_at, and changed_at: timestamptz in place of fixed-format text with a CHECK.
--   * new_fact: jsonb in place of text with a json_valid CHECK.
--   * STRICT table: ordinary typed columns.
--   * Triggers: the same rules as PL/pgSQL triggers in place of RAISE(ABORT, ...).

CREATE TABLE proposed_change (
  id              TEXT PRIMARY KEY,
  namespace       TEXT NOT NULL,
  stored_fact_id  TEXT NOT NULL REFERENCES fact (id),
  kind            TEXT NOT NULL CHECK (kind IN ('succession', 'correction')),
  -- For a succession: when the stored fact ended. A correction has no such moment.
  changed_at      TEXT CHECK (changed_at IS NULL OR changed_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  -- The new fact with the new entities it introduces, as the operation takes it.
  new_fact        TEXT NOT NULL CHECK (json_valid(new_fact)),
  source_id       TEXT NOT NULL REFERENCES source (id),
  reason_code     TEXT NOT NULL,
  proposed_at     TEXT NOT NULL CHECK (proposed_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  state           TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected')),
  decided_at      TEXT CHECK (decided_at IS NULL OR decided_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  CHECK ((kind = 'succession') = (changed_at IS NOT NULL)),
  CHECK ((state = 'pending') = (decided_at IS NULL)),
  CHECK (decided_at IS NULL OR decided_at >= proposed_at)
) STRICT;

-- The pending proposals of a namespace, oldest first.
CREATE INDEX proposed_change_pending ON proposed_change (namespace, proposed_at) WHERE state = 'pending';

CREATE TRIGGER proposed_change_never_deleted BEFORE DELETE ON proposed_change
BEGIN
  SELECT RAISE(ABORT, 'proposed changes are never deleted');
END;

-- The one change ever made to a proposal is its decision, once.
CREATE TRIGGER proposed_change_changes_only_by_decision BEFORE UPDATE ON proposed_change
WHEN NOT (
      OLD.state = 'pending' AND NEW.state IN ('approved', 'rejected') AND NEW.decided_at IS NOT NULL
  AND NEW.rowid IS OLD.rowid
  AND NEW.id IS OLD.id
  AND NEW.namespace IS OLD.namespace
  AND NEW.stored_fact_id IS OLD.stored_fact_id
  AND NEW.kind IS OLD.kind
  AND NEW.changed_at IS OLD.changed_at
  AND NEW.new_fact IS OLD.new_fact
  AND NEW.source_id IS OLD.source_id
  AND NEW.reason_code IS OLD.reason_code
  AND NEW.proposed_at IS OLD.proposed_at
)
BEGIN
  SELECT RAISE(ABORT, 'a proposed change changes only by being decided once');
END;
