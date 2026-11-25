import { findCustomer } from './customers.js';
import { addDays } from './dates.js';
import { createInvoice, invoiceTotal, listInvoices } from './invoices.js';

/** Answers one request, `{ method, path, body }`, with a response, `{ status, body }`. */
export function handle(request) {
  if (request.method === 'GET' && request.path === '/invoices') {
    return { status: 200, body: { invoices: listInvoices().map(toInvoiceBody) } };
  }
  if (request.method === 'POST' && request.path === '/invoices') {
    const { customerId, lines } = request.body ?? {};
    if (findCustomer(customerId) === undefined) return { status: 400, body: 'Unknown customer' };
    return { status: 201, body: toInvoiceBody(createInvoice({ customerId, lines })) };
  }
  return { status: 404, body: 'Not found' };
}

function toInvoiceBody(invoice) {
  return {
    id: invoice.id,
    customerId: invoice.customerId,
    issuedOn: invoice.issuedOn,
    currency: invoice.currency,
    totalCents: invoiceTotal(invoice),
    dueDate: addDays(invoice.issuedOn, 30).toISOString().slice(0, 10),
  };
}
