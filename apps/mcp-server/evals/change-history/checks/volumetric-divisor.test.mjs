// Check of the task volumetric-divisor: the divisor was 5000 until 31 March 2026, 4000 from
// 1 April and 6000 from 1 July. Both changes were committed before the day they took effect, so the
// commit dates are not the dates of the changes. The times are mid-day, so the answer is the same
// in UTC and in the time zone the checks run in.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as parcels from '../lib/parcels.js';

/** Asserts the divisor for each ship date. */
function assertDivisor(expected, shipDates) {
  for (const shippedOn of shipDates) {
    assert.equal(parcels.volumetricDivisorOn(new Date(shippedOn)), expected, shippedOn);
  }
}

test('returns 5000 for parcels shipped before 1 April 2026', () => {
  assertDivisor(5000, ['2026-03-10T18:00:00Z', '2026-03-25T18:00:00Z', '2026-03-31T18:00:00Z']);
});

test('returns 4000 for parcels shipped from 1 April to 30 June 2026', () => {
  assertDivisor(4000, [
    '2026-04-01T18:00:00Z',
    '2026-05-15T18:00:00Z',
    '2026-06-20T18:00:00Z',
    '2026-06-30T18:00:00Z',
  ]);
});

test('returns 6000 for parcels shipped from 1 July 2026', () => {
  assertDivisor(6000, ['2026-07-01T18:00:00Z', '2026-10-01T18:00:00Z']);
});

test('bills a large light parcel with the divisor of the day it shipped', () => {
  const parcel = { lengthCm: 40, widthCm: 30, heightCm: 20, weightGrams: 1000 };
  assert.equal(parcels.billableWeightGrams(parcel, new Date('2026-03-25T18:00:00Z')), 4800);
  assert.equal(parcels.billableWeightGrams(parcel, new Date('2026-04-15T18:00:00Z')), 6000);
  assert.equal(parcels.billableWeightGrams(parcel, new Date('2026-08-15T18:00:00Z')), 4000);
});
