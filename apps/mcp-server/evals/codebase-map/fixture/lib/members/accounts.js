/** Returns the member who holds this library card number, or undefined when nobody does. */
export function findMemberByCard(store, cardNumber) {
  return store.listMembers().find((member) => member.cardNumber === cardNumber);
}

/** Returns the name to greet a member by: their preferred name when they gave one. */
export function displayName(member) {
  return member.preferredName ?? member.name;
}
