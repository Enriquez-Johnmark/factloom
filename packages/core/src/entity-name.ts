/**
 * The form of an entity name that stores match on: lower case, trimmed, with each run of
 * white space collapsed to one space. Every store uses this, so they all agree on which
 * names are the same.
 */
export function normaliseEntityName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
