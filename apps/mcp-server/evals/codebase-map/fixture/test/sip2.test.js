import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCheckoutMessage, parseCheckoutRequest } from '../lib/legacy/sip2.js';
import { ADA, BOOK, sampleStore, TODAY } from './sample-library.js';

test('reads the card number and the barcode of a checkout request', () => {
  assert.deepEqual(parseCheckoutRequest(`11|AA${ADA.cardNumber}|AB${BOOK.barcode}|`), {
    cardNumber: ADA.cardNumber,
    barcode: BOOK.barcode,
  });
});

test('lends the item and replies with its due date', () => {
  const store = sampleStore();
  const reply = handleCheckoutMessage(store, `11|AA${ADA.cardNumber}|AB${BOOK.barcode}|`, TODAY);
  assert.equal(reply, `121|AB${BOOK.id}|AH2026-12-17|`);
  assert.equal(store.findOpenLoan(BOOK.id).memberId, ADA.id);
});

test('refuses a card nobody holds', () => {
  const reply = handleCheckoutMessage(sampleStore(), `11|AA29999999999999|AB${BOOK.barcode}|`, TODAY);
  assert.equal(reply, '120|AFunknown-member|');
});

test('refuses a message that is not a checkout request', () => {
  assert.throws(() => parseCheckoutRequest('93|CNdesk|'), /Not a checkout request/);
});
