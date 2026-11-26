// Check of the task late-fee-cap: a late fee is never more than the item's replacement cost. The
// module is imported from where the teammate's rename put it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { assessLateFee } from '../lib/fees/overdue-charges.js';

const adult = { id: 'mem_check', name: 'Check Adult', type: 'adult' };
const laptop = { id: 'itm_check_laptop', format: 'laptop', replacementCostCents: 30_000 };
const book = { id: 'itm_check_book', format: 'book', replacementCostCents: 2_000 };

function loanOf(item) {
  return { id: 'loan_check', itemId: item.id, memberId: adult.id, dueOn: '2026-08-20', returnedOn: null };
}

test('charges at most the replacement cost of an item returned months late', () => {
  const fee = assessLateFee({ loan: loanOf(laptop), item: laptop, member: adult, returnedOn: '2026-11-20' });
  assert.equal(fee, 30_000);
});

test('still charges the daily rate when it stays below the replacement cost', () => {
  const fee = assessLateFee({ loan: loanOf(book), item: book, member: adult, returnedOn: '2026-08-30' });
  assert.equal(fee, 250);
});
