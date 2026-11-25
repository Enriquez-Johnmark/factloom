import { readFileSync } from 'node:fs';

const customers = JSON.parse(readFileSync(new URL('./data/customers.json', import.meta.url), 'utf8'));

/** Returns the customer with this id, or undefined. */
export function findCustomer(id) {
  return customers.find((customer) => customer.id === id);
}

/** Returns every customer. */
export function listCustomers() {
  return [...customers];
}
