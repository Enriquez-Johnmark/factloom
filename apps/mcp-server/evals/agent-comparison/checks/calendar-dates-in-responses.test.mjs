// Check of the task calendar-dates-in-responses: a date in a response body is a calendar date string.
import assert from 'node:assert/strict';
import test from 'node:test';
import { handle } from '../lib/routes.js';

function findInvoice(id) {
  const response = handle({ method: 'GET', path: '/invoices' });
  assert.equal(response.status, 200);
  return response.body.invoices.find((invoice) => invoice.id === id);
}

test('gives the due date 30 days after the issue date as a calendar date', () => {
  assert.equal(findInvoice('inv_1').dueDate, '2026-04-30');
  assert.equal(findInvoice('inv_2').dueDate, '2026-05-02');
});
