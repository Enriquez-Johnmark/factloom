-- Kronomind schema, eleventh migration: a proposal can hold a retraction, or an end with nothing
-- after it (FL-095). Never edit this file once it is released: fix a mistake with a new migration.
--
-- Under the correction policy human_approval, FHIR "entered-in-error" becomes a retraction, and a
-- medication that stops becomes an end with no successor; both must wait for a person. Migration 9
-- allowed only the kinds succession and correction, and required a new fact. SQLite cannot change
-- a CHECK or a NOT NULL in place, so the table is rebuilt: a new table with the wider rules, every
-- row copied unchanged, the old table dropped (no foreign key points at it, and a DROP fires no
-- trigger), the new one renamed, and its index and triggers made again with the rules of
-- migrations 9 and 10.
--
-- The new fact is required for a correction, absent for a retraction, and either for a succession.
-- The purge rule of migration 10 applies only to a proposal that has a new fact: one with none
-- holds no text from its source.
--
-- What the Postgres version of this migration will do differently:
--   * ALTER TABLE ... DROP CONSTRAINT and ADD CONSTRAINT, and ALTER COLUMN new_fact DROP NOT NULL,
--     in place of rebuilding the table.
--   * proposed_at, decided_at and changed_at: timestamptz; new_fact: jsonb.
--   * Triggers: the same rules as PL/pgSQL triggers in place of RAISE(ABORT, ...).

CREATE TABLE proposed_change_rebuilt (
  id              TEXT PRIMARY KEY,
  namespace       TEXT NOT NULL,
  stored_fact_id  TEXT NOT NULL REFERENCES fact (id),
  kind            TEXT NOT NULL CHECK (kind IN ('succession', 'correction', 'retraction')),
  -- For a succession: when the stored fact ended. A correction and a retraction have no such moment.
  changed_at      TEXT CHECK (changed_at IS NULL OR changed_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  -- The new fact with the new entities it introduces, as the operation takes it, or NULL.
  new_fact        TEXT CHECK (new_fact IS NULL OR json_valid(new_fact)),
  source_id       TEXT NOT NULL REFERENCES source (id),
  reason_code     TEXT NOT NULL,
  proposed_at     TEXT NOT NULL CHECK (proposed_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  state           TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected')),
  decided_at      TEXT CHECK (decided_at IS NULL OR decided_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  CHECK ((kind = 'succession') = (changed_at IS NOT NULL)),
  CHECK (kind <> 'correction' OR new_fact IS NOT NULL),
  CHECK (kind <> 'retraction' OR new_fact IS NULL),
  CHECK ((state = 'pending') = (decided_at IS NULL)),
  CHECK (decided_at IS NULL OR decided_at >= proposed_at)
) STRICT;

INSERT INTO proposed_change_rebuilt (id, namespace, stored_fact_id, kind, changed_at, new_fact, source_id,
                                     reason_code, proposed_at, state, decided_at)
  SELECT id, namespace, stored_fact_id, kind, changed_at, new_fact, source_id,
         reason_code, proposed_at, state, decided_at
  FROM proposed_change ORDER BY rowid;

DROP TABLE proposed_change;

ALTER TABLE proposed_change_rebuilt RENAME TO proposed_change;

-- The pending proposals of a namespace, oldest first.
CREATE INDEX proposed_change_pending ON proposed_change (namespace, proposed_at) WHERE state = 'pending';

CREATE TRIGGER proposed_change_never_deleted BEFORE DELETE ON proposed_change
BEGIN
  SELECT RAISE(ABORT, 'proposed changes are never deleted');
END;

-- The decision, once, from pending; or the purge of a new fact once its source is purged.
CREATE TRIGGER proposed_change_changes_only_by_decision_or_purge BEFORE UPDATE ON proposed_change
WHEN NOT (
      NEW.rowid IS OLD.rowid
  AND NEW.id IS OLD.id
  AND NEW.namespace IS OLD.namespace
  AND NEW.stored_fact_id IS OLD.stored_fact_id
  AND NEW.kind IS OLD.kind
  AND NEW.changed_at IS OLD.changed_at
  AND NEW.source_id IS OLD.source_id
  AND NEW.reason_code IS OLD.reason_code
  AND NEW.proposed_at IS OLD.proposed_at
  AND (
        (    OLD.state = 'pending' AND NEW.state IN ('approved', 'rejected') AND NEW.decided_at IS NOT NULL
         AND NEW.new_fact IS OLD.new_fact)
     OR (    NEW.state IS OLD.state AND NEW.decided_at IS OLD.decided_at
         AND OLD.new_fact IS NOT NULL
         AND EXISTS (SELECT 1 FROM source s WHERE s.id = OLD.source_id AND s.purged_at IS NOT NULL)
         AND json_extract(NEW.new_fact, '$.fact.statement') = '[purged]')
  )
)
BEGIN
  SELECT RAISE(ABORT, 'a proposed change changes only by being decided once, or purged with its source');
END;
