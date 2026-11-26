/**
 * Tells whether an item may leave the library on loan: it is in service, not missing or withdrawn,
 * and not a reference item.
 */
export function isLendable(item) {
  return item.status === 'in-service' && item.reference !== true;
}

/** Describes an item for a librarian, such as "The Hobbit (book)". */
export function describeItem(item) {
  return `${item.title} (${item.format})`;
}
