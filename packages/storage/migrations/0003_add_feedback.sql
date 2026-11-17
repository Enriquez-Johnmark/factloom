-- Factloom schema, third migration: the feedback of FL-046. Never edit this file once it is
-- released: fix a mistake with a new migration.
--
-- A feedback row says that someone found a recalled fact right, wrong or out of date. It
-- changes no fact; product 2 reads it and acts through the fact operations. What was said is
-- the content of a source, never text in this row or in the audit log. signal and trigger
-- are closed lists in the core schema, not CHECK constraints, as for the audit log.
--
-- A row belongs to the namespace of its fact: a commit refuses feedback on a fact outside its
-- change set's namespace. The fact may be invalidated, because a fact recalled with a past
-- known-at date can be.
--
-- What the Postgres version of this migration will do differently:
--   * recorded_at: timestamptz in place of fixed-format text with a CHECK.
--   * STRICT table: ordinary typed columns.
--   * Triggers: the same rules as PL/pgSQL triggers in place of RAISE(ABORT, ...).

CREATE TABLE feedback (
  id           TEXT PRIMARY KEY,
  namespace    TEXT NOT NULL,
  fact_id      TEXT NOT NULL REFERENCES fact (id),
  signal       TEXT NOT NULL,  -- 'right', 'wrong' or 'outdated'
  trigger      TEXT NOT NULL,  -- who gave it: 'agent', 'person', 'feedback' or 'maintenance'
  source_id    TEXT REFERENCES source (id),  -- the source that holds what was said, if anything
  recorded_at  TEXT NOT NULL CHECK (recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z')
) STRICT;

-- The feedback on one fact, in the order it was given.
CREATE INDEX feedback_by_fact ON feedback (namespace, fact_id, recorded_at);

-- Feedback is append-only: it is never changed or removed.
CREATE TRIGGER feedback_never_deleted BEFORE DELETE ON feedback
BEGIN
  SELECT RAISE(ABORT, 'feedback is never deleted');
END;

CREATE TRIGGER feedback_never_updated BEFORE UPDATE ON feedback
BEGIN
  SELECT RAISE(ABORT, 'feedback is never changed');
END;
