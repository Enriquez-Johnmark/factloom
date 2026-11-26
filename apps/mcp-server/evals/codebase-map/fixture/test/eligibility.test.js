import assert from 'node:assert/strict';
import test from 'node:test';
import { canBorrow } from '../lib/members/eligibility.js';
import { renewCard } from '../lib/members/cards.js';
import { ADA, BEN, BOOK, sampleStore, TODAY } from './sample-library.js';

test('a member in good standing may borrow', () => {
  assert.deepEqual(canBorrow(sampleStore(), ADA, TODAY), { ok: true });
});

test('a member whose card has expired may not borrow', () => {
  assert.deepEqual(canBorrow(sampleStore(), { ...ADA, cardExpiresOn: '2026-11-25' }, TODAY), {
    ok: false,
    reason: 'card-expired',
  });
});

test('a member who owes ten dollars or more may not borrow', () => {
  const fees = [
    { id: 'fee_1', memberId: ADA.id, loanId: 'loan_1', amountCents: 1000, paid: false, waivedReason: null },
  ];
  assert.deepEqual(canBorrow(sampleStore({ fees }), ADA, TODAY), { ok: false, reason: 'fees-owed' });
});

test('a junior member may have at most ten items on loan', () => {
  const loans = Array.from({ length: 10 }, (_, index) => ({
    id: `loan_${index}`,
    itemId: BOOK.id,
    memberId: BEN.id,
    checkedOutOn: '2026-11-20',
    dueOn: '2026-12-11',
    renewals: 0,
    returnedOn: null,
  }));
  assert.deepEqual(canBorrow(sampleStore({ loans }), BEN, TODAY), { ok: false, reason: 'loan-limit' });
});

test('a renewed card lasts three years for an adult and one year for a junior', () => {
  assert.equal(renewCard(ADA, TODAY).cardExpiresOn, '2029-11-26');
  assert.equal(renewCard(BEN, TODAY).cardExpiresOn, '2027-11-26');
});
