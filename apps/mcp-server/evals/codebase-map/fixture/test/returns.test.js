import assert from 'node:assert/strict';
import test from 'node:test';
import { returnItem } from '../lib/circulation/returns.js';
import { ADA, BEN, BOOK, sampleLoan, sampleStore } from './sample-library.js';

const loan = sampleLoan({
  id: 'loan_1',
  item: BOOK,
  member: ADA,
  checkedOutOn: '2026-10-29',
  dueOn: '2026-11-19',
});

test('closes the loan of a returned item', () => {
  const store = sampleStore({ loans: [loan] });
  const result = returnItem(store, { barcode: BOOK.barcode, today: '2026-11-18' });
  assert.equal(result.ok, true);
  assert.equal(store.getLoan('loan_1').returnedOn, '2026-11-18');
  assert.equal(store.findOpenLoan(BOOK.id), undefined);
});

test('charges the late fee of a late return to the member', () => {
  const store = sampleStore({ loans: [loan] });
  const result = returnItem(store, { barcode: BOOK.barcode, today: '2026-11-26' });
  assert.equal(result.feeCents, 175);
  assert.deepEqual(
    store.listFees(ADA.id).map((fee) => fee.amountCents),
    [175],
  );
});

test('makes the next hold ready, and gives its notice', () => {
  const hold = {
    id: 'hold_1',
    itemId: BOOK.id,
    memberId: BEN.id,
    pickupBranchId: 'central',
    placedOn: '2026-11-02',
    status: 'waiting',
    readyOn: null,
  };
  const store = sampleStore({ loans: [loan], holds: [hold] });
  const result = returnItem(store, { barcode: BOOK.barcode, today: '2026-11-18' });
  assert.equal(store.listHolds(BOOK.id)[0].status, 'ready');
  assert.equal(result.notice.channel, 'sms');
});

test('refuses an item that is not on loan', () => {
  const result = returnItem(sampleStore(), { barcode: BOOK.barcode, today: '2026-11-18' });
  assert.deepEqual(result, { ok: false, reason: 'not-on-loan' });
});
