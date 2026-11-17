-- Factloom schema, second migration: the confidence history of FL-045. Never edit this file
-- once it is released: fix a mistake with a new migration.
--
-- fact.confidence is the confidence at recording and is never rewritten (ADR 0006). A later
-- confidence is a row here, and a read returns the latest row recorded at or before its
-- known-at date, or fact.confidence when there is none. Rows with the same adjusted_at are
-- ordered by rowid, so the later insertion wins.
--
-- A row belongs to the namespace of its fact: fact identifiers are unique across namespaces,
-- and a commit refuses an adjustment to a fact outside its change set's namespace.
--
-- What the Postgres version of this migration will do differently:
--   * adjusted_at: timestamptz in place of fixed-format text with a CHECK.
--   * STRICT table: ordinary typed columns, and a bigint GENERATED ALWAYS AS IDENTITY column
--     in place of rowid to order rows with the same adjusted_at.
--   * Triggers: the same rules as PL/pgSQL triggers in place of RAISE(ABORT, ...).

CREATE TABLE fact_confidence (
  fact_id      TEXT NOT NULL REFERENCES fact (id),
  confidence   REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  adjusted_at  TEXT NOT NULL CHECK (adjusted_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z')
) STRICT;

-- The latest confidence of a fact at a known-at date.
CREATE INDEX fact_confidence_by_fact ON fact_confidence (fact_id, adjusted_at);

-- The history is append-only: a confidence once recorded is never changed or removed.
CREATE TRIGGER fact_confidence_never_deleted BEFORE DELETE ON fact_confidence
BEGIN
  SELECT RAISE(ABORT, 'confidence adjustments are never deleted');
END;

CREATE TRIGGER fact_confidence_never_updated BEFORE UPDATE ON fact_confidence
BEGIN
  SELECT RAISE(ABORT, 'confidence adjustments are never changed');
END;
