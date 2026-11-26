// Check of the task selfcheck-card-numbers: a self-check machine's checkout goes through when the
// card number has spaces or dashes in it. The module is imported from where the teammate's rename
// put it; a reply that starts with 121 is a checkout that went through, 120 one that did not.
import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCheckoutMessage } from '../lib/selfcheck/sip2.js';
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
const member = {
  id: 'mem_check',
  name: 'Check Member',
  email: 'check@example.org',
  phone: '+15550109999',
  notify: 'email',
  type: 'adult',
  cardNumber: '21234000567890',
  cardExpiresOn: '2028-01-31',
  homeBranchId: 'central',
  blocked: false,
};

function library() {
  return createStore({ items: [book], members: [member] });
}

test('lends the item when the card number has spaces in it', () => {
  const store = library();
  const reply = handleCheckoutMessage(store, `11|AA2123 4000 5678 90|AB${book.barcode}|`, '2026-11-26');
  assert.ok(reply.startsWith('121'), reply);
  assert.equal(store.findOpenLoan(book.id)?.memberId, member.id);
});

test('lends the item when the card number has dashes in it', () => {
  const reply = handleCheckoutMessage(library(), `11|AA2123-4000-5678-90|AB${book.barcode}|`, '2026-11-26');
  assert.ok(reply.startsWith('121'), reply);
});

test('still refuses a card number nobody holds', () => {
  const reply = handleCheckoutMessage(library(), `11|AA2999 9999 9999 99|AB${book.barcode}|`, '2026-11-26');
  assert.ok(reply.startsWith('120'), reply);
});
