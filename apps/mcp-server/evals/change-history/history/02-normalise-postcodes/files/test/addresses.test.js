import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAddressLines } from '../lib/addresses.js';

const address = {
  name: 'Ada Byrne',
  street: '12 Harbour Road',
  postcode: 'D02 X285',
  city: 'Dublin',
  country: 'IE',
};

test('prints the name, the street, the postcode with the city, and the country', () => {
  assert.deepEqual(formatAddressLines(address), ['Ada Byrne', '12 Harbour Road', 'D02 X285 Dublin', 'IE']);
});

test('prints the postcode in capitals with single spaces', () => {
  assert.equal(formatAddressLines({ ...address, postcode: ' d02   x285 ' })[2], 'D02 X285 Dublin');
});
