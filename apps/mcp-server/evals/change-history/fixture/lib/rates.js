/** An order whose subtotal reaches this many cents ships for free. */
export const FREE_SHIPPING_THRESHOLD_CENTS = 5000;

/** What shipping costs the customer below the free-shipping threshold, in cents, by zone. */
export const FLAT_RATES_CENTS = { domestic: 495, europe: 1295 };

/** Returns what the customer pays to ship an order, in cents. */
export function shippingCostCents(order) {
  if (order.subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS) return 0;
  return FLAT_RATES_CENTS[order.zone];
}
