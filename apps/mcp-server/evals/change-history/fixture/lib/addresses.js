/** Returns the lines of an address as they are printed: name, street, postcode and city, country. */
export function formatAddressLines(address) {
  return [address.name, address.street, `${address.postcode} ${address.city}`, address.country];
}
