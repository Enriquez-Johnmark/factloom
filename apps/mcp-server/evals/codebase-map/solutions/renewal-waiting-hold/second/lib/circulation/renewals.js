import { branchById } from '../config/branches.js';
import { LOAN_RULES } from '../config/defaults.js';
import { computeDueDate } from './due-dates.js';

/**
 * Renews a loan from today for a new loan period. Returns { ok: true, loan } or
 * { ok: false, reason }.
 */
export function renewLoan(store, { loanId, today }) {
  const loan = store.getLoan(loanId);
  if (loan === undefined || loan.returnedOn !== null) return { ok: false, reason: 'unknown-loan' };
  if (loan.dueOn < today) return { ok: false, reason: 'overdue' };
  if (isHeldForAnother(store, loan)) return { ok: false, reason: 'on-hold' };
  const item = store.getItem(loan.itemId);
  if (loan.renewals >= LOAN_RULES[item.format].maxRenewals) return { ok: false, reason: 'renewal-limit' };
  const dueOn = computeDueDate({
    checkedOutOn: today,
    format: item.format,
    branch: branchById(item.branchId),
  });
  return { ok: true, loan: store.saveLoan({ ...loan, renewals: loan.renewals + 1, dueOn }) };
}

function isHeldForAnother(store, loan) {
  return store
    .listHolds(loan.itemId)
    .some(
      (hold) => hold.memberId !== loan.memberId && (hold.status === 'waiting' || hold.status === 'ready'),
    );
}
