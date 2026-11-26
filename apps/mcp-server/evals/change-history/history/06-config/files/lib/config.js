/** Reads the service's settings from environment variables. */
export function readConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 8080),
    carrierApiUrl: env.CARRIER_API_URL ?? 'https://api.carrier.example.com/v2',
  };
}
