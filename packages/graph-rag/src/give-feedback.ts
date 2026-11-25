import {
  type FactId,
  type FeedbackFollowUp,
  type FeedbackSignal,
  type Namespace,
  type OperationDeps,
  ok,
  type Result,
  recordFeedback,
  type Trigger,
} from '@factloom/core';
import { checkForSecrets } from './check-for-secrets.ts';

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
 * No fact changes.
 */
export async function giveFeedback(
  deps: Pick<OperationDeps, 'store' | 'now' | 'newId'>,
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
  return ok({ feedbackId: recorded.value.feedbackId, followUp: 'none' });
}
