-- Kronomind schema, twelfth migration: a unit beside a fact's value (FL-099, ADR 0028). Never
-- edit this file once it is released: fix a mistake with a new migration.
--
-- A measured value, such as a lab result, has a unit: the UCUM code where the source gives one,
-- else the source's unit text. It sits in a nullable column beside object_value, so every fact
-- recorded before has none and means what it meant. A unit needs a value. The trigger of the
-- fourth migration names every column a fact may never change; it does not name the new one,
-- so it would let an update change a unit: it is replaced. A purge clears the unit with the
-- value, because a unit given as text can hold anything.
--
-- What the Postgres version of this migration will do differently:
--   * ALTER TABLE fact ADD COLUMN object_unit text, with the same CHECK.
--   * Triggers: the same rules as PL/pgSQL triggers in place of RAISE(ABORT, ...).

ALTER TABLE fact ADD COLUMN object_unit TEXT CHECK (object_unit IS NULL OR (object_value IS NOT NULL AND length(object_unit) > 0));

DROP TRIGGER fact_changes_only_by_invalidation_or_purge;
CREATE TRIGGER fact_changes_only_by_invalidation_or_purge BEFORE UPDATE ON fact
WHEN NOT (
      NEW.rowid IS OLD.rowid
  AND NEW.id IS OLD.id
  AND NEW.namespace IS OLD.namespace
  AND NEW.subject_entity_id IS OLD.subject_entity_id
  AND NEW.predicate IS OLD.predicate
  AND NEW.object_entity_id IS OLD.object_entity_id
  AND NEW.confidence IS OLD.confidence
  AND NEW.valid_from IS OLD.valid_from
  AND NEW.valid_to IS OLD.valid_to
  AND NEW.created_at IS OLD.created_at
  AND (
        -- An invalidation: once, and nothing else changes.
        (    OLD.invalidated_at IS NULL AND NEW.invalidated_at IS NOT NULL
         AND NEW.statement IS OLD.statement
         AND NEW.object_value IS OLD.object_value
         AND NEW.object_unit IS OLD.object_unit
         AND NEW.purged_at IS OLD.purged_at)
        -- A purge: once, the text becomes the marker, the unit is cleared, and nothing else changes.
     OR (    OLD.purged_at IS NULL AND NEW.purged_at IS NOT NULL
         AND NEW.statement = '[purged]'
         AND NEW.object_value IS (CASE WHEN OLD.object_value IS NULL THEN NULL ELSE '[purged]' END)
         AND NEW.object_unit IS NULL
         AND NEW.invalidated_at IS OLD.invalidated_at
         AND NEW.superseded_by_fact_id IS OLD.superseded_by_fact_id)
  )
)
BEGIN
  SELECT RAISE(ABORT, 'a fact changes only by being invalidated once, or purged once');
END;
