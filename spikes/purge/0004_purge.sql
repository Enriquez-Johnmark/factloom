-- Draft of the purge migration that FL-061 will write, for the spike only. It is applied on
-- top of the project's migrations, unchanged. Purged text becomes the marker '[purged]':
-- fact.statement, fact.object_value when the object is a value, and source.content when it
-- was kept. source.locator and source.content_hash are cleared to NULL.

ALTER TABLE fact ADD COLUMN purged_at TEXT CHECK (purged_at IS NULL OR purged_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z');
ALTER TABLE source ADD COLUMN purged_at TEXT CHECK (purged_at IS NULL OR purged_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z');

-- A fact changes only by being invalidated once, or by being purged once. The old trigger
-- does not name purged_at, so it would let an invalidation set it: it is replaced, not kept.
DROP TRIGGER fact_changes_only_by_invalidation;
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
         AND NEW.purged_at IS OLD.purged_at)
        -- A purge: once, the text becomes the marker, and nothing else changes.
     OR (    OLD.purged_at IS NULL AND NEW.purged_at IS NOT NULL
         AND NEW.statement = '[purged]'
         AND NEW.object_value IS (CASE WHEN OLD.object_value IS NULL THEN NULL ELSE '[purged]' END)
         AND NEW.invalidated_at IS OLD.invalidated_at
         AND NEW.superseded_by_fact_id IS OLD.superseded_by_fact_id)
  )
)
BEGIN
  SELECT RAISE(ABORT, 'a fact changes only by being invalidated once, or purged once');
END;

-- A source changes only by being purged once: its content becomes the marker, and its hash
-- and locator are cleared.
DROP TRIGGER source_never_updated;
CREATE TRIGGER source_changes_only_by_purge BEFORE UPDATE ON source
WHEN NOT (
      OLD.purged_at IS NULL AND NEW.purged_at IS NOT NULL
  AND NEW.content IS (CASE WHEN OLD.content IS NULL THEN NULL ELSE '[purged]' END)
  AND NEW.content_hash IS NULL AND NEW.locator IS NULL
  AND NEW.rowid IS OLD.rowid
  AND NEW.id IS OLD.id
  AND NEW.namespace IS OLD.namespace
  AND NEW.kind IS OLD.kind
  AND NEW.version IS OLD.version
  AND NEW.observed_at IS OLD.observed_at
  AND NEW.created_at IS OLD.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'a source changes only by being purged once');
END;

-- The keyword entry is removed in the step that replaces the text: the trigger has the old
-- text in OLD.statement, which an external-content FTS5 'delete' needs.
CREATE TRIGGER fact_fts_purge AFTER UPDATE OF purged_at ON fact
WHEN OLD.purged_at IS NULL AND NEW.purged_at IS NOT NULL
BEGIN
  INSERT INTO fact_fts (fact_fts, rowid, statement) VALUES ('delete', OLD.rowid, OLD.statement);
END;

-- A vector is removed only when its fact has been purged.
-- FTS5 removes a deleted entry's terms from the index itself, not only from search results.
-- The option is stored in fact_fts_config, so it holds for every later connection.
INSERT INTO fact_fts (fact_fts, rank) VALUES ('secure-delete', 1);

CREATE TRIGGER fact_embedding_removed_only_by_purge BEFORE DELETE ON fact_embedding
WHEN NOT EXISTS (SELECT 1 FROM fact f WHERE f.id = OLD.fact_id AND f.purged_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'a vector is removed only when its fact is purged');
END;
