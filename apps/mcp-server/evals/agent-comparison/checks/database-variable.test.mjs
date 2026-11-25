// Check of the task database-variable: the URL comes from INVOICE_DB_URL, never DATABASE_URL.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../lib/config.js';

test('reads the database URL from INVOICE_DB_URL', () => {
  const config = readConfig({ INVOICE_DB_URL: 'postgres://invoices', DATABASE_URL: 'postgres://shared' });
  assert.equal(config.databaseUrl, 'postgres://invoices');
});

test('does not fall back to DATABASE_URL', () => {
  assert.throws(() => readConfig({ DATABASE_URL: 'postgres://shared' }));
});

test('still reads the port', () => {
  assert.equal(readConfig({ INVOICE_DB_URL: 'postgres://invoices', PORT: '9000' }).port, 9000);
});
