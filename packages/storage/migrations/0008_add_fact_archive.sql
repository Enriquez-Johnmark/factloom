-- Factloom schema, eighth migration: archived facts (FL-065). Never edit this file once it is
-- released: fix a mistake with a new migration.
--
-- An archived fact is a live fact that recall leaves out by default because it has not been
-- used (FL-073). Archiving changes no fact row: it is a row here, closed by setting
-- unarchived_at once, as an entity merge is, so the history of archiving is kept. A row
-- belongs to the namespace of its fact. An archived fact still counts for the single-value
-- rule, which reads the fact rows only.
--
-- What the Postgres version of this migration will do differently:
--   * archived_at and unarchived_at: timestamptz in place of fixed-format text with a CHECK.
--   * STRICT table: ordinary typed columns.
--   * Triggers: the same rules as PL/pgSQL triggers in place of RAISE(ABORT, ...).

CREATE TABLE fact_archive (
  id             TEXT PRIMARY KEY,
  namespace      TEXT NOT NULL,
  fact_id        TEXT NOT NULL REFERENCES fact (id),
  archived_at    TEXT NOT NULL CHECK (archived_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  unarchived_at  TEXT CHECK (unarchived_at IS NULL OR unarchived_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  CHECK (unarchived_at IS NULL OR unarchived_at >= archived_at)
) STRICT;

-- A fact has at most one archiving in force, and reads find it by the fact.
CREATE UNIQUE INDEX fact_archive_in_force ON fact_archive (fact_id) WHERE unarchived_at IS NULL;

-- An archiving is never removed, and the one change it takes is setting unarchived_at once.
CREATE TRIGGER fact_archive_never_deleted BEFORE DELETE ON fact_archive
BEGIN
  SELECT RAISE(ABORT, 'archivings are never deleted');
END;

CREATE TRIGGER fact_archive_changes_only_by_unarchiving BEFORE UPDATE ON fact_archive
WHEN OLD.unarchived_at IS NOT NULL
  OR NEW.unarchived_at IS NULL
  OR NEW.id IS NOT OLD.id
  OR NEW.namespace IS NOT OLD.namespace
  OR NEW.fact_id IS NOT OLD.fact_id
  OR NEW.archived_at IS NOT OLD.archived_at
BEGIN
  SELECT RAISE(ABORT, 'an archiving changes only by setting unarchived_at once');
END;
