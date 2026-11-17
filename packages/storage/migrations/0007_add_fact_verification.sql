-- Factloom schema, seventh migration: verification records (FL-049). Never edit this file
-- once it is released: fix a mistake with a new migration.
--
-- A verification row says what checking a fact against its source found. It changes no fact;
-- what follows from an outcome is a separate fact operation. outcome and method are closed
-- lists in the core schema, not CHECK constraints, as for feedback. A row belongs to the
-- namespace of its fact: a commit refuses a verification of a fact outside its change set's
-- namespace, and of an invalidated fact.
--
-- The latest verification of a fact is the row with the latest verified_at, then the latest
-- rowid. listStaleFacts and listOrphanedFacts each start from the facts of a namespace, by the
-- namespace prefix of fact_subject_predicate, and read the latest verification of each by
-- fact_verification_by_fact. A partial index of live facts by namespace was tried and left
-- out: without statistics the planner then chose it for listFacts by subject as well.
--
-- What the Postgres version of this migration will do differently:
--   * verified_at: timestamptz in place of fixed-format text with a CHECK.
--   * STRICT table: ordinary typed columns.
--   * The latest row: an identity column in place of rowid for the order of rows with one time.
--   * Triggers: the same rules as PL/pgSQL triggers in place of RAISE(ABORT, ...).

CREATE TABLE fact_verification (
  id           TEXT PRIMARY KEY,
  namespace    TEXT NOT NULL,
  fact_id      TEXT NOT NULL REFERENCES fact (id),
  outcome      TEXT NOT NULL,  -- 'confirmed', 'contradicted', 'source_missing' or 'inconclusive'
  method       TEXT NOT NULL,  -- 'deterministic' or 'llm'
  verified_at  TEXT NOT NULL CHECK (verified_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z')
) STRICT;

-- The latest verification of one fact.
CREATE INDEX fact_verification_by_fact ON fact_verification (fact_id, verified_at);

-- Verifications are append-only: they are never changed or removed.
CREATE TRIGGER fact_verification_never_deleted BEFORE DELETE ON fact_verification
BEGIN
  SELECT RAISE(ABORT, 'verifications are never deleted');
END;

CREATE TRIGGER fact_verification_never_updated BEFORE UPDATE ON fact_verification
BEGIN
  SELECT RAISE(ABORT, 'verifications are never changed');
END;
