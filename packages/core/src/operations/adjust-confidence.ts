import type { FactId } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { err, ok, type Result } from '../result.ts';
import type { ChangeContext } from './operation-inputs.ts';
import { readLiveFact } from './read-live-fact.ts';

export type AdjustConfidenceInput = ChangeContext & {
  readonly factId: FactId;
  /** From 0 to 1. */
  readonly confidence: number;
};

/**
 * Records a new confidence for a live fact, in one commit. The fact keeps its identifier and
 * its recorded time: the confidence is appended to its history, and reads return the latest
 * one recorded at or before their known-at date. Returns the confidence that held before.
 */
export async function adjustConfidence(
  deps: Pick<OperationDeps, 'store' | 'now' | 'newId'>,
  input: AdjustConfidenceInput,
): Promise<Result<{ readonly factId: FactId; readonly previousConfidence: number }>> {
  const { namespace, factId, confidence } = input;
  if (!(confidence >= 0 && confidence <= 1)) {
    return err('invalid_input', `A confidence is from 0 to 1, and ${confidence} was given.`);
  }
  const found = await readLiveFact(deps, { namespace, factId });
  if (!found.ok) return found;

  const committed = await deps.store.commit({
    namespace,
    operationId: deps.newId(),
    operation: 'confidence_adjustment',
    trigger: input.trigger,
    reasonCode: input.reasonCode,
    explainedBySourceId: null,
    occurredAt: deps.now(),
    changes: [{ kind: 'adjust_confidence', factId, confidence }],
  });
  if (!committed.ok) return committed;
  return ok({ factId, previousConfidence: found.value.fact.confidence });
}
