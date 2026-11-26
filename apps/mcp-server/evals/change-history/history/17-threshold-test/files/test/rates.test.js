import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRateQuoter,
  FLAT_RATES_CENTS,
  FREE_SHIPPING_THRESHOLD_CENTS,
  RATE_CACHE_TTL_MS,
  shippingCostCents,
} from '../lib/rates.js';

/** A carrier that quotes every parcel, and counts the requests it received. */
function fakeCarrier() {
  const carrier = {
    requests: 0,
    async send() {
      carrier.requests += 1;
      return { cents: 650 };
    },
  };
  return carrier;
}

const parcel = { zone: 'europe', weightGrams: 1200 };

test('charges the flat rate of the zone below the free-shipping threshold', () => {
  assert.equal(shippingCostCents({ subtotalCents: 1000, zone: 'europe' }), FLAT_RATES_CENTS.europe);
});

test('has a flat rate for every zone', () => {
  assert.deepEqual(Object.keys(FLAT_RATES_CENTS), ['domestic', 'europe', 'world']);
});

test('ships for free above the free-shipping threshold', () => {
  assert.equal(
    shippingCostCents({ subtotalCents: FREE_SHIPPING_THRESHOLD_CENTS + 500, zone: 'domestic' }),
    0,
  );
});

test('ships for free from exactly the free-shipping threshold', () => {
  assert.equal(shippingCostCents({ subtotalCents: FREE_SHIPPING_THRESHOLD_CENTS, zone: 'domestic' }), 0);
  assert.equal(
    shippingCostCents({ subtotalCents: FREE_SHIPPING_THRESHOLD_CENTS - 1, zone: 'domestic' }),
    FLAT_RATES_CENTS.domestic,
  );
});

test('quotes the rate the carrier gives', async () => {
  const quoteRate = createRateQuoter(fakeCarrier());
  assert.equal(await quoteRate(parcel), 650);
});

test('reuses a quote for the same parcel until it is RATE_CACHE_TTL_MS old', async () => {
  const carrier = fakeCarrier();
  let now = 1_000_000;
  const quoteRate = createRateQuoter(carrier, () => now);
  await quoteRate(parcel);
  now += RATE_CACHE_TTL_MS - 1;
  await quoteRate(parcel);
  assert.equal(carrier.requests, 1);
  now += 1;
  await quoteRate(parcel);
  assert.equal(carrier.requests, 2);
});
