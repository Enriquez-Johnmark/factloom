// Check of the task signature-threshold: a parcel the customer chose to have left at the door is
// left there, unless it is worth more than 300 euros, which still needs a signature.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLabel } from '../lib/labels.js';

const address = {
  name: 'Ada Byrne',
  street: '12 Harbour Road',
  postcode: 'D02 X285',
  city: 'Dublin',
  country: 'IE',
};
const parcel = { weightGrams: 800, lengthCm: 20, widthCm: 15, heightCm: 10 };

/** Returns the payload of the label request that createLabel sends for a shipment. */
async function labelRequestFor(shipment) {
  const requests = [];
  const carrier = {
    async send(request) {
      requests.push(request);
      return { trackingNumber: 'track-1', label: 'PDF' };
    },
  };
  await createLabel({ orderId: 'ord_3', address, parcel, ...shipment }, carrier);
  return requests[0].payload;
}

test('asks the courier to leave a parcel worth 100 euros at the door when the customer chose it', async () => {
  const payload = await labelRequestFor({ declaredValueCents: 10_000, leaveAtDoor: true });
  assert.equal(payload.leaveAtDoor, true);
  assert.equal(payload.signatureRequired, false);
});

test('still asks for a signature on a parcel worth 500 euros that the customer chose to have left at the door', async () => {
  const payload = await labelRequestFor({ declaredValueCents: 50_000, leaveAtDoor: true });
  assert.equal(payload.signatureRequired, true);
});

test('asks for a signature on a parcel worth just over 300 euros', async () => {
  const payload = await labelRequestFor({ declaredValueCents: 30_001 });
  assert.equal(payload.signatureRequired, true);
});
