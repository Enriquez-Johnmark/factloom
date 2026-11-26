import { formatAddressLines } from './addresses.js';
import { callCarrier } from './carrier.js';

/** A parcel declared at more than this many cents needs a signature on delivery. */
export const SIGNATURE_THRESHOLD_CENTS = 100_000;

/** Asks the carrier for a shipment's label, and returns the shipment with its tracking number and label. */
export async function createLabel(shipment, transport) {
  const payload = {
    addressLines: formatAddressLines(shipment.address),
    weightGrams: shipment.parcel.weightGrams,
    signatureRequired: shipment.declaredValueCents > SIGNATURE_THRESHOLD_CENTS,
  };
  try {
    const answer = await callCarrier(transport, 'label', payload);
    return { ...shipment, trackingNumber: answer.trackingNumber, label: answer.label };
  } catch (error) {
    throw new Error(`The carrier gave no label for order ${shipment.orderId}`, { cause: error });
  }
}
