import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../lib/server/app.js';
import { ADA, BOOK, DVD, sampleLoan, sampleStore, TODAY } from './sample-library.js';

function request(method, path, { body = null, query = {} } = {}) {
  return { method, path, query, body, today: TODAY };
}

test('POST /checkouts lends an item', () => {
  const app = createApp(sampleStore());
  const response = app.handle(
    request('POST', '/checkouts', { body: { barcode: BOOK.barcode, memberId: ADA.id } }),
  );
  assert.equal(response.status, 201);
  assert.equal(response.body.loan.dueOn, '2026-12-17');
});

test('POST /checkouts refuses a barcode with a wrong check digit', () => {
  const app = createApp(sampleStore());
  const response = app.handle(
    request('POST', '/checkouts', { body: { barcode: '31234000000017', memberId: ADA.id } }),
  );
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'invalid-barcode');
});

test('POST /loans/:id/renew answers a refusal with its reason as the error code', () => {
  const loan = sampleLoan({
    id: 'loan_1',
    item: DVD,
    member: ADA,
    checkedOutOn: '2026-11-01',
    dueOn: '2026-11-08',
  });
  const app = createApp(sampleStore({ loans: [loan] }));
  const response = app.handle(request('POST', '/loans/loan_1/renew'));
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'overdue');
});

test('GET /members/:id/summary gives the loans and the balance of a member', () => {
  const loan = sampleLoan({
    id: 'loan_1',
    item: BOOK,
    member: ADA,
    checkedOutOn: '2026-11-20',
    dueOn: '2026-12-11',
  });
  const fees = [
    { id: 'fee_1', memberId: ADA.id, loanId: 'loan_0', amountCents: 250, paid: false, waivedReason: null },
  ];
  const app = createApp(sampleStore({ loans: [loan], fees }));
  const response = app.handle(request('GET', `/members/${ADA.id}/summary`));
  assert.equal(response.status, 200);
  assert.equal(response.body.loanCount, 1);
  assert.equal(response.body.balance, '$2.50');
});

test('GET /catalog searches the catalog', () => {
  const app = createApp(sampleStore());
  const response = app.handle(request('GET', '/catalog', { query: { q: 'spirited' } }));
  assert.deepEqual(
    response.body.items.map((item) => item.id),
    [DVD.id],
  );
});

test('an unknown route answers 404', () => {
  const response = createApp(sampleStore()).handle(request('GET', '/nowhere'));
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'route-not-found');
});
