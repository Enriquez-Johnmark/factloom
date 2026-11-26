/** A member who owes at least this many cents may not borrow until they pay. */
export const BLOCKING_BALANCE_CENTS = 1000;

/** Returns what a member owes, in cents: the sum of their unpaid fees. */
export function outstandingBalance(store, memberId) {
  return store
    .listFees(memberId)
    .filter((fee) => !fee.paid)
    .reduce((sum, fee) => sum + fee.amountCents, 0);
}
