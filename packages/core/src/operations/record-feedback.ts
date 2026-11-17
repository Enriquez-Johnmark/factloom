import type { FactId } from '../fact.ts';
import type { FeedbackSignal } from '../feedback.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { ok, type Result } from '../result.ts';
import { buildSource } from './build-source.ts';
import type { ChangeContext, NewSource } from './operation-inputs.ts';

export type RecordFeedbackInput = ChangeContext & {
  readonly factId: FactId;
  readonly signal: FeedbackSignal;
  /** What was said, kept as a source so it can be purged. */
  readonly source: NewSource | null;
};

/**
 * Records that someone found a recalled fact right, wrong or out of date, in one commit with
 * the source that holds what was said. It changes no fact and decides nothing; product 2
 * reads the feedback and acts. The fact may be invalidated: one recalled with a past known-at
 * date can be.
 */
export async function recordFeedback(
  deps: Pick<OperationDeps, 'store' | 'now' | 'newId'>,
  input: RecordFeedbackInput,
): Promise<Result<{ readonly feedbackId: string }>> {
  const { namespace } = input;
  const now = deps.now();
  const source =
    input.source === null
      ? null
      : await buildSource(deps, { namespace, source: input.source, createdAt: now });
  const feedbackId = deps.newId();
  const committed = await deps.store.commit({
    namespace,
    operationId: deps.newId(),
    operation: 'feedback',
    trigger: input.trigger,
    reasonCode: input.reasonCode,
    explainedBySourceId: source?.id ?? null,
    occurredAt: now,
    changes: [
      ...(source === null ? [] : [{ kind: 'record_source' as const, source }]),
      {
        kind: 'record_feedback',
        feedback: {
          id: feedbackId,
          namespace,
          factId: input.factId,
          signal: input.signal,
          trigger: input.trigger,
          sourceId: source?.id ?? null,
          recordedAt: now,
        },
      },
    ],
  });
  if (!committed.ok) return committed;
  return ok({ feedbackId });
}
