import assert from 'node:assert/strict';
import test from 'node:test';
import { handle } from '../lib/routes.js';

test('lists the invoices with their totals', () => {
  const response = handle({ method: 'GET', path: '/invoices' });
  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.invoices.map((invoice) => [invoice.id, invoice.totalCents]),
    [
      ['inv_1', 3700],
      ['inv_2', 14250],
    ],
  );
});

test('creates an invoice for a known customer', () => {
  const lines = [{ description: 'Tamper', quantity: 1, unitPriceCents: 2500 }];
  const response = handle({ method: 'POST', path: '/invoices', body: { customerId: 'cus_003', lines } });
  assert.equal(response.status, 201);
  assert.equal(response.body.totalCents, 2500);
});

test('refuses an invoice for an unknown customer', () => {
  const response = handle({ method: 'POST', path: '/invoices', body: { customerId: 'cus_999', lines: [] } });
  assert.equal(response.status, 400);
});
