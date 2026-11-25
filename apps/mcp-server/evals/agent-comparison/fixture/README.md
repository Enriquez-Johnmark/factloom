# invoice-service

Creates and lists the invoices of the shop's customers. It has no dependencies: it runs on Node.js 22 or later alone.

`npm test` runs the tests in `test/`.

| Path | Holds |
|---|---|
| `lib/routes.js` | The HTTP routes, as one function from a request to a response |
| `lib/invoices.js` | Invoices and their totals |
| `lib/customers.js` | The customers, read from `lib/data/customers.json` |
| `lib/money.js` | Amounts, in cents |
| `lib/dates.js` | Calendar dates |
| `lib/config.js` | Settings read from environment variables |
| `lib/legacy/tax.js` | Tax rates, from the old billing system |
