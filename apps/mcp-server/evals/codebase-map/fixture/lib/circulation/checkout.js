import { normaliseBarcode } from '../catalog/barcodes.js';
import { isLendable } from '../catalog/items.js';
import { branchById } from '../config/branches.js';
import { canBorrow } from '../members/eligibility.js';
import { computeDueDate } from './due-dates.js';

/** Lends an item to a member. Returns { ok: true, loan } or { ok: false, reason }. */
export function checkOutItem(store, { barcode, memberId, today }) {
  const item = store.findItemByBarcode(normaliseBarcode(barcode));
  if (item === undefined) return { ok: false, reason: 'unknown-item' };
  const member = store.getMember(memberId);
  if (member === undefined) return { ok: false, reason: 'unknown-member' };
  if (!isLendable(item)) return { ok: false, reason: 'not-lendable' };
  if (store.findOpenLoan(item.id) !== undefined) return { ok: false, reason: 'on-loan' };
  if (findBlockingHold(store, item.id, member.id) !== null) return { ok: false, reason: 'on-hold' };
  const eligibility = canBorrow(store, member, today);
  if (!eligibility.ok) return eligibility;
  const loan = store.saveLoan({
    itemId: item.id,
    memberId: member.id,
    checkedOutOn: today,
    dueOn: computeDueDate({ checkedOutOn: today, format: item.format, branch: branchById(item.branchId) }),
    renewals: 0,
    returnedOn: null,
  });
  for (const hold of store.listHolds(item.id)) {
    if (hold.memberId === member.id && hold.status !== 'expired') {
      store.saveHold({ ...hold, status: 'collected' });
    }
  }
  return { ok: true, loan };
}

/** Returns the hold of another member that keeps an item from being lent, or null when none does. */
export function findBlockingHold(store, itemId, memberId) {
  const active = store
    .listHolds(itemId)
    .filter((hold) => hold.status === 'waiting' || hold.status === 'ready');
  return active.find((hold) => hold.memberId !== memberId) ?? null;
}
