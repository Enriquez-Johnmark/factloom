// Check of the task tracking-number-formats: isValidTrackingNumber accepts the SHP- numbers issued
// now, the ten-digit SH numbers issued before them and the eight-digit SH numbers issued first,
// which only the git history shows, and rejects anything else.
import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidTrackingNumber, newTrackingNumber } from '../lib/tracking.js';

test('still issues and accepts tracking numbers in the SHP- form', () => {
  const issued = newTrackingNumber(123);
  assert.ok(issued.startsWith('SHP-'), issued);
  assert.ok(isValidTrackingNumber(issued));
  assert.ok(isValidTrackingNumber('SHP-0000000123'));
});

test('accepts the ten-digit SH numbers issued before the SHP- form', () => {
  assert.ok(isValidTrackingNumber('SH0000000123'));
});

test('accepts the eight-digit SH numbers issued first', () => {
  assert.ok(isValidTrackingNumber('SH00000123'));
});

test('rejects text that is no form of tracking number', () => {
  for (const text of ['', 'SH123', 'SH123456789', 'SH000000001234', 'XX00000123', 'SHP-12']) {
    assert.equal(isValidTrackingNumber(text), false, text);
  }
});
