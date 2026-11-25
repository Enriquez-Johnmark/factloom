/** Reads the service's settings from environment variables. INVOICE_DB_URL is required. */
export function readConfig(env = process.env) {
  if (env.INVOICE_DB_URL === undefined || env.INVOICE_DB_URL === '') {
    throw new Error('INVOICE_DB_URL is not set.');
  }
  return { port: Number(env.PORT ?? 8080), databaseUrl: env.INVOICE_DB_URL };
}
