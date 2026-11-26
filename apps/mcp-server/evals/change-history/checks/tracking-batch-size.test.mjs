// Check of the task tracking-batch-size: refreshTracking does not ask about delivered shipments,
// and still asks about at most 25 tracking numbers per request.
import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshTracking } from '../lib/tracking.js';

/** Returns count shipments with the given status, numbered from first. */
function shipments(count, { first, status }) {
  return Array.from({ length: count }, (_, index) => ({
    trackingNumber: `SH${String(first + index).padStart(10, '0')}`,
    status,
  }));
}

const open = shipments(60, { first: 1, status: 'in_transit' });
const delivered = shipments(20, { first: 101, status: 'delivered' });
const all = [...open.slice(0, 30), ...delivered, ...open.slice(30)];

/** A carrier that reports every shipment as out for delivery, and keeps the requests it received. */
function fakeCarrier() {
  const requests = [];
  return {
    requests,
    async send(request) {
      requests.push(request);
      const statuses = request.payload.trackingNumbers.map((number) => [number, 'out_for_delivery']);
      return { statuses: Object.fromEntries(statuses) };
    },
  };
}

/** Returns the tracking numbers of every request the carrier received. */
function requestedNumbers(carrier) {
  return carrier.requests.map((request) => request.payload.trackingNumbers);
}

test('asks about at most 25 tracking numbers per request', async () => {
  const carrier = fakeCarrier();
  await refreshTracking(all, carrier);
  for (const numbers of requestedNumbers(carrier))
    assert.ok(numbers.length <= 25, `${numbers.length} numbers`);
});

test('does not ask about delivered shipments', async () => {
  const carrier = fakeCarrier();
  await refreshTracking(all, carrier);
  const asked = new Set(requestedNumbers(carrier).flat());
  for (const shipment of delivered)
    assert.equal(asked.has(shipment.trackingNumber), false, shipment.trackingNumber);
});

test('returns the new status of every open shipment', async () => {
  const statuses = await refreshTracking(all, fakeCarrier());
  for (const shipment of open) assert.equal(statuses.get(shipment.trackingNumber), 'out_for_delivery');
});
