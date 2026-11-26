import { formatAddressLines } from './addresses.js';

/** Returns the text of the email that tells a customer their order has shipped. */
export function shippingConfirmationText(shipment) {
  return [
    `Your order ${shipment.orderId} is on its way.`,
    `Tracking number: ${shipment.trackingNumber}`,
    '',
    'We are sending it to:',
    ...formatAddressLines(shipment.address),
  ].join('\n');
}
