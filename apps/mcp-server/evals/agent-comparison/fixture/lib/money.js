/** Adds amounts given in cents. */
export function addCents(...amounts) {
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

/** Formats an amount in cents with its currency, such as "12.50 EUR". */
export function formatCents(cents, currency) {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${sign}${Math.floor(absolute / 100)}.${fraction} ${currency}`;
}
