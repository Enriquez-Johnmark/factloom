import { normaliseBarcode } from '../catalog/barcodes.js';
import { assessLateFee } from '../fees/assess.js';
import { holdReadyNotice } from '../holds/notify.js';
import { fulfilNextHold } from '../holds/queue.js';

/**
 * Takes an item back: closes its loan, charges any late fee and readies the next hold for it.
 * Returns { ok: true, loan, feeCents, notice } or { ok: false, reason }; notice is null when
 * nobody was waiting for the item.
 */
export function returnItem(store, { barcode, today }) {
  const item = store.findItemByBarcode(normaliseBarcode(barcode));
  if (item === undefined) return { ok: false, reason: 'unknown-item' };
  const loan = store.findOpenLoan(item.id);
  if (loan === undefined) return { ok: false, reason: 'not-on-loan' };
  const closed = store.saveLoan({ ...loan, returnedOn: today });
  const member = store.getMember(loan.memberId);
  const feeCents = assessLateFee({ loan, item, member, returnedOn: today });
  if (feeCents > 0) {
    store.saveFee({
      memberId: member.id,
      loanId: loan.id,
      amountCents: feeCents,
      paid: false,
      waivedReason: null,
    });
  }
  const hold = fulfilNextHold(store, item.id, today);
  return { ok: true, loan: closed, feeCents, notice: hold === null ? null : holdReadyNotice(store, hold) };
}
