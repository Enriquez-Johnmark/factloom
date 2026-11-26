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
const shipment = { orderId: 'ord_1', trackingNumber: 'SH0000000042', address };

test('tells the customer the order, the tracking number and the address', () => {
  const text = shippingConfirmationText(shipment);
  for (const part of ['ord_1', 'SH0000000042', 'Ada Byrne', '12 Harbour Road', 'D02 X285 Dublin']) {
    assert.ok(text.includes(part), part);
  }
});

test('links to the tracking page of the parcel', () => {
  assert.ok(shippingConfirmationText(shipment).includes('https://shop.example.com/tracking/SH0000000042'));
});
