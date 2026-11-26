// Check of the task rate-cache-lifetime: the quoter sends one request for the same parcel quoted
// several times at once, and still asks the carrier again once a quote is over 15 minutes old.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRateQuoter } from '../lib/rates.js';

const parcel = { zone: 'europe', weightGrams: 1200 };
const MINUTE_MS = 60_000;

/** A carrier that takes a few milliseconds per quote, and counts the requests it received. */
function slowCarrier() {
  const carrier = {
    requests: 0,
    async send() {
      carrier.requests += 1;
      const cents = 700 + carrier.requests;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { cents };
    },
  };
  return carrier;
}

test('sends one request when the same parcel is quoted three times at once', async () => {
  const carrier = slowCarrier();
  const quoteRate = createRateQuoter(carrier, () => Date.UTC(2026, 5, 15, 12));
  const quotes = await Promise.all([quoteRate(parcel), quoteRate(parcel), quoteRate(parcel)]);
  assert.equal(carrier.requests, 1);
  assert.deepEqual(quotes, [701, 701, 701]);
});

test('asks the carrier again once a quote is more than 15 minutes old', async () => {
  const carrier = slowCarrier();
  let now = Date.UTC(2026, 5, 15, 12);
  const quoteRate = createRateQuoter(carrier, () => now);
  await quoteRate(parcel);
  now += 15 * MINUTE_MS + 1000;
  assert.equal(await quoteRate(parcel), 702);
  assert.equal(carrier.requests, 2);
});
