// Resolution of entity identifiers through merges (FL-052, FL-063), as SQL fragments. A merge
// in force is a row of entity_merge whose undone_at is NULL. No entity or fact row is
// rewritten: a read widens an entity filter to every identifier that resolves to the same
// entity, through the whole chain of merges, in one recursive query. Chains are finite
// because a merge that would make a cycle is refused. These are the only places the rule is
// written; every fragment filters on @namespace.

const IN_FORCE = 'm.namespace = @namespace AND m.undone_at IS NULL';

/** Whether an identifier, given as an SQL expression, is the end of its chain: merged into nothing. */
function isEndOfChain(id: string): string {
  return `NOT EXISTS (SELECT 1 FROM entity_merge m WHERE ${IN_FORCE} AND m.from_entity_id = ${id})`;
}

/** A SELECT of the identifiers given, and every entity they were merged into, step by step. */
function chainUp(start: string): string {
  return `chain(id) AS (${start}
    UNION SELECT m.into_entity_id FROM entity_merge m JOIN chain ON m.from_entity_id = chain.id WHERE ${IN_FORCE})`;
}

/** A SELECT of the ends of the chains, and every entity merged into them, step by step. */
const CHAIN_DOWN = `down(id) AS (SELECT c.id FROM chain c WHERE ${isEndOfChain('c.id')}
    UNION SELECT m.from_entity_id FROM entity_merge m JOIN down ON m.into_entity_id = down.id WHERE ${IN_FORCE})`;

/** A SELECT of every identifier that resolves to the same entity as the one given as an SQL expression. */
export function sameEntityIds(id: string): string {
  return `WITH RECURSIVE ${chainUp(`SELECT ${id}`)}, ${CHAIN_DOWN} SELECT id FROM down UNION SELECT ${id}`;
}

/** A SELECT of every identifier that resolves to the same entity as any in a JSON array parameter. */
export function sameEntityIdsOfArray(parameter: string): string {
  const asked = `SELECT value FROM json_each(${parameter})`;
  return `WITH RECURSIVE ${chainUp(asked)}, ${CHAIN_DOWN} SELECT id FROM down UNION ${asked}`;
}

/** The entity an identifier, given as an SQL expression, resolves to: the end of its chain. */
export function resolvedEntityId(id: string): string {
  return `(WITH RECURSIVE ${chainUp(`SELECT ${id}`)} SELECT c.id FROM chain c WHERE ${isEndOfChain('c.id')})`;
}

/** For each identifier of a JSON array parameter that is merged, the entity it resolves to. */
export function resolveEntityIdsOfArray(parameter: string): string {
  return `WITH RECURSIVE chain(start, id) AS (SELECT value, value FROM json_each(${parameter})
    UNION SELECT chain.start, m.into_entity_id FROM entity_merge m JOIN chain ON m.from_entity_id = chain.id WHERE ${IN_FORCE})
    SELECT c.start AS from_entity_id, c.id AS into_entity_id FROM chain c
    WHERE c.id <> c.start AND ${isEndOfChain('c.id')}`;
}
