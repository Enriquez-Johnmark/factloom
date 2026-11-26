# lending-desk

The lending desk service of the city library: checkouts, returns, renewals, holds, fees, notices
to members, and the self-check machines. Plain Node.js ES modules, no dependencies, no build step.

## Commands

- `npm test` runs every test in `test/` with `node --test`. Tests share the sample data of
  `test/sample-library.js`.
- `npm start` serves the API on port 8080 with the demo data of `lib/store/seed.js`.

## Conventions

- Dates are calendar dates as `YYYY-MM-DD` strings, compared as strings; date arithmetic is in
  `lib/helpers/dates.js` and works in UTC.
- Money is in integer cents.
- An operation that can be refused returns `{ ok: true, ... }` or `{ ok: false, reason }`. The API
  answers errors as `{ error: { code, message } }` (`lib/server/respond.js`).
- Every module reads and writes through the store of `lib/store/memory-store.js`, passed as the
  first argument.

## Where things are

- `lib/index.js`: the public API, re-exported from the modules below.
- `lib/config/defaults.js`: loan rules per format (loan days, renewal limits), loan limits per
  member type, card validity. `lib/config/branches.js`: the branches, their closed weekdays and
  holidays, `branchById`.
- `lib/helpers/dates.js`: date arithmetic, and the opening days of a branch (`isOpenOn`,
  `nextOpenDay`). `lib/helpers/text.js`: normalising text for search, filling templates. Also
  `lib/helpers/money.js` and `lib/helpers/ids.js`.
- `lib/catalog/items.js`: whether an item may be lent. `lib/catalog/barcodes.js`: normalising and
  validating barcodes. `lib/catalog/search.js`: catalog search.
- `lib/circulation/checkout.js`: lending an item, and `findBlockingHold`, the hold that stops a
  checkout. `lib/circulation/returns.js`: taking an item back (late fee, next hold).
  `lib/circulation/renewals.js`, `lib/circulation/due-dates.js`.
- `lib/members/accounts.js`: finding a member by card. `lib/members/cards.js`: expiry and renewal
  of cards. `lib/members/eligibility.js`: whether a member may borrow.
- `lib/fees/schedule.js`: daily rates and grace days. `lib/fees/assess.js`: the late fee of a
  return. `lib/fees/balance.js`: what a member owes. `lib/fees/waivers.js`, `lib/fees/payments.js`.
- `lib/holds/queue.js`: placing holds, the queue of an item, readying the next hold.
  `lib/holds/pickup.js`: pickup deadlines, expiring uncollected holds. `lib/holds/notify.js`: the
  hold-ready notice.
- `lib/notices/templates.js`: the text of each notice. `lib/notices/compose.js`: building a notice.
  `lib/notices/channels.js`: email or SMS. `lib/notices/digest.js`: the morning run of reminders
  and overdue notices.
- `lib/reports/`: overdue loans, loans per branch.
- `lib/server/app.js`: routing; `lib/server/routes/` has one file per area (loans, holds, members,
  catalog). `lib/server/respond.js`: response helpers. `lib/server/http.js`: the HTTP server.
- `lib/legacy/sip2.js`: the protocol of the self-check machines. `lib/legacy/csv-export.js`: the
  county's nightly export.
