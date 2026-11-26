/** Returns the tracking number of the shipment with a given sequence number. */
export function newTrackingNumber(sequence) {
  return `SH${String(sequence).padStart(10, '0')}`;
}

/** Says whether text is a tracking number this service issues. */
export function isValidTrackingNumber(text) {
  return /^SH\d{10}$/.test(text);
}
