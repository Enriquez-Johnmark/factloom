import { BRANCHES } from '../config/branches.js';

/** Returns, for each branch, how many of its items are on loan now: { [branchId]: count }. */
export function countLoansByBranch(store) {
  const counts = Object.fromEntries(BRANCHES.map((branch) => [branch.id, 0]));
  for (const loan of store.listAllLoans()) {
    if (loan.returnedOn !== null) continue;
    const item = store.getItem(loan.itemId);
    counts[item.branchId] += 1;
  }
  return counts;
}
