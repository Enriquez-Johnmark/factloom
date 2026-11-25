// Tax rates by region, copied from the old billing system.
export const RATES = { EU: 2000, UK: 2000, US_CA: 725, US_NY: 400 };

/** Returns the tax on an amount in cents for a region, rounded to the cent. */
export function taxCents(totalCents, region) {
  return Math.round((totalCents * (RATES[region] ?? 0)) / 10_000);
}
