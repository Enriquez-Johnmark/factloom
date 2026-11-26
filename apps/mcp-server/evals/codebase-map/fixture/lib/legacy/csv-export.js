// The nightly export of loans for the county's statistics office, in the columns it still asks for.

/** Returns the loans as CSV text: a header line, then one line per loan in id order. */
export function exportLoansCsv(store) {
  const lines = store
    .listAllLoans()
    .sort((first, second) => first.id.localeCompare(second.id))
    .map((loan) => [loan.id, loan.itemId, loan.memberId, loan.checkedOutOn, loan.returnedOn ?? ''].join(','));
  return ['loan,item,member,out,back', ...lines].join('\n');
}
