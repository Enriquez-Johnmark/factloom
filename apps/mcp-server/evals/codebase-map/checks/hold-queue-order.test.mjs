// Check of the task hold-queue-order: only the member at the front of the hold queue, by the day
// their hold was placed, may check an item out. The blocking-hold lookup is imported from where the
// teammate's move put it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOutItem } from '../lib/circulation/checkout.js';
import { findBlockingHold } from '../lib/holds/queue.js';
import { createStore } from '../lib/store/memory-store.js';

const book = {
  id: 'itm_check',
  barcode: '31234000000065',
  title: 'Middlemarch',
  author: 'George Eliot',
  format: 'book',
  branchId: 'central',
  status: 'in-service',
  replacementCostCents: 1500,
};

function member(id, cardNumber) {
  return {
    id,
    name: id,
    email: `${id}@example.org`,
    phone: '+15550109999',
    notify: 'email',
    type: 'adult',
    cardNumber,
    cardExpiresOn: '2028-01-31',
    homeBranchId: 'central',
    blocked: false,
  };
}

/** The member placed first is stored last, so that store order and queue order differ. */
function libraryWithQueue() {
  return createStore({
    items: [book],
    members: [
      member('mem_front', '21234000000001'),
      member('mem_behind', '21234000000002'),
      member('mem_none', '21234000000003'),
    ],
    holds: [
      {
        id: 'hold_behind',
        itemId: book.id,
        memberId: 'mem_behind',
        pickupBranchId: 'central',
        placedOn: '2026-11-12',
        status: 'waiting',
        readyOn: null,
      },
      {
        id: 'hold_front',
        itemId: book.id,
        memberId: 'mem_front',
        pickupBranchId: 'central',
        placedOn: '2026-11-05',
        status: 'waiting',
        readyOn: null,
      },
    ],
  });
}

test('lends the item to the member at the front of the queue', () => {
  const result = checkOutItem(libraryWithQueue(), {
    barcode: book.barcode,
    memberId: 'mem_front',
    today: '2026-11-26',
  });
  assert.equal(result.ok, true);
});

test('refuses the item to a member behind the front of the queue, and to a member with no hold', () => {
  for (const memberId of ['mem_behind', 'mem_none']) {
    const result = checkOutItem(libraryWithQueue(), { barcode: book.barcode, memberId, today: '2026-11-26' });
    assert.deepEqual(result, { ok: false, reason: 'on-hold' }, memberId);
  }
});

test('finds no blocking hold for the front of the queue, and the front hold for anyone else', () => {
  const store = libraryWithQueue();
  assert.equal(findBlockingHold(store, book.id, 'mem_front'), null);
  assert.equal(findBlockingHold(store, book.id, 'mem_behind')?.memberId, 'mem_front');
});
