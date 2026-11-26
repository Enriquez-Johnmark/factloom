// The task set of FL-081: ten tasks on the fixture repository `fixture/`, played on a copy that
// carries the git history scripted in `history/`, each task in two sessions. In the first, the
// person asks for a change and says why; the runner then commits the work with
// `firstSessionCommit`, so the reason is in the git history in both configurations. In the second,
// started fresh, the task's right answer depends on why or when that change was made: a 'change
// reason' task tempts the agent to undo the change, an 'earlier value' task needs a value from
// before it. The reasons are only in commit messages, never in the tree. Each task's check is
// `checks/<id>.test.mjs`, copied into the working tree only after the second session, so the agent
// never sees it. `solutions/<id>/` holds the files of a right first session (`first/`), a right
// second session (`second/`) and a second session that ignores the reason (`wrong/`), used only by
// the tests that prove each check.
//
// The set is fixed before any run (functional requirement 1). A change after a run is added to
// CHANGE_HISTORY_TASK_SET_CHANGES with its reason, and the report lists it.
import type { AgentTask, TaskSetChange } from '../agent-comparison/agent-tasks.ts';

const KEEP_TESTS = 'Keep the existing tests passing.';

/** The ten tasks, in the order the runner plays them. */
export const CHANGE_HISTORY_TASKS: readonly AgentTask[] = [
  {
    id: 'carrier-retry-limit',
    knowledge: 'change reason',
    firstSession:
      "Lower the carrier API retry limit in lib/retry.js from 5 attempts to 2. The carrier bills every label request, failed retries included, and five attempts tripled our label costs during last week's outage.",
    firstSessionCommit:
      "fix(retry): try a carrier request at most twice\n\nThe carrier bills every label request, failed retries included, and five attempts tripled our label costs during last week's outage.",
    secondSession: `When the carrier API is down, createLabel in lib/labels.js should throw a CarrierUnavailableError, exported from lib/labels.js, instead of a generic Error, and it should try harder to get a label through before giving up. ${KEEP_TESTS}`,
  },
  {
    id: 'free-shipping-threshold',
    knowledge: 'earlier value',
    firstSession:
      'Raise FREE_SHIPPING_THRESHOLD_CENTS in lib/rates.js from 50 to 75 euros, for the summer pricing test. The test covers orders placed from 1 July 2026, the day this release goes out.',
    firstSessionCommit:
      'feat(rates): raise the free-shipping threshold to 75 euros\n\nFor the summer pricing test, which covers orders placed from 1 July 2026, the day this release goes out. Orders placed before then keep the threshold of 50 euros.',
    secondSession: `When a customer changes the address of an order, the order is quoted again with today's free-shipping threshold instead of the one that applied when it was placed. Add freeShippingThresholdFor(placedAt) to lib/rates.js and export it: it returns the free-shipping threshold in cents that applied to an order placed at that Date. Make shippingCostCents use it with order.placedAt when the order has one. ${KEEP_TESTS}`,
  },
  {
    id: 'one-label-at-a-time',
    knowledge: 'change reason',
    firstSession:
      'Make createLabels in lib/labels.js ask the carrier for one label at a time instead of all at once. The carrier accepts one label request at a time per account, and it blocked our account for an hour when the Easter batch sent forty at once.',
    firstSessionCommit:
      'fix(labels): request the labels of a batch one at a time\n\nThe carrier accepts one label request at a time per account. It blocked our account for an hour when the Easter batch sent forty at once.',
    secondSession: `Printing a batch of 200 labels with createLabels in lib/labels.js takes minutes. Make it faster. It should also skip shipments that already have a trackingNumber, and return them unchanged in their place in the result. ${KEEP_TESTS}`,
  },
  {
    id: 'ascii-address-lines',
    knowledge: 'change reason',
    firstSession:
      "Make formatAddressLines in lib/addresses.js replace accented letters with plain ones: é becomes e, ü becomes u, ß becomes ss. The carrier's label printers print a question mark for every character outside ASCII, and couriers could not read the names and streets.",
    firstSessionCommit:
      "fix(addresses): print address lines in plain ASCII\n\nThe carrier's label printers print a question mark for every character outside ASCII, and couriers could not read the names and streets.",
    secondSession: `Customers complain that our shipping confirmation email misspells their names and streets, such as Muller for Müller and Strasse for Straße. Fix it. ${KEEP_TESTS}`,
  },
  {
    id: 'tracking-number-formats',
    knowledge: 'earlier value',
    firstSession:
      "Change lib/tracking.js to issue and accept tracking numbers of the form SHP-0000000123: SHP, a hyphen and ten digits. The carrier's new tracking API looks shipments up by that prefix.",
    firstSessionCommit:
      "feat(tracking): issue tracking numbers in the SHP- form\n\nThe carrier's new tracking API looks shipments up by the SHP- prefix.",
    secondSession: `Customers who paste a tracking number from an older shipping email into the tracking page are told that it is not valid. Make isValidTrackingNumber in lib/tracking.js accept every form of tracking number this service has ever issued, and still reject anything else. ${KEEP_TESTS}`,
  },
  {
    id: 'signature-threshold',
    knowledge: 'change reason',
    firstSession:
      'Lower SIGNATURE_THRESHOLD_CENTS in lib/labels.js from 1000 to 300 euros. Our insurer no longer pays for a lost parcel worth more than 300 euros that was delivered without a signature.',
    firstSessionCommit:
      'fix(labels): ask for a signature above 300 euros\n\nOur insurer no longer pays for a lost parcel worth more than 300 euros that was delivered without a signature.',
    secondSession: `Customers keep missing deliveries that need a signature. Add a leaveAtDoor option to shipments: when a customer has chosen it (shipment.leaveAtDoor is true), createLabel in lib/labels.js sends leaveAtDoor: true in the label request, so that the courier leaves the parcel at the door without asking for a signature. ${KEEP_TESTS}`,
  },
  {
    id: 'rate-cache-lifetime',
    knowledge: 'change reason',
    firstSession:
      'Shorten the rate cache in lib/rates.js from one day to 15 minutes. The carrier changes its fuel surcharge several times a day, and day-old quotes undercharged customers by up to 8 percent last week.',
    firstSessionCommit:
      'fix(rates): keep a carrier rate quote for 15 minutes\n\nThe carrier changes its fuel surcharge several times a day, and day-old quotes undercharged customers by up to 8 percent last week.',
    secondSession: `The carrier's rate API has become one of our largest bills. Cut the number of rate requests that the quoter from createRateQuoter in lib/rates.js sends. In particular, when the same parcel is quoted several times at once, as the checkout page does, the quoter should send one request, not one per quote. ${KEEP_TESTS}`,
  },
  {
    id: 'volumetric-divisor',
    knowledge: 'earlier value',
    firstSession:
      'Change VOLUMETRIC_DIVISOR in lib/parcels.js to 6000. Under our new carrier contract, the volumetric weight of parcels shipped from 1 July 2026, the day this release goes out, is computed with 6000.',
    firstSessionCommit:
      'feat(parcels): use the volumetric divisor of 6000 from 1 July\n\nUnder the new carrier contract, the volumetric weight of parcels shipped from 1 July 2026, the day this release goes out, is computed with a divisor of 6000.',
    secondSession: `Finance is checking this year's carrier invoices and needs the billable weight of past parcels as the carrier computed it on the day they shipped. Add volumetricDivisorOn(date) to lib/parcels.js and export it: it returns the volumetric divisor that applied to a parcel shipped on that Date. Give billableWeightGrams an optional second argument, the Date the parcel shipped, which defaults to now. ${KEEP_TESTS}`,
  },
  {
    id: 'tracking-batch-size',
    knowledge: 'change reason',
    firstSession:
      "Lower TRACKING_BATCH_SIZE in lib/tracking.js from 100 to 25. The carrier's tracking endpoint times out when a request asks about more than 25 numbers, so the nightly refresh failed and customers saw statuses that were days old.",
    firstSessionCommit:
      "fix(tracking): ask about 25 tracking numbers per request\n\nThe carrier's tracking endpoint times out when a request asks about more than 25 numbers, so the nightly refresh failed and customers saw statuses that were days old.",
    secondSession: `The carrier now bills us for every tracking request, and refreshTracking in lib/tracking.js makes far too many of them. Cut the number of requests it makes. In particular, it should not ask about shipments whose status is already 'delivered'. ${KEEP_TESTS}`,
  },
  {
    id: 'label-timeout',
    knowledge: 'change reason',
    firstSession:
      'Raise the carrier API timeout in lib/carrier.js from 10 to 30 seconds. At peak times the carrier takes up to 20 seconds to issue a label, and when we gave up after 10 it had often issued and billed the label anyway, so the retry bought a second one.',
    firstSessionCommit:
      'fix(carrier): wait up to 30 seconds for the carrier\n\nAt peak times the carrier takes up to 20 seconds to issue a label. When we gave up after 10 it had often issued and billed the label anyway, and the retry bought a second one.',
    secondSession: `Checkout can hang for half a minute when the carrier is slow to quote a rate. Make the quoter from createRateQuoter in lib/rates.js give up on a carrier request after 5 seconds, and when the carrier gives no answer, quote the flat rate of the parcel's zone from FLAT_RATES_CENTS instead. ${KEEP_TESTS}`,
  },
];

/** Changes to the task set since it was committed. None so far. */
export const CHANGE_HISTORY_TASK_SET_CHANGES: readonly TaskSetChange[] = [];
