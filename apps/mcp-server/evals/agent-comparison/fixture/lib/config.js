/** Reads the service's settings from environment variables. */
export function readConfig(env = process.env) {
  return { port: Number(env.PORT ?? 8080) };
}
