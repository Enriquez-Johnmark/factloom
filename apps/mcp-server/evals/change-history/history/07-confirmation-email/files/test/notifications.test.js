import assert from 'node:assert/strict';
import test from 'node:test';
import { shippingConfirmationText } from '../lib/notifications.js';

const address = {
  name: 'Ada Byrne',
  street: '12 Harbour Road',
  postcode: 'D02 X285',
  city: 'Dublin',
  country: 'IE',
};
const shipment = { orderId: 'ord_1', trackingNumber: 'SH00000042', address };

test('tells the customer the order, the tracking number and the address', () => {
  const text = shippingConfirmationText(shipment);
  for (const part of ['ord_1', 'SH00000042', 'Ada Byrne', '12 Harbour Road', 'D02 X285 Dublin']) {
    assert.ok(text.includes(part), part);
  }
});
