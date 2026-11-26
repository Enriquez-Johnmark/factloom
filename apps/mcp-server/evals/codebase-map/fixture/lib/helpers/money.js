/** Formats an amount in cents as dollars, such as $12.50. */
export function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}
