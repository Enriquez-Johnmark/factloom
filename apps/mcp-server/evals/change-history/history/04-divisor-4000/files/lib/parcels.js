/** Divides a parcel's volume in cubic centimetres to give its volumetric weight in kilograms. */
export const VOLUMETRIC_DIVISOR = 4000;

/** Returns the weight the carrier bills for a parcel, in grams: its actual or its volumetric weight, whichever is higher. */
export function billableWeightGrams(parcel) {
  const volumeCm3 = parcel.lengthCm * parcel.widthCm * parcel.heightCm;
  const volumetricGrams = Math.round((volumeCm3 * 1000) / VOLUMETRIC_DIVISOR);
  return Math.max(parcel.weightGrams, volumetricGrams);
}
