import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../lib/config.js';

test('reads the port and the carrier API URL from the environment', () => {
  assert.deepEqual(readConfig({ PORT: '9000', CARRIER_API_URL: 'https://carrier.test' }), {
    port: 9000,
    carrierApiUrl: 'https://carrier.test',
  });
});

test('listens on port 8080 and calls the production carrier API by default', () => {
  assert.deepEqual(readConfig({}), { port: 8080, carrierApiUrl: 'https://api.carrier.example.com/v2' });
});
