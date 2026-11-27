import {
  adjustConfidence,
  type ChangeContext,
  endFact,
  err,
  type Fact,
  type Feedback,
  type FeedbackFollowUp,
  type FeedbackResponder,
  type FeedbackSignal,
  invalidateFact,
  type NewSource,
  type OperationDeps,
  ok,
  type ReasonCode,
  type Result,
} from '@kronomind/core';

/**
 * How much feedback `right` raises a fact's confidence (FL-060). No source gives evidence
 * for a particular value; half the drop, so that one confirmation does not undo one report.
 */
export const FEEDBACK_CONFIDENCE_RAISE = 0.1;

/**
 * How much feedback `wrong` or `outdated` lowers a fact's confidence where the fact is not
 * retracted or ended (FL-060). The same step as a contradicted verification (FL-051).
 */
export const FEEDBACK_CONFIDENCE_DROP = 0.2;

const REASON_CODES: Readonly<Record<FeedbackSignal, ReasonCode>> = {
  right: 'feedback_right',
  wrong: 'feedback_wrong',
  outdated: 'feedback_outdated',
};

/** Records a new confidence, between 0 and 1, and says which way it moved. Nothing is written when it would not move. */
async function moveConfidence(
  deps: OperationDeps,
  context: ChangeContext,
  fact: Fact,
  step: number,
): Promise<Result<FeedbackFollowUp>> {
  const confidence = Math.min(1, Math.max(0, fact.confidence + step));
  if (confidence === fact.confidence) return ok('none');
  const adjusted = await adjustConfidence(deps, { ...context, factId: fact.id, confidence });
  if (!adjusted.ok) return adjusted;
  return ok(step > 0 ? 'confidence_raised' : 'confidence_lowered');
}

/** Withdraws the fact with nothing to replace it: a retraction. */
async function retract(
  deps: OperationDeps,
  context: ChangeContext,
  fact: Fact,
  source: NewSource,
): Promise<Result<FeedbackFollowUp>> {
  const invalidated = await invalidateFact(deps, { ...context, factId: fact.id, source, replacement: null });
  if (!invalidated.ok) return invalidated;
  return ok('retracted');
}

/** Ends the fact at the moment the feedback was given, with no successor. */
async function endAt(
  deps: OperationDeps,
  context: ChangeContext,
  fact: Fact,
  feedback: Feedback,
  source: NewSource,
): Promise<Result<FeedbackFollowUp>> {
  // A record that already ends by then agrees with the feedback; ending it later would extend it.
  if (fact.validTo !== null && fact.validTo <= feedback.recordedAt) return ok('none');
  const ended = await endFact(deps, {
    ...context,
    factId: fact.id,
    validTo: feedback.recordedAt,
    source,
    successor: null,
  });
  if (!ended.ok) return ended;
  return ok('ended');
}

/**
 * Acts on one recorded feedback by a fixed table. `right` raises the fact's confidence by
 * `FEEDBACK_CONFIDENCE_RAISE`, to at most 1. Under the correction policy `automatic`,
 * `wrong` retracts the fact and `outdated` ends it at the moment of the feedback; under
 * `human_approval` each lowers its confidence by `FEEDBACK_CONFIDENCE_DROP`, to at least 0.
 * A fact that is no longer live is left as it is. Every change is a fact operation with the
 * trigger `feedback` and a reason code that names the signal; a retraction or an end is
 * explained by a source of kind `feedback` with no content, since what was said is the
 * content of the feedback's own source. Returns what it did.
 */
export const actOnFeedback: FeedbackResponder = async (deps, input) => {
  const { namespace, factId, feedbackId } = input;
  const listed = await deps.store.listFeedback({ namespace, factId });
  if (!listed.ok) return listed;
  const feedback = listed.value.find((given) => given.id === feedbackId);
  if (feedback === undefined) return err('not_found', `No feedback ${feedbackId} on the fact ${factId}.`);
  const found = await deps.store.getFact({ namespace, factId });
  if (!found.ok) return found;
  if (found.value === null || found.value.fact.invalidatedAt !== null) return ok('none');

  const fact = found.value.fact;
  const context: ChangeContext = {
    namespace,
    trigger: 'feedback',
    reasonCode: REASON_CODES[feedback.signal],
  };
  const source: NewSource = {
    kind: 'feedback',
    locator: null,
    version: null,
    content: null,
    observedAt: feedback.recordedAt,
  };
  const isAutomatic = deps.domain.correctionPolicy === 'automatic';
  switch (feedback.signal) {
    case 'right':
      return moveConfidence(deps, context, fact, FEEDBACK_CONFIDENCE_RAISE);
    case 'wrong':
      return isAutomatic
        ? retract(deps, context, fact, source)
        : moveConfidence(deps, context, fact, -FEEDBACK_CONFIDENCE_DROP);
    case 'outdated':
      return isAutomatic
        ? endAt(deps, context, fact, feedback, source)
        : moveConfidence(deps, context, fact, -FEEDBACK_CONFIDENCE_DROP);
    default: {
      const unhandled: never = feedback.signal;
      throw new Error(`Unhandled feedback signal: ${JSON.stringify(unhandled)}`);
    }
  }
};
