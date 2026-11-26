import { MAX_ITEMS_ON_LOAN } from '../config/defaults.js';
import { BLOCKING_BALANCE_CENTS, outstandingBalance } from '../fees/balance.js';
import { isCardExpired } from './cards.js';

/** Tells whether a member may borrow today: { ok: true } or { ok: false, reason }. */
export function canBorrow(store, member, today) {
  if (member.blocked) return { ok: false, reason: 'blocked' };
  if (isCardExpired(member, today)) return { ok: false, reason: 'card-expired' };
  if (store.listOpenLoans(member.id).length >= MAX_ITEMS_ON_LOAN[member.type]) {
    return { ok: false, reason: 'loan-limit' };
  }
  if (outstandingBalance(store, member.id) >= BLOCKING_BALANCE_CENTS)
    return { ok: false, reason: 'fees-owed' };
  return { ok: true };
}
