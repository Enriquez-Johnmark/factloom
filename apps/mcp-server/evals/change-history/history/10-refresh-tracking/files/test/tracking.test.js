import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidTrackingNumber,
  newTrackingNumber,
  refreshTracking,
  TRACKING_BATCH_SIZE,
} from '../lib/tracking.js';

/** A carrier that reports every shipment as in transit, and keeps the requests it received. */
function fakeCarrier() {
  const requests = [];
  return {
    requests,
    async send(request) {
      requests.push(request);
      const statuses = request.payload.trackingNumbers.map((number) => [number, 'in_transit']);
      return { statuses: Object.fromEntries(statuses) };
    },
  };
}

/** Returns count shipments with consecutive tracking numbers. */
function shipments(count) {
  return Array.from({ length: count }, (_, index) => ({ trackingNumber: newTrackingNumber(index + 1) }));
}

test('accepts the tracking numbers it issues', () => {
  assert.ok(isValidTrackingNumber(newTrackingNumber(1)));
  assert.ok(isValidTrackingNumber(newTrackingNumber(48_213)));
});

test('issues tracking numbers for sequence numbers above one hundred million', () => {
  assert.ok(isValidTrackingNumber(newTrackingNumber(123_456_789)));
});

test('issues a different tracking number for each sequence number', () => {
  assert.notEqual(newTrackingNumber(1), newTrackingNumber(2));
});

test('rejects text that is not a tracking number', () => {
  for (const text of ['', 'SH12', 'hello', '0000000001'])
    assert.equal(isValidTrackingNumber(text), false, text);
});

test('returns the status of every shipment from the carrier', async () => {
  const statuses = await refreshTracking(shipments(3), fakeCarrier());
  assert.deepEqual([...statuses.values()], ['in_transit', 'in_transit', 'in_transit']);
});

test('asks about at most TRACKING_BATCH_SIZE tracking numbers per request', async () => {
  const carrier = fakeCarrier();
  await refreshTracking(shipments(TRACKING_BATCH_SIZE * 2 + 1), carrier);
  assert.deepEqual(
    carrier.requests.map((request) => request.payload.trackingNumbers.length),
    [TRACKING_BATCH_SIZE, TRACKING_BATCH_SIZE, 1],
  );
});
