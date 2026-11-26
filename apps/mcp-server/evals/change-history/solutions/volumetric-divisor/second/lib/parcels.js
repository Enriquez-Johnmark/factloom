/** Divides a parcel's volume in cubic centimetres to give its volumetric weight in kilograms. */
export const VOLUMETRIC_DIVISOR = 6000;

/** The divisors the carrier used before VOLUMETRIC_DIVISOR, each until the day before `until`. */
const EARLIER_DIVISORS = [
  { divisor: 5000, until: Date.UTC(2026, 3, 1) },
  { divisor: 4000, until: Date.UTC(2026, 6, 1) },
];

/** The heaviest parcel the carrier takes, in grams. */
export const MAX_WEIGHT_GRAMS = 30_000;

/** Returns the volumetric divisor that applied to a parcel shipped on shippedOn. */
export function volumetricDivisorOn(shippedOn) {
  const earlier = EARLIER_DIVISORS.find((period) => shippedOn.getTime() < period.until);
  return earlier === undefined ? VOLUMETRIC_DIVISOR : earlier.divisor;
}

/**
 * Returns the weight the carrier bills for a parcel shipped on shippedOn, in grams: its actual or
 * its volumetric weight, whichever is higher.
 */
export function billableWeightGrams(parcel, shippedOn = new Date()) {
  const volumeCm3 = parcel.lengthCm * parcel.widthCm * parcel.heightCm;
  const volumetricGrams = Math.ceil((volumeCm3 * 1000) / volumetricDivisorOn(shippedOn));
  return Math.max(parcel.weightGrams, volumetricGrams);
}

/** Says whether the carrier takes a parcel. */
export function isShippable(parcel) {
  return parcel.weightGrams <= MAX_WEIGHT_GRAMS;
}
