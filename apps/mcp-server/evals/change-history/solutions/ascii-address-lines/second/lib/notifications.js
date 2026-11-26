import { addressLinesAsEntered } from './addresses.js';

/** Where customers follow their parcels. */
const TRACKING_PAGE_URL = 'https://shop.example.com/tracking';

/** Returns the text of the email that tells a customer their order has shipped. */
export function shippingConfirmationText(shipment) {
  return [
    `Your order ${shipment.orderId} is on its way.`,
    `Tracking number: ${shipment.trackingNumber}`,
    `Follow it at ${TRACKING_PAGE_URL}/${shipment.trackingNumber}`,
    '',
    'We are sending it to:',
    ...addressLinesAsEntered(shipment.address),
  ].join('\n');
}
