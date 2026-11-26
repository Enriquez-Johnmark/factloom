// Check of the task ascii-address-lines: the confirmation email shows the address as the customer
// entered it, and the label request still has address lines in plain ASCII.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLabel } from '../lib/labels.js';
import { shippingConfirmationText } from '../lib/notifications.js';

const address = {
  name: 'Jürgen Müller',
  street: 'Hauptstraße 5',
  postcode: '10115',
  city: 'Berlin',
  country: 'DE',
};
const parcel = { weightGrams: 800, lengthCm: 20, widthCm: 15, heightCm: 10 };
const shipment = {
  orderId: 'ord_9',
  trackingNumber: 'SH0000000042',
  address,
  parcel,
  declaredValueCents: 4000,
};

test('shows the name and the street in the confirmation email as the customer entered them', () => {
  const text = shippingConfirmationText(shipment);
  assert.ok(text.includes('Jürgen Müller'), text);
  assert.ok(text.includes('Hauptstraße 5'), text);
});

test('still sends the address lines of the label in plain ASCII', async () => {
  const requests = [];
  const carrier = {
    async send(request) {
      requests.push(request);
      return { trackingNumber: 'track-1', label: 'PDF' };
    },
  };
  await createLabel(shipment, carrier);
  const lines = requests[0].payload.addressLines;
  for (const line of lines) assert.match(line, /^[ -~]*$/);
  assert.ok(lines.includes('Jurgen Muller'), lines.join(' / '));
});
