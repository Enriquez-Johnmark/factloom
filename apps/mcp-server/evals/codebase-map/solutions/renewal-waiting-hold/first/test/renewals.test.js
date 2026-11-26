import assert from 'node:assert/strict';
import test from 'node:test';
import { renewLoan } from '../lib/circulation/renewals.js';
import { ADA, BOOK, DVD, sampleLoan, sampleStore, TODAY } from './sample-library.js';

test('renews a loan from today for a new loan period', () => {
  const loan = sampleLoan({
    id: 'loan_1',
    item: BOOK,
    member: ADA,
    checkedOutOn: '2026-11-10',
    dueOn: '2026-12-01',
  });
  const store = sampleStore({ loans: [loan] });
  const result = renewLoan(store, { loanId: 'loan_1', today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(result.loan.dueOn, '2026-12-17');
  assert.equal(store.getLoan('loan_1').renewals, 1);
});

test('refuses a renewal once a book has been renewed twice', () => {
  const loan = sampleLoan({
    id: 'loan_1',
    item: BOOK,
    member: ADA,
    checkedOutOn: '2026-10-01',
    dueOn: '2026-12-01',
    renewals: 2,
  });
  const result = renewLoan(sampleStore({ loans: [loan] }), { loanId: 'loan_1', today: TODAY });
  assert.deepEqual(result, { ok: false, reason: 'renewal-limit' });
});

test('renews a DVD at most twice', () => {
  const loan = sampleLoan({
    id: 'loan_1',
    item: DVD,
    member: ADA,
    checkedOutOn: '2026-11-20',
    dueOn: '2026-11-27',
  });
  const store = sampleStore({ loans: [loan] });
  assert.equal(renewLoan(store, { loanId: 'loan_1', today: TODAY }).ok, true);
  assert.equal(renewLoan(store, { loanId: 'loan_1', today: TODAY }).ok, true);
  assert.deepEqual(renewLoan(store, { loanId: 'loan_1', today: TODAY }), {
    ok: false,
    reason: 'renewal-limit',
  });
});

test('refuses to renew an overdue loan', () => {
  const loan = sampleLoan({
    id: 'loan_1',
    item: BOOK,
    member: ADA,
    checkedOutOn: '2026-10-29',
    dueOn: '2026-11-19',
  });
  const result = renewLoan(sampleStore({ loans: [loan] }), { loanId: 'loan_1', today: TODAY });
  assert.deepEqual(result, { ok: false, reason: 'overdue' });
});
