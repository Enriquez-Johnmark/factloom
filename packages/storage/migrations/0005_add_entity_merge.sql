-- Factloom schema, fifth migration: entity merges (FL-052). Never edit this file once it is
-- released: fix a mistake with a new migration.
--
-- A merge records that one entity is the same thing as another. No entity row and no fact row
-- is rewritten: reads resolve an entity identifier through the merges whose undone_at is NULL,
-- so a wrong merge can be withdrawn by setting undone_at once (FL-063). A row belongs to the
-- namespace of its two entities.
--
-- What the Postgres version of this migration will do differently:
--   * merged_at and undone_at: timestamptz in place of fixed-format text with a CHECK.
--   * STRICT table: ordinary typed columns.
--   * Triggers: the same rules as PL/pgSQL triggers in place of RAISE(ABORT, ...).

CREATE TABLE entity_merge (
  id              TEXT PRIMARY KEY,
  namespace       TEXT NOT NULL,
  from_entity_id  TEXT NOT NULL REFERENCES entity (id),
  into_entity_id  TEXT NOT NULL REFERENCES entity (id),
  merged_at       TEXT NOT NULL CHECK (merged_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  undone_at       TEXT CHECK (undone_at IS NULL OR undone_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  CHECK (from_entity_id <> into_entity_id),
  CHECK (undone_at IS NULL OR undone_at >= merged_at)
) STRICT;

-- An entity is merged into at most one other at a time.
CREATE UNIQUE INDEX entity_merge_one_in_force ON entity_merge (from_entity_id) WHERE undone_at IS NULL;
-- Resolution of the entities merged into one.
CREATE INDEX entity_merge_into ON entity_merge (namespace, into_entity_id) WHERE undone_at IS NULL;

CREATE TRIGGER entity_merge_never_deleted BEFORE DELETE ON entity_merge
BEGIN
  SELECT RAISE(ABORT, 'entity merges are never deleted');
END;

-- The one change ever made to a merge is undoing it, once.
CREATE TRIGGER entity_merge_changes_only_by_undo BEFORE UPDATE ON entity_merge
WHEN NOT (
      OLD.undone_at IS NULL AND NEW.undone_at IS NOT NULL
  AND NEW.rowid IS OLD.rowid
  AND NEW.id IS OLD.id
  AND NEW.namespace IS OLD.namespace
  AND NEW.from_entity_id IS OLD.from_entity_id
  AND NEW.into_entity_id IS OLD.into_entity_id
  AND NEW.merged_at IS OLD.merged_at
)
BEGIN
  SELECT RAISE(ABORT, 'a merge changes only by being undone once');
END;
