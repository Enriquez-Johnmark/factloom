// Check of the task one-label-at-a-time: createLabels skips shipments that already have a label,
// and still sends one label request at a time.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLabels } from '../lib/labels.js';

const address = {
  name: 'Ada Byrne',
  street: '12 Harbour Road',
  postcode: 'D02 X285',
  city: 'Dublin',
  country: 'IE',
};
const parcel = { weightGrams: 800, lengthCm: 20, widthCm: 15, heightCm: 10 };

/** Returns count shipments without a label, ord_1 and on. */
function shipments(count) {
  return Array.from({ length: count }, (_, index) => ({
    orderId: `ord_${index + 1}`,
    address,
    parcel,
    declaredValueCents: 4000,
  }));
}

/** A carrier that takes a few milliseconds per label, and counts the requests it has at once. */
function slowCarrier() {
  const carrier = {
    requests: 0,
    inFlight: 0,
    mostInFlight: 0,
    async send(request) {
      carrier.requests += 1;
      carrier.inFlight += 1;
      carrier.mostInFlight = Math.max(carrier.mostInFlight, carrier.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      carrier.inFlight -= 1;
      return { trackingNumber: `track-${request.payload.reference}`, label: 'PDF' };
    },
  };
  return carrier;
}

test('sends one label request at a time', async () => {
  const carrier = slowCarrier();
  await createLabels(shipments(6), carrier);
  assert.equal(carrier.mostInFlight, 1);
});

test('skips the shipments that already have a label and keeps them in their place', async () => {
  const batch = shipments(5);
  batch[1] = { ...batch[1], trackingNumber: 'old-2', label: 'OLD' };
  batch[3] = { ...batch[3], trackingNumber: 'old-4', label: 'OLD' };
  const carrier = slowCarrier();
  const labelled = await createLabels(batch, carrier);
  assert.equal(carrier.requests, 3);
  assert.deepEqual(
    labelled.map((shipment) => shipment.trackingNumber),
    ['track-ord_1', 'old-2', 'track-ord_3', 'old-4', 'track-ord_5'],
  );
  assert.deepEqual(labelled[1], batch[1]);
});
