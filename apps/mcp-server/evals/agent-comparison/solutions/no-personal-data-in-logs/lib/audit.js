import { invoiceTotal } from './invoices.js';
import { formatCents } from './money.js';

/** Logs that an invoice was created, naming the customer by id only. */
export function logInvoiceCreated(invoice, log = console.log) {
  const total = formatCents(invoiceTotal(invoice), invoice.currency);
  log(`Invoice ${invoice.id} created for customer ${invoice.customerId}, total ${total}`);
}
