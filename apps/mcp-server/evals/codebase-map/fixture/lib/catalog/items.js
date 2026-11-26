/** Tells whether an item may leave the library on loan: it is in service, not missing or withdrawn. */
export function isLendable(item) {
  return item.status === 'in-service';
}

/** Describes an item for a librarian, such as "The Hobbit (book)". */
export function describeItem(item) {
  return `${item.title} (${item.format})`;
}
