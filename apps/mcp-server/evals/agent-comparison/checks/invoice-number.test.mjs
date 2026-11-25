// Check of the task invoice-number: INV, the year, and a six-digit sequence padded with zeros.
import assert from 'node:assert/strict';
import test from 'node:test';
import { formatInvoiceNumber } from '../lib/invoices.js';

test('prints an invoice number as INV, the year and a six-digit sequence', () => {
  assert.equal(formatInvoiceNumber(2026, 123), 'INV-2026-000123');
  assert.equal(formatInvoiceNumber(2027, 5), 'INV-2027-000005');
  assert.equal(formatInvoiceNumber(2026, 654321), 'INV-2026-654321');
});
