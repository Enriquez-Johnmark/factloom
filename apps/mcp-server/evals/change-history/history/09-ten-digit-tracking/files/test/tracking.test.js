import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidTrackingNumber, newTrackingNumber } from '../lib/tracking.js';

test('accepts the tracking numbers it issues', () => {
  assert.ok(isValidTrackingNumber(newTrackingNumber(1)));
  assert.ok(isValidTrackingNumber(newTrackingNumber(48_213)));
});

test('issues tracking numbers for sequence numbers above one hundred million', () => {
  assert.ok(isValidTrackingNumber(newTrackingNumber(123_456_789)));
});

test('issues a different tracking number for each sequence number', () => {
  assert.notEqual(newTrackingNumber(1), newTrackingNumber(2));
});

test('rejects text that is not a tracking number', () => {
  for (const text of ['', 'SH12', 'hello', '0000000001'])
    assert.equal(isValidTrackingNumber(text), false, text);
});
