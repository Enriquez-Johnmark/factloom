/** Returns the refund in cents for `percent` percent of `totalCents`, rounded down to the cent. */
export function computeRefund(totalCents, percent) {
  return Math.floor((totalCents * percent) / 100);
}
