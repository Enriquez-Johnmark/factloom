import { callCarrier } from './carrier.js';

/** How many tracking numbers go into one status request to the carrier. */
export const TRACKING_BATCH_SIZE = 100;

/**
 * Every form of tracking number this service has issued: SH and eight digits first, SH and ten
 * digits from April 2026, SHP-, a hyphen and ten digits since June 2026.
 */
const TRACKING_NUMBER_FORMS = [/^SH\d{8}$/, /^SH\d{10}$/, /^SHP-\d{10}$/];

/** Returns the tracking number of the shipment with a given sequence number. */
export function newTrackingNumber(sequence) {
  return `SHP-${String(sequence).padStart(10, '0')}`;
}

/** Says whether text is a tracking number this service issues now or has issued before. */
export function isValidTrackingNumber(text) {
  return TRACKING_NUMBER_FORMS.some((form) => form.test(text));
}

/** Asks the carrier for the status of each shipment, and returns a Map from tracking number to status. */
export async function refreshTracking(shipments, transport) {
  const statuses = new Map();
  const numbers = shipments.map((shipment) => shipment.trackingNumber);
  for (let start = 0; start < numbers.length; start += TRACKING_BATCH_SIZE) {
    const trackingNumbers = numbers.slice(start, start + TRACKING_BATCH_SIZE);
    const answer = await callCarrier(transport, 'tracking', { trackingNumbers });
    for (const [number, status] of Object.entries(answer.statuses)) statuses.set(number, status);
  }
  return statuses;
}
