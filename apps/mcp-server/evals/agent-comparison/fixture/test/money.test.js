import assert from 'node:assert/strict';
import test from 'node:test';
import { addCents, formatCents } from '../lib/money.js';

test('adds amounts in cents', () => {
  assert.equal(addCents(150, 250, 5), 405);
});

test('formats cents with two decimals and the currency', () => {
  assert.equal(formatCents(1205, 'EUR'), '12.05 EUR');
  assert.equal(formatCents(-50, 'GBP'), '-0.50 GBP');
});
