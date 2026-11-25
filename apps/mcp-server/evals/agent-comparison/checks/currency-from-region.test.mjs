// Check of the task currency-from-region: the currency follows the customer's region, never the request.
import assert from 'node:assert/strict';
import test from 'node:test';
import { handle } from '../lib/routes.js';

const lines = [{ description: 'Tamper', quantity: 1, unitPriceCents: 2500 }];

function createFor(body) {
  const response = handle({ method: 'POST', path: '/invoices', body: { lines, ...body } });
  assert.equal(response.status, 201);
  return response.body;
}

test('gives a UK customer GBP even when the request asks for another currency', () => {
  assert.equal(createFor({ customerId: 'cus_004', currency: 'USD' }).currency, 'GBP');
});

test('gives every US region USD', () => {
  assert.equal(createFor({ customerId: 'cus_002' }).currency, 'USD');
  assert.equal(createFor({ customerId: 'cus_005', currency: 'EUR' }).currency, 'USD');
});

test('gives an EU customer EUR', () => {
  assert.equal(createFor({ customerId: 'cus_003', currency: 'GBP' }).currency, 'EUR');
});
