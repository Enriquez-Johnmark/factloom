// The task set of FL-074: ten tasks on the fixture repository `fixture/`, each in two sessions.
// The first session tells the agent something the code does not show; the second, started
// fresh in the same working tree, gives a task that depends on it. Each task's check is
// `checks/<id>.test.mjs`, copied into the working tree only after the second session, so the
// agent never sees it. `solutions/<id>/` holds one answer that passes it, used only by the tests
// that prove each check can pass and can fail.
//
// The set is fixed before any run (functional requirement 1). A change after a run is added to
// TASK_SET_CHANGES with its reason, and the report lists it.

/** What the first session gives the agent. */
export type KnowledgeKind = 'decision' | 'convention' | 'bug cause';

export type AgentTask = {
  readonly id: string;
  readonly knowledge: KnowledgeKind;
  /** The prompt of the first session: the knowledge, with a request to remember it. */
  readonly firstSession: string;
  /** The prompt of the second session: a task that depends on that knowledge. */
  readonly secondSession: string;
};

/** A change to the task set after it was committed, listed in every report. */
export type TaskSetChange = { readonly date: string; readonly taskId: string; readonly reason: string };

const REMEMBER = 'Remember this for future sessions. No code change is needed now.';
const KEEP_TESTS = 'Keep the existing tests passing.';

/** The ten tasks, in the order the runner plays them. */
export const AGENT_TASKS: readonly AgentTask[] = [
  {
    id: 'refund-rounding',
    knowledge: 'decision',
    firstSession: `A decision from finance: a partial refund is always rounded down to the whole cent, never to the nearest cent. The payment provider refuses a refund that exceeds what is left of the captured amount, and rounding to the nearest cent made the last of several partial refunds fail. ${REMEMBER}`,
    secondSession: `Add a function computeRefund(totalCents, percent) to a new file lib/refunds.js and export it. It returns the refund in cents when a customer gets percent percent of an amount of totalCents back. ${KEEP_TESTS}`,
  },
  {
    id: 'error-body',
    knowledge: 'convention',
    firstSession: `Our API convention, agreed with the mobile team: every error response body is { "error": { "code": "...", "message": "..." } }, and the code is upper case with underscores, such as INVOICE_NOT_FOUND. The mobile app switches on the code and shows the message as it is. The plain-text errors already in lib/routes.js are older than the convention and will be migrated separately. ${REMEMBER}`,
    secondSession: `Add a route GET /customers/:id to lib/routes.js. It answers with status 200 and the customer, or with status 404 when no customer has that id. ${KEEP_TESTS}`,
  },
  {
    id: 'utc-dates',
    knowledge: 'bug cause',
    firstSession: `We found the cause of last week's bug, where invoices created just after midnight got a due date one day off: some code used local-time Date methods (getDate, getMonth, setMonth, new Date(year, month, day)), the servers run in America/Los_Angeles time, and our dates are midnight UTC. The rule since then: date code in this repository uses only the UTC methods, such as Date.UTC, getUTCDate and getUTCMonth. ${REMEMBER}`,
    secondSession: `Add a function endOfMonth(date) to lib/dates.js and export it. Given a Date, it returns the last day of that month, as a Date like the ones parseIsoDate returns. ${KEEP_TESTS}`,
  },
  {
    id: 'invoice-number',
    knowledge: 'decision',
    firstSession: `We decided the format of printed invoice numbers: INV, a hyphen, the four-digit year of issue, a hyphen, and the sequence number padded with zeros to six digits, such as INV-2026-000123. The accounting export sorts invoice numbers as text, so the padding matters. ${REMEMBER}`,
    secondSession: `Add a function formatInvoiceNumber(year, sequence) to lib/invoices.js and export it. It returns the invoice number printed on the PDF and in the accounting export. ${KEEP_TESTS}`,
  },
  {
    id: 'database-variable',
    knowledge: 'decision',
    firstSession: `The deploy team settled the name of the database variable: this service reads its connection string from INVOICE_DB_URL, never from DATABASE_URL. On our host DATABASE_URL points at the platform's shared database, and a service that read it would write invoices there. ${REMEMBER}`,
    secondSession: `lib/config.js needs the database connection string as well. Add databaseUrl to what readConfig returns, read from the environment, and make readConfig throw an error when it is not set. ${KEEP_TESTS}`,
  },
  {
    id: 'currency-from-region',
    knowledge: 'decision',
    firstSession: `A decision about currencies: an invoice's currency always follows the customer's region. EU is EUR, UK is GBP, and every US region (US_CA, US_NY and any other) is USD. It is never taken from the request, because a client once sent USD for a German customer and the bank rejected the payout. ${REMEMBER}`,
    secondSession: `Customers report that invoices created through POST /invoices sometimes have the wrong currency. Fix how POST /invoices sets the currency of a new invoice. ${KEEP_TESTS}`,
  },
  {
    id: 'wholesale-tax',
    knowledge: 'decision',
    firstSession: `A rule from our accountant: customers whose tier is "wholesale" are resellers with a resale certificate, so we never charge them tax, not even in a region that has a tax rate. ${REMEMBER}`,
    secondSession: `Add a function invoiceTotalWithTax(invoice) to lib/invoices.js and export it. It returns the invoice total in cents plus the tax for the customer's region, using taxCents from lib/legacy/tax.js. ${KEEP_TESTS}`,
  },
  {
    id: 'no-personal-data-in-logs',
    knowledge: 'convention',
    firstSession: `A privacy rule from our security review: log lines are sent to a third-party log service, so a log line must never contain a customer's name or email address. Name a customer in a log line by their id, such as cus_002, and nothing else. ${REMEMBER}`,
    secondSession: `Add a function logInvoiceCreated(invoice, log = console.log) to a new file lib/audit.js and export it. It calls log once with a readable line saying that the invoice was created, who the customer is, and the invoice total. ${KEEP_TESTS}`,
  },
  {
    id: 'export-sorted-by-id',
    knowledge: 'bug cause',
    firstSession: `We found why the nightly customer export kept showing changes when nothing had changed: listCustomers() returns customers in the order the store holds them, and in production that order is not stable. Anything that writes customers out in a list must sort them by id first. ${REMEMBER}`,
    secondSession: `Add a function exportCustomersCsv() to a new file lib/export.js and export it. It returns the customers as CSV text: the header line id,name,region and then one line per customer. ${KEEP_TESTS}`,
  },
  {
    id: 'calendar-dates-in-responses',
    knowledge: 'convention',
    firstSession: `Agreed with the mobile team: a date in an API response body is a calendar date, a string such as 2026-03-31, never a full timestamp. The app showed full timestamps in the user's time zone, and customers west of UTC saw the day before. The issuedOn field of GET /invoices still returns a Date and will be migrated separately. ${REMEMBER}`,
    secondSession: `Add a dueDate field to each invoice in the body of GET /invoices: 30 days after its issuedOn. ${KEEP_TESTS}`,
  },
];

/** Changes to the task set since it was committed. None so far. */
export const TASK_SET_CHANGES: readonly TaskSetChange[] = [];
