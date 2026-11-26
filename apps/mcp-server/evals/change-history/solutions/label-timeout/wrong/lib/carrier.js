import { withRetry } from './retry.js';

/** How long a request to the carrier may take before the transport gives up, in milliseconds. */
export const CARRIER_TIMEOUT_MS = 5_000;

/**
 * Sends a request to the carrier API and returns its answer, retrying when it fails. The
 * transport does the HTTP call: transport.send({ operation, payload, timeoutMs }) resolves to the
 * carrier's answer, or rejects when the carrier fails or has not answered within timeoutMs.
 */
export function callCarrier(transport, operation, payload) {
  return withRetry(() => transport.send({ operation, payload, timeoutMs: CARRIER_TIMEOUT_MS }));
}
