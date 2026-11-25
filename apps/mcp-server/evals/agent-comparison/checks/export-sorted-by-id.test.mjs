// Check of the task export-sorted-by-id: the CSV export is sorted by id, whatever order the store returns.
import assert from 'node:assert/strict';
import test from 'node:test';
import { exportCustomersCsv } from '../lib/export.js';

function readLines() {
  return exportCustomersCsv()
    .split(/\r?\n/)
    .filter((line) => line !== '');
}

test('starts with the header line', () => {
  assert.equal(readLines()[0], 'id,name,region');
});

test('lists the customers sorted by id', () => {
  const ids = readLines()
    .slice(1)
    .map((line) => line.split(',')[0]);
  assert.deepEqual(ids, ['cus_001', 'cus_002', 'cus_003', 'cus_004', 'cus_005']);
});

test('writes the id, name and region of a customer', () => {
  assert.equal(readLines()[1], 'cus_001,Bram de Vries,EU');
});
