// Item barcodes are 14 digits; the last is a Luhn check digit over the first 13.

/** Removes the spaces and dashes that scanners and people put in a barcode. */
export function normaliseBarcode(input) {
  return input.replace(/[\s-]/g, '');
}

/** Returns the Luhn check digit of a string of digits. */
export function checkDigit(digits) {
  let sum = 0;
  [...digits].reverse().forEach((character, index) => {
    const digit = Number(character);
    const weighted = index % 2 === 0 ? digit * 2 : digit;
    sum += weighted > 9 ? weighted - 9 : weighted;
  });
  return (10 - (sum % 10)) % 10;
}

/** Tells whether a normalised barcode has 14 digits and the right check digit. */
export function isValidBarcode(barcode) {
  if (!/^\d{14}$/.test(barcode)) return false;
  return checkDigit(barcode.slice(0, 13)) === Number(barcode[13]);
}
