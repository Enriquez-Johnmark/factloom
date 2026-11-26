import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidBarcode, normaliseBarcode } from '../lib/catalog/barcodes.js';
import { searchCatalog } from '../lib/catalog/search.js';
import { BOOK, DVD, LAPTOP, MAGAZINE } from './sample-library.js';

const items = [BOOK, DVD, LAPTOP, MAGAZINE];

test('finds the items whose title or author holds every word of the query', () => {
  assert.deepEqual(
    searchCatalog(items, 'le guin darkness').map((item) => item.id),
    [BOOK.id],
  );
  assert.deepEqual(
    searchCatalog(items, 'MIYAZAKI').map((item) => item.id),
    [DVD.id],
  );
});

test('sorts the results by title, leaving out a leading article', () => {
  assert.deepEqual(
    searchCatalog(items, 'a').map((item) => item.title),
    ['Chromebook 14', 'The Left Hand of Darkness', 'National Geographic, November 2026', 'Spirited Away'],
  );
});

test('finds nothing for an empty query', () => {
  assert.deepEqual(searchCatalog(items, '  '), []);
});

test('accepts a barcode with the right check digit only', () => {
  assert.equal(isValidBarcode('31234000000016'), true);
  assert.equal(isValidBarcode('31234000000017'), false);
  assert.equal(isValidBarcode('3123400000001'), false);
});

test('removes spaces and dashes from a scanned barcode', () => {
  assert.equal(normaliseBarcode('3123-4000 0000 16'), '31234000000016');
});
