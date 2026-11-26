/** Returns the loans not returned whose due date is before `today`, the longest overdue first. */
export function listOverdueLoans(store, today) {
  return store
    .listAllLoans()
    .filter((loan) => loan.returnedOn === null && loan.dueOn < today)
    .sort((first, second) => first.dueOn.localeCompare(second.dueOn));
}
