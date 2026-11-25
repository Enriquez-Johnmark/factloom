// Check of the task wholesale-tax: a wholesale customer is never charged tax.
import assert from 'node:assert/strict';
import test from 'node:test';
import { invoiceTotalWithTax } from '../lib/invoices.js';

function invoiceFor(customerId) {
  return {
    id: 'inv_check',
    customerId,
    issuedOn: new Date(Date.UTC(2026, 3, 1)),
    currency: 'EUR',
    lines: [{ description: 'Espresso beans, 1 kg', quantity: 4, unitPriceCents: 2500 }],
  };
}

test('adds the region tax for a retail customer', () => {
  assert.equal(invoiceTotalWithTax(invoiceFor('cus_003')), 12000);
  assert.equal(invoiceTotalWithTax(invoiceFor('cus_002')), 10725);
});

test('adds no tax for a wholesale customer', () => {
  assert.equal(invoiceTotalWithTax(invoiceFor('cus_001')), 10000);
  assert.equal(invoiceTotalWithTax(invoiceFor('cus_005')), 10000);
});
