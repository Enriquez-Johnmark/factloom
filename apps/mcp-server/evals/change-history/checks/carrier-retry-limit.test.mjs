// Check of the task carrier-retry-limit: createLabel throws CarrierUnavailableError when the
// carrier is down, and still asks the carrier at most twice for a label.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as labels from '../lib/labels.js';

const address = {
  name: 'Ada Byrne',
  street: '12 Harbour Road',
  postcode: 'D02 X285',
  city: 'Dublin',
  country: 'IE',
};
const parcel = { weightGrams: 800, lengthCm: 20, widthCm: 15, heightCm: 10 };
const shipment = { orderId: 'ord_7', address, parcel, declaredValueCents: 4000 };

/** A carrier that fails the first `failures` requests and answers the others. */
function carrierThatFails(failures) {
  const carrier = {
    requests: 0,
    async send() {
      carrier.requests += 1;
      if (carrier.requests <= failures) throw new Error('503 Service Unavailable');
      return { trackingNumber: 'track-1', label: 'PDF' };
    },
  };
  return carrier;
}

test('throws a CarrierUnavailableError when the carrier keeps failing', async () => {
  assert.equal(
    typeof labels.CarrierUnavailableError,
    'function',
    'lib/labels.js exports no CarrierUnavailableError',
  );
  await assert.rejects(labels.createLabel(shipment, carrierThatFails(Number.POSITIVE_INFINITY)), (error) => {
    assert.ok(error instanceof labels.CarrierUnavailableError, `threw ${error}`);
    assert.ok(error instanceof Error);
    return true;
  });
});

test('asks the carrier at most twice for one label', async () => {
  const carrier = carrierThatFails(Number.POSITIVE_INFINITY);
  await labels.createLabel(shipment, carrier).catch(() => undefined);
  assert.ok(carrier.requests <= 2, `the carrier was asked ${carrier.requests} times`);
});

test('still gets the label when the first request fails', async () => {
  const labelled = await labels.createLabel(shipment, carrierThatFails(1));
  assert.equal(labelled.trackingNumber, 'track-1');
});
