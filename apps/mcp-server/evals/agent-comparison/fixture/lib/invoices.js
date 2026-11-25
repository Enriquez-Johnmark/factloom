import { parseIsoDate } from './dates.js';
import { addCents } from './money.js';

const invoices = [
  {
    id: 'inv_1',
    customerId: 'cus_003',
    issuedOn: parseIsoDate('2026-03-31'),
    currency: 'EUR',
    lines: [{ description: 'Espresso beans, 1 kg', quantity: 2, unitPriceCents: 1850 }],
  },
  {
    id: 'inv_2',
    customerId: 'cus_002',
    issuedOn: parseIsoDate('2026-04-02'),
    currency: 'USD',
    lines: [
      { description: 'Grinder', quantity: 1, unitPriceCents: 12900 },
      { description: 'Filter papers', quantity: 3, unitPriceCents: 450 },
    ],
  },
];
let nextNumber = 3;

/** Returns the total of an invoice in cents. */
export function invoiceTotal(invoice) {
  return addCents(...invoice.lines.map((line) => line.quantity * line.unitPriceCents));
}

/** Creates an invoice for a customer, keeps it, and returns it. */
export function createInvoice({ customerId, lines, currency = 'EUR', issuedOn = new Date() }) {
  const invoice = { id: `inv_${nextNumber}`, customerId, issuedOn, currency, lines };
  nextNumber += 1;
  invoices.push(invoice);
  return invoice;
}

/** Returns every invoice. */
export function listInvoices() {
  return [...invoices];
}
