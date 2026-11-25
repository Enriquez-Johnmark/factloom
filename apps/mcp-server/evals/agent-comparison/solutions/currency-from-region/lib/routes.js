import { findCustomer } from './customers.js';
import { createInvoice, invoiceTotal, listInvoices } from './invoices.js';

/** Answers one request, `{ method, path, body }`, with a response, `{ status, body }`. */
export function handle(request) {
  if (request.method === 'GET' && request.path === '/invoices') {
    return { status: 200, body: { invoices: listInvoices().map(toInvoiceBody) } };
  }
  if (request.method === 'POST' && request.path === '/invoices') {
    const { customerId, lines } = request.body ?? {};
    const customer = findCustomer(customerId);
    if (customer === undefined) return { status: 400, body: 'Unknown customer' };
    const currency = currencyOfRegion(customer.region);
    return { status: 201, body: toInvoiceBody(createInvoice({ customerId, lines, currency })) };
  }
  return { status: 404, body: 'Not found' };
}

function currencyOfRegion(region) {
  if (region === 'UK') return 'GBP';
  if (region.startsWith('US_')) return 'USD';
  return 'EUR';
}

function toInvoiceBody(invoice) {
  return {
    id: invoice.id,
    customerId: invoice.customerId,
    issuedOn: invoice.issuedOn,
    currency: invoice.currency,
    totalCents: invoiceTotal(invoice),
  };
}
