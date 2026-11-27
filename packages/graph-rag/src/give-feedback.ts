import {
  type FactId,
  type FeedbackFollowUp,
  type FeedbackResponder,
  type FeedbackSignal,
  type Namespace,
  type OperationDeps,
  ok,
  type Result,
  recordFeedback,
  type Trigger,
} from '@kronomind/core';
import { checkForSecrets } from './check-for-secrets.ts';

export type GiveFeedbackDeps = OperationDeps & {
  /** Phase 2 (FL-060). Acts on the feedback once it is recorded. Without it, nothing follows. */
  readonly feedbackResponder?: FeedbackResponder;
};

export type GiveFeedbackInput = {
  readonly namespace: Namespace;
  readonly factId: FactId;
  readonly signal: FeedbackSignal;
  /** What was said with the feedback, stored as the content of a source. Null or blank for none. */
  readonly comment: string | null;
  readonly trigger: Trigger;
};

/**
 * Puts on record that a recalled fact was found right, wrong or out of date. The comment is
 * checked for secrets first; one that contains a secret is refused and nothing is stored.
 * Otherwise the comment becomes the content of a source of kind `agent_note`, observed now.
 * With a feedback responder, the responder then acts on the feedback in a commit of its own,
 * and `followUp` says what it did; if it fails, the result is its error and the feedback
 * stays on record. Without one, no fact changes and `followUp` is `none`.
 */
export async function giveFeedback(
  deps: GiveFeedbackDeps,
  input: GiveFeedbackInput,
): Promise<Result<{ readonly feedbackId: string; readonly followUp: FeedbackFollowUp }>> {
  const comment = input.comment === null || input.comment.trim() === '' ? null : input.comment;
  if (comment !== null) {
    const checked = checkForSecrets([{ name: 'comment', value: comment }]);
    if (!checked.ok) return checked;
  }
  const recorded = await recordFeedback(deps, {
    namespace: input.namespace,
    trigger: input.trigger,
    reasonCode: 'feedback_given',
    factId: input.factId,
    signal: input.signal,
    source:
      comment === null
        ? null
        : { kind: 'agent_note', locator: null, version: null, content: comment, observedAt: deps.now() },
  });
  if (!recorded.ok) return recorded;
  const { feedbackId } = recorded.value;
  if (deps.feedbackResponder === undefined) return ok({ feedbackId, followUp: 'none' });
  const followed = await deps.feedbackResponder(deps, {
    namespace: input.namespace,
    factId: input.factId,
    feedbackId,
  });
  if (!followed.ok) return followed;
  return ok({ feedbackId, followUp: followed.value });
}
