import { listCustomers } from './customers.js';

/** Returns the customers as CSV text, sorted by id. */
export function exportCustomersCsv() {
  const customers = listCustomers().sort((first, second) => first.id.localeCompare(second.id));
  const rows = customers.map((customer) => [customer.id, customer.name, customer.region].join(','));
  return `${['id,name,region', ...rows].join('\n')}\n`;
}
