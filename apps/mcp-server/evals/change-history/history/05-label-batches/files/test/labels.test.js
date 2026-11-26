import assert from 'node:assert/strict';
import test from 'node:test';
import { createLabel, createLabels, SIGNATURE_THRESHOLD_CENTS } from '../lib/labels.js';

const address = {
  name: 'Ada Byrne',
  street: '12 Harbour Road',
  postcode: 'D02 X285',
  city: 'Dublin',
  country: 'IE',
};
const parcel = { weightGrams: 800, lengthCm: 20, widthCm: 15, heightCm: 10 };
const shipment = { orderId: 'ord_1', address, parcel, declaredValueCents: 4000 };

/** A carrier that answers every label request, and keeps the requests it received. */
function fakeCarrier() {
  const requests = [];
  return {
    requests,
    async send(request) {
      requests.push(request);
      return { trackingNumber: `track-${requests.length}`, label: 'PDF' };
    },
  };
}

test('returns the shipment with the tracking number and the label from the carrier', async () => {
  const labelled = await createLabel(shipment, fakeCarrier());
  assert.equal(labelled.orderId, 'ord_1');
  assert.equal(labelled.trackingNumber, 'track-1');
  assert.equal(labelled.label, 'PDF');
});

test('asks for a signature only above the signature threshold', async () => {
  const carrier = fakeCarrier();
  await createLabel({ ...shipment, declaredValueCents: SIGNATURE_THRESHOLD_CENTS }, carrier);
  await createLabel({ ...shipment, declaredValueCents: SIGNATURE_THRESHOLD_CENTS + 1 }, carrier);
  assert.deepEqual(
    carrier.requests.map((request) => request.payload.signatureRequired),
    [false, true],
  );
});

test('fails with the order id when the carrier keeps failing', async () => {
  const carrier = {
    async send() {
      throw new Error('503 Service Unavailable');
    },
  };
  await assert.rejects(createLabel(shipment, carrier), /ord_1/);
});

test('creates the labels of several shipments in their order', async () => {
  const shipments = [shipment, { ...shipment, orderId: 'ord_2' }];
  const labelled = await createLabels(shipments, fakeCarrier());
  assert.deepEqual(
    labelled.map((each) => each.orderId),
    ['ord_1', 'ord_2'],
  );
});
