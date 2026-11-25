// Check of the task refund-rounding: a partial refund is rounded down to the whole cent.
import assert from 'node:assert/strict';
import test from 'node:test';
import { computeRefund } from '../lib/refunds.js';

test('rounds a partial refund down to the whole cent', () => {
  assert.equal(computeRefund(199, 50), 99);
  assert.equal(computeRefund(333, 75), 249);
  assert.equal(computeRefund(2999, 33), 989);
});

test('refunds an exact amount unchanged', () => {
  assert.equal(computeRefund(1000, 10), 100);
  assert.equal(computeRefund(1000, 100), 1000);
});
