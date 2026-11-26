import assert from 'node:assert/strict';
import test from 'node:test';
import { assessLateFee } from '../lib/fees/assess.js';
import { outstandingBalance } from '../lib/fees/balance.js';
import { payFee } from '../lib/fees/payments.js';
import { waiveFee } from '../lib/fees/waivers.js';
import { ADA, BOOK, CY, DVD, sampleLoan, sampleStore } from './sample-library.js';

const loan = sampleLoan({
  id: 'loan_1',
  item: BOOK,
  member: ADA,
  checkedOutOn: '2026-10-29',
  dueOn: '2026-11-19',
});

test('charges nothing for an item returned within the grace day', () => {
  assert.equal(assessLateFee({ loan, item: BOOK, member: ADA, returnedOn: '2026-11-20' }), 0);
});

test('charges the daily rate of the format for each day late', () => {
  assert.equal(assessLateFee({ loan, item: BOOK, member: ADA, returnedOn: '2026-11-26' }), 175);
  assert.equal(assessLateFee({ loan, item: DVD, member: ADA, returnedOn: '2026-11-26' }), 700);
});

test('charges staff nothing', () => {
  assert.equal(assessLateFee({ loan, item: BOOK, member: CY, returnedOn: '2026-11-26' }), 0);
});

test('a member owes the sum of their unpaid fees', () => {
  const fees = [
    { id: 'fee_1', memberId: ADA.id, loanId: 'loan_1', amountCents: 175, paid: false, waivedReason: null },
    { id: 'fee_2', memberId: ADA.id, loanId: 'loan_2', amountCents: 400, paid: false, waivedReason: null },
  ];
  const store = sampleStore({ fees });
  assert.equal(outstandingBalance(store, ADA.id), 575);
  payFee(store, 'fee_2', '2026-11-26');
  assert.equal(outstandingBalance(store, ADA.id), 175);
});

test('waives a fee only for a known reason', () => {
  const fees = [
    { id: 'fee_1', memberId: ADA.id, loanId: 'loan_1', amountCents: 175, paid: false, waivedReason: null },
  ];
  const store = sampleStore({ fees });
  assert.throws(() => waiveFee(store, 'fee_1', 'asked nicely'), /Unknown waiver reason/);
  assert.equal(waiveFee(store, 'fee_1', 'staff-error').waivedReason, 'staff-error');
});
