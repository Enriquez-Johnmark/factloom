import type { FactId } from '../fact.ts';
import type { VerificationMethod, VerificationOutcome } from '../fact-verification.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { ok, type Result } from '../result.ts';
import type { ChangeContext } from './operation-inputs.ts';

export type RecordVerificationInput = ChangeContext & {
  readonly factId: FactId;
  readonly outcome: VerificationOutcome;
  readonly method: VerificationMethod;
};

/**
 * Records the outcome of checking a live fact against its source, in one commit. It changes
 * no fact: invalidating or lowering the confidence of a contradicted fact is a separate call,
 * so that the audit log shows both the finding and the action.
 */
export async function recordVerification(
  deps: Pick<OperationDeps, 'store' | 'now' | 'newId'>,
  input: RecordVerificationInput,
): Promise<Result<{ readonly verificationId: string }>> {
  const now = deps.now();
  const verificationId = deps.newId();
  const committed = await deps.store.commit({
    namespace: input.namespace,
    operationId: deps.newId(),
    operation: 'verification',
    trigger: input.trigger,
    reasonCode: input.reasonCode,
    explainedBySourceId: null,
    occurredAt: now,
    changes: [
      {
        kind: 'record_verification',
        verification: {
          id: verificationId,
          namespace: input.namespace,
          factId: input.factId,
          outcome: input.outcome,
          method: input.method,
          verifiedAt: now,
        },
      },
    ],
  });
  if (!committed.ok) return committed;
  return ok({ verificationId });
}
