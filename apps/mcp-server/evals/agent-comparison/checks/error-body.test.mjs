// Check of the task error-body: an error body is { error: { code, message } } with an upper-case code.
import assert from 'node:assert/strict';
import test from 'node:test';
import { handle } from '../lib/routes.js';

test('returns a known customer', () => {
  const response = handle({ method: 'GET', path: '/customers/cus_004' });
  assert.equal(response.status, 200);
  const customer = response.body?.customer ?? response.body;
  assert.equal(customer.id, 'cus_004');
});

test('answers an unknown customer with 404 and the agreed error body', () => {
  const response = handle({ method: 'GET', path: '/customers/cus_999' });
  assert.equal(response.status, 404);
  assert.match(response.body?.error?.code ?? '', /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/);
  assert.equal(typeof response.body.error.message, 'string');
  assert.notEqual(response.body.error.message.trim(), '');
});
