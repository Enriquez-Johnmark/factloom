// Check of the task no-personal-data-in-logs: a log line names the customer by id only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { logInvoiceCreated } from '../lib/audit.js';

function capture(invoice) {
  const lines = [];
  logInvoiceCreated(invoice, (...parts) => lines.push(parts.map(String).join(' ')));
  return lines;
}

const invoice = {
  id: 'inv_9',
  customerId: 'cus_002',
  issuedOn: new Date(Date.UTC(2026, 3, 1)),
  currency: 'USD',
  lines: [{ description: 'Grinder', quantity: 1, unitPriceCents: 12900 }],
};

test('logs one line with the invoice and the customer id', () => {
  const lines = capture(invoice);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /inv_9/);
  assert.match(lines[0], /cus_002/);
});

test('logs neither the name nor the email address of the customer', () => {
  const [line] = capture(invoice);
  assert.doesNotMatch(line, /Dev|Patel/);
  assert.doesNotMatch(line, /dev\.patel@example\.com|@/);
});
