// Check of the task accent-search: catalog search ignores accents in the query and in titles and
// authors. It compares the ids found, not their order.
import assert from 'node:assert/strict';
import test from 'node:test';
import { searchCatalog } from '../lib/catalog/search.js';

const items = [
  { id: 'itm_cien', title: 'Cien años de soledad', author: 'Gabriel García Márquez', format: 'book' },
  {
    id: 'itm_amor',
    title: 'El amor en los tiempos del cólera',
    author: 'Gabriel García Márquez',
    format: 'book',
  },
  { id: 'itm_hobbit', title: 'The Hobbit', author: 'J. R. R. Tolkien', format: 'book' },
];

function idsFound(query) {
  return searchCatalog(items, query)
    .map((item) => item.id)
    .sort();
}

test('finds an author written with accents from a query without them', () => {
  assert.deepEqual(idsFound('garcia marquez'), ['itm_amor', 'itm_cien']);
});

test('finds a title written with accents from a query without them', () => {
  assert.deepEqual(idsFound('anos soledad'), ['itm_cien']);
  assert.deepEqual(idsFound('colera'), ['itm_amor']);
});

test('still finds an author from a query with the accents, in any case', () => {
  assert.deepEqual(idsFound('GARCÍA Márquez'), ['itm_amor', 'itm_cien']);
});

test('still leaves out the items that do not match', () => {
  assert.deepEqual(idsFound('tolkien'), ['itm_hobbit']);
});
