// SQLite returns SQLITE_BUSY at once, without calling the busy handler, in a few documented
// cases of a WAL database, and says applications "should be prepared for that happenstance"
// (https://www.sqlite.org/wal.html, section 9, read on 2026-11-27). On macOS, setting the
// journal mode of a new file that other processes are opening is one of them (FL-087).

/** Tells whether an error is SQLite's busy result, or one of its extended codes. */
function isBusy(error: unknown): boolean {
  return error instanceof Error && 'code' in error && String(error.code).startsWith('SQLITE_BUSY');
}

/** Blocks the thread: the driver is synchronous, so the caller cannot await. */
function pause(milliseconds: number): void {
  if (milliseconds > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * Runs a synchronous step, and runs it again after a pause while it throws SQLite's busy
 * error, up to a number of attempts. Returns what the step returns. Throws any other error at
 * once, and the last busy error when no attempt is left.
 */
export function retryWhileBusy<Value>(
  run: () => Value,
  options: { readonly attempts: number; readonly pauseMs: number },
): Value {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return run();
    } catch (error) {
      if (!isBusy(error) || attempt >= options.attempts) throw error;
      pause(options.pauseMs);
    }
  }
}
