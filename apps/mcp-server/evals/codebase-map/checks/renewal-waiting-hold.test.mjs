// Check of the task renewal-waiting-hold: a loan is not renewed while another member's hold on
// its item is waiting or ready, and is renewed when the only hold has expired.
import assert from 'node:assert/strict';
import test from 'node:test';
import { renewLoan } from '../lib/circulation/renewals.js';
import { createStore } from '../lib/store/memory-store.js';

const book = {
  id: 'itm_check',
  barcode: '31234000000065',
  title: 'Middlemarch',
  author: 'George Eliot',
  format: 'book',
  branchId: 'central',
  status: 'in-service',
  replacementCostCents: 1500,
};
const loan = {
  id: 'loan_check',
  itemId: book.id,
  memberId: 'mem_borrower',
  checkedOutOn: '2026-11-10',
  dueOn: '2026-12-01',
  renewals: 0,
  returnedOn: null,
};

function storeWithHold(status) {
  const hold = {
    id: 'hold_check',
    itemId: book.id,
    memberId: 'mem_waiting',
    pickupBranchId: 'central',
    placedOn: '2026-11-15',
    status,
    readyOn: status === 'waiting' ? null : '2026-11-20',
  };
  return createStore({ items: [book], loans: [loan], holds: [hold] });
}

test("refuses a renewal while another member's hold is waiting", () => {
  const store = storeWithHold('waiting');
  const result = renewLoan(store, { loanId: loan.id, today: '2026-11-26' });
  assert.deepEqual(result, { ok: false, reason: 'on-hold' });
  assert.equal(store.getLoan(loan.id).dueOn, '2026-12-01');
  assert.equal(store.getLoan(loan.id).renewals, 0);
});

test("refuses a renewal while another member's hold is ready for pickup", () => {
  const result = renewLoan(storeWithHold('ready'), { loanId: loan.id, today: '2026-11-26' });
  assert.deepEqual(result, { ok: false, reason: 'on-hold' });
});

test('renews a loan whose only hold has expired', () => {
  const result = renewLoan(storeWithHold('expired'), { loanId: loan.id, today: '2026-11-26' });
  assert.equal(result.ok, true);
});
