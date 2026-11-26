import { callCarrier } from './carrier.js';

/**
 * How many tracking numbers go into one status request to the carrier. Not more: the carrier's
 * tracking endpoint times out on larger requests.
 */
export const TRACKING_BATCH_SIZE = 25;

/** Returns the tracking number of the shipment with a given sequence number. */
export function newTrackingNumber(sequence) {
  return `SH${String(sequence).padStart(10, '0')}`;
}

/** Says whether text is a tracking number this service issues. */
export function isValidTrackingNumber(text) {
  return /^SH\d{10}$/.test(text);
}

/**
 * Asks the carrier for the status of each shipment that is not delivered yet, and returns a Map
 * from tracking number to status.
 */
export async function refreshTracking(shipments, transport) {
  const statuses = new Map();
  const numbers = shipments
    .filter((shipment) => shipment.status !== 'delivered')
    .map((shipment) => shipment.trackingNumber);
  for (let start = 0; start < numbers.length; start += TRACKING_BATCH_SIZE) {
    const trackingNumbers = numbers.slice(start, start + TRACKING_BATCH_SIZE);
    const answer = await callCarrier(transport, 'tracking', { trackingNumbers });
    for (const [number, status] of Object.entries(answer.statuses)) statuses.set(number, status);
  }
  return statuses;
}
