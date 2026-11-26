import assert from 'node:assert/strict';
import test from 'node:test';
import { expireUncollectedHolds, pickupDeadline } from '../lib/holds/pickup.js';
import { fulfilNextHold, holdQueue, placeHold } from '../lib/holds/queue.js';
import { ADA, BEN, BOOK, CY, sampleStore, TODAY } from './sample-library.js';

function hold({ id, member, placedOn, status = 'waiting', readyOn = null }) {
  return { id, itemId: BOOK.id, memberId: member.id, pickupBranchId: 'central', placedOn, status, readyOn };
}

test('places a hold at the end of the queue', () => {
  const store = sampleStore({ holds: [hold({ id: 'hold_a', member: BEN, placedOn: '2026-11-01' })] });
  const result = placeHold(store, {
    itemId: BOOK.id,
    memberId: ADA.id,
    pickupBranchId: 'central',
    today: TODAY,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    holdQueue(store, BOOK.id).map((queued) => queued.memberId),
    [BEN.id, ADA.id],
  );
});

test('refuses a second hold of the same member on an item', () => {
  const store = sampleStore({ holds: [hold({ id: 'hold_a', member: ADA, placedOn: '2026-11-01' })] });
  const result = placeHold(store, {
    itemId: BOOK.id,
    memberId: ADA.id,
    pickupBranchId: 'central',
    today: TODAY,
  });
  assert.deepEqual(result, { ok: false, reason: 'already-queued' });
});

test('readies the hold placed first', () => {
  const store = sampleStore({
    holds: [
      hold({ id: 'hold_b', member: ADA, placedOn: '2026-11-03' }),
      hold({ id: 'hold_a', member: BEN, placedOn: '2026-11-01' }),
    ],
  });
  const ready = fulfilNextHold(store, BOOK.id, TODAY);
  assert.equal(ready.memberId, BEN.id);
  assert.equal(ready.readyOn, TODAY);
});

test('a ready hold can be collected for ten days, until the branch next opens', () => {
  assert.equal(
    pickupDeadline(hold({ id: 'h', member: ADA, placedOn: '2026-11-01', readyOn: '2026-11-19' })),
    '2026-11-30',
  );
  assert.equal(
    pickupDeadline(hold({ id: 'h', member: ADA, placedOn: '2026-11-01', readyOn: '2026-11-15' })),
    '2026-11-25',
  );
});

test('expires the ready holds that nobody collected in time', () => {
  const store = sampleStore({
    holds: [
      hold({ id: 'hold_a', member: BEN, placedOn: '2026-10-01', status: 'ready', readyOn: '2026-11-02' }),
      hold({ id: 'hold_b', member: CY, placedOn: '2026-10-02', status: 'ready', readyOn: '2026-11-24' }),
    ],
  });
  const expired = expireUncollectedHolds(store, TODAY);
  assert.deepEqual(
    expired.map((expiredHold) => expiredHold.id),
    ['hold_a'],
  );
  assert.equal(store.listHolds(BOOK.id).find((stored) => stored.id === 'hold_b').status, 'ready');
});
