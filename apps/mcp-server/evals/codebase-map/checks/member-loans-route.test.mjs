// Check of the task member-loans-route: GET /members/:id/loans lists the member's loans not yet
// returned, the earliest due first, and answers 404 member-not-found for an unknown member.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../lib/server/app.js';
import { createStore } from '../lib/store/memory-store.js';

function book(id, title) {
  return {
    id,
    barcode: '31234000000065',
    title,
    author: 'Check Author',
    format: 'book',
    branchId: 'central',
    status: 'in-service',
    replacementCostCents: 1500,
  };
}
function loan(id, itemId, dueOn, returnedOn = null) {
  return { id, itemId, memberId: 'mem_check', checkedOutOn: '2026-10-20', dueOn, renewals: 0, returnedOn };
}

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

function get(path) {
  const store = createStore({
    items: [
      book('itm_middlemarch', 'Middlemarch'),
      book('itm_beloved', 'Beloved'),
      book('itm_kindred', 'Kindred'),
    ],
    members: [member],
    loans: [
      loan('loan_middlemarch', 'itm_middlemarch', '2026-12-01'),
      loan('loan_kindred', 'itm_kindred', '2026-11-10', '2026-11-09'),
      loan('loan_beloved', 'itm_beloved', '2026-11-20'),
    ],
  });
  return createApp(store).handle({ method: 'GET', path, query: {}, body: null, today: '2026-11-26' });
}

test('lists the loans the member has not returned, the earliest due first, with whether each is overdue', () => {
  const response = get('/members/mem_check/loans');
  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.loans.map(({ loanId, title, dueOn, overdue }) => ({ loanId, title, dueOn, overdue })),
    [
      { loanId: 'loan_beloved', title: 'Beloved', dueOn: '2026-11-20', overdue: true },
      { loanId: 'loan_middlemarch', title: 'Middlemarch', dueOn: '2026-12-01', overdue: false },
    ],
  );
});

test('answers 404 with the code member-not-found for a member nobody is', () => {
  const response = get('/members/mem_nobody/loans');
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'member-not-found');
});
