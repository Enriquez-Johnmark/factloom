import assert from 'node:assert/strict';
import test from 'node:test';
import { FLAT_RATES_CENTS, FREE_SHIPPING_THRESHOLD_CENTS, shippingCostCents } from '../lib/rates.js';

test('charges the flat rate of the zone below the free-shipping threshold', () => {
  assert.equal(shippingCostCents({ subtotalCents: 1000, zone: 'europe' }), FLAT_RATES_CENTS.europe);
});

test('ships for free above the free-shipping threshold', () => {
  assert.equal(
    shippingCostCents({ subtotalCents: FREE_SHIPPING_THRESHOLD_CENTS + 500, zone: 'domestic' }),
    0,
  );
});
