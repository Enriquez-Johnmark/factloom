// Resolution of entity identifiers through merges (FL-052), as SQL fragments. A merge in force
// is a row of entity_merge whose undone_at is NULL. No entity or fact row is rewritten: a read
// widens an entity filter to every identifier that resolves to the same entity. These are the
// only places the rule is written; every fragment filters on @namespace.

/** The entity an identifier, given as an SQL expression, resolves to: the one it was merged into, or itself. */
export function resolvedEntityId(id: string): string {
  return `COALESCE((SELECT m.into_entity_id FROM entity_merge m
    WHERE m.namespace = @namespace AND m.from_entity_id = ${id} AND m.undone_at IS NULL), ${id})`;
}

/** A SELECT of every identifier that resolves to the same entity as the one given as an SQL expression. */
export function sameEntityIds(id: string): string {
  const resolved = resolvedEntityId(id);
  return `SELECT ${id} UNION SELECT ${resolved}
    UNION SELECT m.from_entity_id FROM entity_merge m
    WHERE m.namespace = @namespace AND m.undone_at IS NULL AND m.into_entity_id = ${resolved}`;
}

/** A SELECT of every identifier that resolves to the same entity as any in a JSON array parameter. */
export function sameEntityIdsOfArray(parameter: string): string {
  const asked = `SELECT value FROM json_each(${parameter})`;
  const resolved = `SELECT value FROM json_each(${parameter}) UNION SELECT m.into_entity_id FROM entity_merge m
    WHERE m.namespace = @namespace AND m.undone_at IS NULL AND m.from_entity_id IN (${asked})`;
  return `${resolved}
    UNION SELECT m.from_entity_id FROM entity_merge m
    WHERE m.namespace = @namespace AND m.undone_at IS NULL AND m.into_entity_id IN (${resolved})`;
}
