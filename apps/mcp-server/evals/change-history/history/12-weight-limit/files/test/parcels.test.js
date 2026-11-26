import assert from 'node:assert/strict';
import test from 'node:test';
import { billableWeightGrams, isShippable, VOLUMETRIC_DIVISOR } from '../lib/parcels.js';

test('bills the actual weight of a small heavy parcel', () => {
  assert.equal(billableWeightGrams({ lengthCm: 10, widthCm: 10, heightCm: 10, weightGrams: 2000 }), 2000);
});

test('bills the volumetric weight of a large light parcel', () => {
  const parcel = { lengthCm: 50, widthCm: 40, heightCm: 30, weightGrams: 1000 };
  assert.equal(billableWeightGrams(parcel), (50 * 40 * 30 * 1000) / VOLUMETRIC_DIVISOR);
});

test('takes parcels up to 30 kg and refuses heavier ones', () => {
  const parcel = { lengthCm: 50, widthCm: 40, heightCm: 30 };
  assert.equal(isShippable({ ...parcel, weightGrams: 30_000 }), true);
  assert.equal(isShippable({ ...parcel, weightGrams: 30_001 }), false);
});
