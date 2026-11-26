import { callCarrier } from './carrier.js';

/** An order whose subtotal reaches this many cents ships for free. */
export const FREE_SHIPPING_THRESHOLD_CENTS = 5000;

/** What shipping costs the customer below the free-shipping threshold, in cents, by zone. */
export const FLAT_RATES_CENTS = { domestic: 495, europe: 1295, world: 2495 };

/** How long a rate quote from the carrier is kept, in milliseconds. */
export const RATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** How long checkout waits for one rate request to the carrier, in milliseconds. */
export const RATE_TIMEOUT_MS = 5_000;

/** Returns what the customer pays to ship an order, in cents. */
export function shippingCostCents(order) {
  if (order.subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS) return 0;
  return FLAT_RATES_CENTS[order.zone];
}

/**
 * Returns a function that quotes the carrier's rate for a parcel, in cents, or the flat rate of
 * its zone when the carrier gives no answer. A carrier quote is kept for RATE_CACHE_TTL_MS and
 * reused for any parcel of the same zone and weight.
 */
export function createRateQuoter(transport, now = Date.now) {
  const quotes = new Map();
  return async function quoteRate(parcel) {
    const key = `${parcel.zone}:${parcel.weightGrams}`;
    const kept = quotes.get(key);
    if (kept !== undefined && now() - kept.quotedAt < RATE_CACHE_TTL_MS) return kept.cents;
    const payload = { zone: parcel.zone, weightGrams: parcel.weightGrams };
    try {
      const answer = await callCarrier(transport, 'rate', payload, RATE_TIMEOUT_MS);
      quotes.set(key, { cents: answer.cents, quotedAt: now() });
      return answer.cents;
    } catch {
      return FLAT_RATES_CENTS[parcel.zone];
    }
  };
}
