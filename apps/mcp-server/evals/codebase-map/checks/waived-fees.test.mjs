// Check of the task waived-fees: a waived fee neither stops a member from borrowing nor counts in
// the balance of their account summary; an unpaid fee that was not waived still does both.
import assert from 'node:assert/strict';
import test from 'node:test';
import { waiveFee } from '../lib/fees/waivers.js';
import { canBorrow } from '../lib/members/eligibility.js';
import { createApp } from '../lib/server/app.js';
import { createStore } from '../lib/store/memory-store.js';

const member = {
  id: 'mem_check',
  name: 'Check Member',
  email: 'check@example.org',
  phone: '+15550109999',
  notify: 'email',
  type: 'adult',
  cardNumber: '21234000567890',
  cardExpiresOn: '2028-01-31',
  homeBranchId: 'central',
  blocked: false,
};

function libraryOwing() {
  const fee = {
    id: 'fee_check',
    memberId: member.id,
    loanId: 'loan_old',
    amountCents: 1500,
    paid: false,
    waivedReason: null,
  };
  return createStore({ members: [member], fees: [fee] });
}

function summaryOf(store) {
  const request = {
    method: 'GET',
    path: `/members/${member.id}/summary`,
    query: {},
    body: null,
    today: '2026-11-26',
  };
  return createApp(store).handle(request).body;
}

test('a member whose only fee was waived may borrow', () => {
  const store = libraryOwing();
  waiveFee(store, 'fee_check', 'hardship');
  assert.deepEqual(canBorrow(store, member, '2026-11-26'), { ok: true });
});

test('the account summary does not count a waived fee as owed', () => {
  const store = libraryOwing();
  waiveFee(store, 'fee_check', 'hardship');
  assert.equal(summaryOf(store).balanceCents, 0);
});

test('a fee that was not waived still stops a member from borrowing', () => {
  const store = libraryOwing();
  assert.deepEqual(canBorrow(store, member, '2026-11-26'), { ok: false, reason: 'fees-owed' });
  assert.equal(summaryOf(store).balanceCents, 1500);
});
