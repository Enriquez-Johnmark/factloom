import { findCustomer } from './customers.js';
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
  const customerPath = /^\/customers\/([^/]+)$/.exec(request.path);
  if (request.method === 'GET' && customerPath !== null) {
    const customer = findCustomer(customerPath[1]);
    if (customer === undefined) {
      return {
        status: 404,
        body: { error: { code: 'CUSTOMER_NOT_FOUND', message: `No customer ${customerPath[1]}.` } },
      };
    }
    return { status: 200, body: customer };
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
  };
}
