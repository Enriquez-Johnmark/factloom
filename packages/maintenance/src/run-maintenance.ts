import { ERROR_CODES, err, type Result, type Timestamp, TimestampSchema } from '@factloom/core';
import { z } from 'zod';

/** What one job did, in four counts. */
export type JobCounts = {
  readonly examined: number;
  /** Changed through a fact operation, with the trigger `maintenance`. */
  readonly changed: number;
  /** Left for a person to decide. */
  readonly flagged: number;
  readonly failed: number;
  /** What was flagged, each with a word that says why, so that a person can find it. */
  readonly flaggedItems: readonly { readonly id: string; readonly reason: string }[];
};

/**
 * One maintenance job, already bound to its dependencies by the composition root. The run
 * knows only its name and its result. A job that finds an item already handled by another
 * process, an operation returning `already_invalidated` or `already_exists`, counts it as
 * examined, not as failed.
 */
export type MaintenanceJob = {
  readonly name: string;
  readonly run: () => Promise<Result<JobCounts>>;
};

const CountSchema = z.number().int().nonnegative();

/** The report of one run, as the maintenance command prints it. */
export const MaintenanceReportSchema = z.strictObject({
  startedAt: TimestampSchema,
  finishedAt: TimestampSchema,
  jobs: z.array(
    z.strictObject({
      name: z.string().min(1),
      status: z.enum(['ok', 'failed']),
      /** The error code when the job failed, else null. */
      error: z.enum(ERROR_CODES).nullable(),
      examined: CountSchema,
      changed: CountSchema,
      flagged: CountSchema,
      failed: CountSchema,
      flaggedItems: z
        .array(z.strictObject({ id: z.string().min(1), reason: z.string().min(1) }).readonly())
        .readonly(),
    }),
  ),
});
export type MaintenanceReport = z.infer<typeof MaintenanceReportSchema>;

const NOTHING: JobCounts = { examined: 0, changed: 0, flagged: 0, failed: 0, flaggedItems: [] };

/**
 * Runs the jobs once, one after another in the order given, and collects their reports. A job
 * that fails, by returning a failure or by throwing, is reported as failed and does not stop
 * the jobs after it.
 */
export async function runMaintenance(
  deps: { readonly now: () => Timestamp },
  jobs: readonly MaintenanceJob[],
): Promise<MaintenanceReport> {
  const startedAt = deps.now();
  const reports: MaintenanceReport['jobs'] = [];
  for (const job of jobs) {
    let result: Result<JobCounts>;
    try {
      result = await job.run();
    } catch {
      result = err('storage_failed', `The job ${job.name} threw.`);
    }
    reports.push(
      result.ok
        ? { name: job.name, status: 'ok', error: null, ...result.value }
        : { name: job.name, status: 'failed', error: result.error.code, ...NOTHING },
    );
  }
  return { startedAt, finishedAt: deps.now(), jobs: reports };
}
