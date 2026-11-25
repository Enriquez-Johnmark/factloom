-- Factloom schema, tenth migration: purge reaches proposed changes (FL-070, Q-85). Never edit
-- this file once it is released: fix a mistake with a new migration.
--
-- A proposal's new fact holds a statement and a value from its source. When that source is
-- purged, the statement, and the value when the object is a value, become the marker
-- '[purged]', in the same commit as the source (ADR 0012). The trigger of migration 9 allows
-- only the decision, so it is replaced, not kept: the new one allows the decision once, as
-- before, or that one purge of the new fact, and nothing else.
--
-- What the Postgres version of this migration will do differently:
--   * new_fact: jsonb, with ->> in place of json_extract.
--   * Triggers: the same rules as PL/pgSQL triggers in place of RAISE(ABORT, ...).

DROP TRIGGER proposed_change_changes_only_by_decision;

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
        -- The decision: once, from pending.
        (    OLD.state = 'pending' AND NEW.state IN ('approved', 'rejected') AND NEW.decided_at IS NOT NULL
         AND NEW.new_fact IS OLD.new_fact)
        -- The purge: the proposal's source is purged, and the new fact's statement is the marker.
     OR (    NEW.state IS OLD.state AND NEW.decided_at IS OLD.decided_at
         AND EXISTS (SELECT 1 FROM source s WHERE s.id = OLD.source_id AND s.purged_at IS NOT NULL)
         AND json_extract(NEW.new_fact, '$.fact.statement') = '[purged]')
  )
)
BEGIN
  SELECT RAISE(ABORT, 'a proposed change changes only by being decided once, or purged with its source');
END;
