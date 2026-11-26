import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOutItem } from '../lib/circulation/checkout.js';
import { ADA, BEN, BOOK, sampleLoan, sampleStore, TODAY } from './sample-library.js';

test('lends an item and gives the loan its due date', () => {
  const store = sampleStore();
  const result = checkOutItem(store, { barcode: BOOK.barcode, memberId: ADA.id, today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(result.loan.dueOn, '2026-12-17');
  assert.equal(store.findOpenLoan(BOOK.id).memberId, ADA.id);
});

test('reads a barcode with spaces and dashes in it', () => {
  const result = checkOutItem(sampleStore(), {
    barcode: '3123-4000 0000 16',
    memberId: ADA.id,
    today: TODAY,
  });
  assert.equal(result.ok, true);
});

test('refuses an item that is already on loan', () => {
  const loan = sampleLoan({
    id: 'loan_9',
    item: BOOK,
    member: BEN,
    checkedOutOn: '2026-11-20',
    dueOn: '2026-12-11',
  });
  const result = checkOutItem(sampleStore({ loans: [loan] }), {
    barcode: BOOK.barcode,
    memberId: ADA.id,
    today: TODAY,
  });
  assert.deepEqual(result, { ok: false, reason: 'on-loan' });
});

test('refuses an item that is held for another member', () => {
  const hold = {
    id: 'hold_1',
    itemId: BOOK.id,
    memberId: BEN.id,
    pickupBranchId: 'central',
    placedOn: '2026-11-01',
    status: 'ready',
    readyOn: '2026-11-25',
  };
  const result = checkOutItem(sampleStore({ holds: [hold] }), {
    barcode: BOOK.barcode,
    memberId: ADA.id,
    today: TODAY,
  });
  assert.deepEqual(result, { ok: false, reason: 'on-hold' });
});

test('lends a held item to the member who holds it, and marks the hold collected', () => {
  const hold = {
    id: 'hold_1',
    itemId: BOOK.id,
    memberId: ADA.id,
    pickupBranchId: 'central',
    placedOn: '2026-11-01',
    status: 'ready',
    readyOn: '2026-11-25',
  };
  const store = sampleStore({ holds: [hold] });
  const result = checkOutItem(store, { barcode: BOOK.barcode, memberId: ADA.id, today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(store.listHolds(BOOK.id)[0].status, 'collected');
});

test('refuses an item that is withdrawn', () => {
  const withdrawn = { ...BOOK, id: 'itm_old', barcode: '31234000000057', status: 'withdrawn' };
  const store = sampleStore({ items: [withdrawn] });
  const result = checkOutItem(store, { barcode: withdrawn.barcode, memberId: ADA.id, today: TODAY });
  assert.deepEqual(result, { ok: false, reason: 'not-lendable' });
});
