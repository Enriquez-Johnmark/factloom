import type { FactId, Namespace } from './fact.ts';
import type { OperationDeps } from './operation-deps.ts';
import type { Result } from './result.ts';

/** What followed from feedback: the change made to the fact, or `none`. */
export type FeedbackFollowUp = 'confidence_raised' | 'confidence_lowered' | 'retracted' | 'ended' | 'none';

/**
 * Acts on one recorded feedback under the correction policy of the domain in `deps`, through
 * fact operations, and says what it did. `@kronomind/maintenance` implements it as
 * `actOnFeedback`; `giveFeedback` receives one as a dependency, and a test passes a plain
 * function. It takes the use case's own dependencies, so it changes the memory the feedback
 * was recorded in.
 */
export type FeedbackResponder = (
  deps: OperationDeps,
  input: { readonly namespace: Namespace; readonly factId: FactId; readonly feedbackId: string },
) => Promise<Result<FeedbackFollowUp>>;
