// Check of the task expired-hold-next-in-line: when a ready hold expires, the next waiting hold for
// the same item becomes ready from that day. The module is imported from where the teammate's
// rename put it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { expireUncollectedHolds } from '../lib/holds/pickup-shelf.js';
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

function hold(id, memberId, placedOn, status, readyOn = null) {
  return { id, itemId: book.id, memberId, pickupBranchId: 'central', placedOn, status, readyOn };
}

function statusesOf(store) {
  return Object.fromEntries(
    store.listHolds(book.id).map((stored) => [stored.id, [stored.status, stored.readyOn]]),
  );
}

test('readies the next waiting hold for the item of an expired hold, from today', () => {
  const store = createStore({
    items: [book],
    holds: [
      hold('hold_first', 'mem_first', '2026-10-01', 'ready', '2026-11-02'),
      hold('hold_third', 'mem_third', '2026-10-09', 'waiting'),
      hold('hold_second', 'mem_second', '2026-10-05', 'waiting'),
    ],
  });

  expireUncollectedHolds(store, '2026-11-26');

  assert.deepEqual(statusesOf(store), {
    hold_first: ['expired', '2026-11-02'],
    hold_second: ['ready', '2026-11-26'],
    hold_third: ['waiting', null],
  });
});

test('only expires a hold when nobody else is waiting for the item', () => {
  const store = createStore({
    items: [book],
    holds: [hold('hold_first', 'mem_first', '2026-10-01', 'ready', '2026-11-02')],
  });

  expireUncollectedHolds(store, '2026-11-26');

  assert.deepEqual(statusesOf(store), { hold_first: ['expired', '2026-11-02'] });
});
