/**
 * Returns the lines of an address as they are printed on a label: name, street, postcode and
 * city, country, in plain ASCII, because the carrier's label printers print nothing else.
 */
export function formatAddressLines(address) {
  return addressLinesAsEntered(address).map(toPlainAscii);
}

/** Returns the lines of an address with the letters the customer entered, for what customers read. */
export function addressLinesAsEntered(address) {
  const cityLine = `${normalizePostcode(address.postcode)} ${address.city}`;
  return [address.name, address.street.trim(), cityLine, address.country];
}

/** Returns a postcode in capitals, with single spaces and none around it. */
export function normalizePostcode(postcode) {
  return postcode.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Replaces accented letters with plain ones, and ß with ss. */
function toPlainAscii(text) {
  return text.replaceAll('ß', 'ss').normalize('NFD').replace(/\p{M}/gu, '');
}
