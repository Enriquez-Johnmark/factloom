/** How many times a request to the carrier is tried before it fails. */
export const MAX_ATTEMPTS = 5;

/** Calls operation until it resolves, at most MAX_ATTEMPTS times, and returns what it resolved to. */
export async function withRetry(operation) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
