/** Returns the lines of an address as they are printed: name, street, postcode and city, country. */
export function formatAddressLines(address) {
  const cityLine = `${normalizePostcode(address.postcode)} ${address.city}`;
  return [address.name, address.street.trim(), cityLine, address.country].map(toPlainAscii);
}

/** Returns a postcode in capitals, with single spaces and none around it. */
export function normalizePostcode(postcode) {
  return postcode.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Replaces accented letters with plain ones, and ß with ss. */
function toPlainAscii(text) {
  return text.replaceAll('ß', 'ss').normalize('NFD').replace(/\p{M}/gu, '');
}
