// Check of the task label-timeout: rate requests give up after at most 5 seconds and fall back to
// the flat rate, and label requests still wait at least 30 seconds.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLabel } from '../lib/labels.js';
import { createRateQuoter, FLAT_RATES_CENTS } from '../lib/rates.js';

const address = {
  name: 'Ada Byrne',
  street: '12 Harbour Road',
  postcode: 'D02 X285',
  city: 'Dublin',
  country: 'IE',
};
const parcel = { zone: 'europe', weightGrams: 1200, lengthCm: 20, widthCm: 15, heightCm: 10 };
const shipment = { orderId: 'ord_5', address, parcel, declaredValueCents: 4000 };

/** A carrier that gives answer, or rejects with it when it is an Error, and keeps the requests. */
function recordingCarrier(answer) {
  const requests = [];
  return {
    requests,
    async send(request) {
      requests.push(request);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

test('gives up on a rate request after at most 5 seconds', async () => {
  const carrier = recordingCarrier({ cents: 731 });
  await createRateQuoter(carrier)(parcel);
  assert.ok(carrier.requests.length > 0);
  for (const request of carrier.requests)
    assert.ok(request.timeoutMs <= 5000, `timeoutMs ${request.timeoutMs}`);
});

test('quotes the flat rate of the zone when the carrier gives no answer', async () => {
  const carrier = recordingCarrier(new Error('The carrier did not answer within the timeout'));
  assert.equal(await createRateQuoter(carrier)(parcel), FLAT_RATES_CENTS.europe);
});

test('still waits at least 30 seconds for a label', async () => {
  const carrier = recordingCarrier({ trackingNumber: 'track-1', label: 'PDF' });
  await createLabel(shipment, carrier);
  assert.equal(carrier.requests.length, 1);
  assert.ok(carrier.requests[0].timeoutMs >= 30_000, `timeoutMs ${carrier.requests[0].timeoutMs}`);
});
