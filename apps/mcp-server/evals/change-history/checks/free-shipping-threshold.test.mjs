// Check of the task free-shipping-threshold: an order placed before 1 July 2026 keeps the
// threshold of 50 euros; one placed from that day gets 75 euros. The change was committed in June,
// so the date of the commit is not the date of the change. The times are mid-day, so the answer is
// the same in UTC and in the time zone the checks run in.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as rates from '../lib/rates.js';

test('returns 50 euros for orders placed before 1 July 2026', () => {
  for (const placedAt of ['2026-04-10T18:00:00Z', '2026-06-20T18:00:00Z', '2026-06-30T18:00:00Z']) {
    assert.equal(rates.freeShippingThresholdFor(new Date(placedAt)), 5000, placedAt);
  }
});

test('returns 75 euros for orders placed from 1 July 2026', () => {
  for (const placedAt of ['2026-07-01T18:00:00Z', '2026-08-15T18:00:00Z']) {
    assert.equal(rates.freeShippingThresholdFor(new Date(placedAt)), 7500, placedAt);
  }
});

test('charges an order the shipping of the threshold of the day it was placed', () => {
  const order = { subtotalCents: 6000, zone: 'domestic' };
  assert.equal(rates.shippingCostCents({ ...order, placedAt: new Date('2026-06-20T18:00:00Z') }), 0);
  assert.equal(
    rates.shippingCostCents({ ...order, placedAt: new Date('2026-08-15T18:00:00Z') }),
    rates.FLAT_RATES_CENTS.domestic,
  );
});
