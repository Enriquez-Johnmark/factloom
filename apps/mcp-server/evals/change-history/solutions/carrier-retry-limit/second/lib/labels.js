import { formatAddressLines } from './addresses.js';
import { callCarrier } from './carrier.js';

/** A parcel declared at more than this many cents needs a signature on delivery. */
export const SIGNATURE_THRESHOLD_CENTS = 100_000;

/** Thrown when the carrier gives no label, even after the retries that lib/retry.js allows. */
export class CarrierUnavailableError extends Error {
  constructor(orderId, cause) {
    super(`The carrier gave no label for order ${orderId}`, { cause });
    this.name = 'CarrierUnavailableError';
  }
}

/** Asks the carrier for a shipment's label, and returns the shipment with its tracking number and label. */
export async function createLabel(shipment, transport) {
  const payload = {
    reference: shipment.orderId,
    addressLines: formatAddressLines(shipment.address),
    weightGrams: shipment.parcel.weightGrams,
    signatureRequired: shipment.declaredValueCents > SIGNATURE_THRESHOLD_CENTS,
  };
  try {
    // Not more attempts: the carrier bills every label request, failed ones included.
    const answer = await callCarrier(transport, 'label', payload);
    return { ...shipment, trackingNumber: answer.trackingNumber, label: answer.label };
  } catch (error) {
    throw new CarrierUnavailableError(shipment.orderId, error);
  }
}

/** Creates the labels of several shipments, and returns the shipments in the same order. */
export function createLabels(shipments, transport) {
  return Promise.all(shipments.map((shipment) => createLabel(shipment, transport)));
}
