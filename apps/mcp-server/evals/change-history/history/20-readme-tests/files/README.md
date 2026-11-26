# shipping-service

Buys carrier labels for the shop's orders and quotes their shipping costs. It has no dependencies: it runs on Node.js 22 or later alone.

`npm test` runs the tests in `test/`. The carrier is never called by a test: each one passes a fake transport.

| Path | Holds |
|---|---|
| `lib/labels.js` | Carrier labels for shipments |
| `lib/rates.js` | Shipping costs and the carrier's rate quotes |
| `lib/parcels.js` | Parcel weights |
| `lib/addresses.js` | Address lines |
| `lib/tracking.js` | Tracking numbers and shipment statuses |
| `lib/notifications.js` | Emails to customers |
| `lib/carrier.js` | Requests to the carrier API, through a transport that makes the HTTP call |
| `lib/retry.js` | Retries of carrier requests |
| `lib/config.js` | Settings read from environment variables |
