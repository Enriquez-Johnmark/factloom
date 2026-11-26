import { callCarrier } from './carrier.js';

/** An order whose subtotal reaches this many cents ships for free. */
export const FREE_SHIPPING_THRESHOLD_CENTS = 5000;

/** What shipping costs the customer below the free-shipping threshold, in cents, by zone. */
export const FLAT_RATES_CENTS = { domestic: 495, europe: 1295, world: 2495 };

/** How long a rate quote from the carrier is kept, in milliseconds. */
export const RATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Returns what the customer pays to ship an order, in cents. */
export function shippingCostCents(order) {
  if (order.subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS) return 0;
  return FLAT_RATES_CENTS[order.zone];
}

/**
 * Returns a function that quotes the carrier's rate for a parcel, in cents. A quote is kept for
 * RATE_CACHE_TTL_MS and reused for any parcel of the same zone and weight, also while the
 * carrier has not answered yet, so that quotes asked for at once share one request.
 */
export function createRateQuoter(transport, now = Date.now) {
  const quotes = new Map();
  return function quoteRate(parcel) {
    const key = `${parcel.zone}:${parcel.weightGrams}`;
    const kept = quotes.get(key);
    if (kept !== undefined && now() - kept.quotedAt < RATE_CACHE_TTL_MS) return kept.cents;
    const cents = callCarrier(transport, 'rate', { zone: parcel.zone, weightGrams: parcel.weightGrams }).then(
      (answer) => answer.cents,
    );
    const quote = { cents, quotedAt: now() };
    quotes.set(key, quote);
    cents.catch(() => {
      if (quotes.get(key) === quote) quotes.delete(key);
    });
    return cents;
  };
}
