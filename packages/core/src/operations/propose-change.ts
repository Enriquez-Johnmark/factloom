import type { ChangeSet } from '../change-set.ts';
import type { FactId } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { findNewFactProblem, type ProposedChange } from '../proposed-change.ts';
import { err, ok, type Result } from '../result.ts';
import { buildSource } from './build-source.ts';
import type { ChangeContext, FactDraft, NewSource } from './operation-inputs.ts';
import { readLiveFact } from './read-live-fact.ts';

export type ProposeChangeInput = ChangeContext & {
  /** The live fact the change would end or invalidate. */
  readonly storedFactId: FactId;
  readonly supersession: ProposedChange['supersession'];
  /** The fact to put in its place, or null for a retraction or an end with nothing after it. */
  readonly newFact: FactDraft | null;
  /** Why: recorded now, as the source the approved change is explained by. */
  readonly source: NewSource;
};

/**
 * Phase 2 (FL-043). Stores a succession, a correction or a retraction for a person to approve, in one
 * commit with its source, and changes no fact. The stored fact must be live, and a succession
 * must end it after it began, so that a proposal that could never be applied is refused now.
 */
export async function proposeChange(
  deps: OperationDeps,
  input: ProposeChangeInput,
): Promise<Result<{ readonly proposalId: string }>> {
  const { namespace, storedFactId, supersession } = input;
  const problem = findNewFactProblem(input);
  if (problem !== null) return err('invalid_input', problem);
  const found = await readLiveFact(deps, { namespace, factId: storedFactId });
  if (!found.ok) return found;
  const { validFrom } = found.value.fact;
  if (supersession.kind === 'succession' && validFrom !== null && supersession.changedAt <= validFrom) {
    return err(
      'invalid_input',
      `The fact ${storedFactId} is valid from ${validFrom}, so it cannot end at ${supersession.changedAt}. Give a later moment.`,
    );
  }

  const now = deps.now();
  const source = await buildSource(deps, { namespace, source: input.source, createdAt: now });
  const proposal: ProposedChange = {
    id: deps.newId(),
    namespace,
    storedFactId,
    supersession,
    newFact: input.newFact,
    sourceId: source.id,
    reasonCode: input.reasonCode,
    proposedAt: now,
    state: 'pending',
    decidedAt: null,
  };
  const changeSet: ChangeSet = {
    namespace,
    operationId: deps.newId(),
    operation: 'proposal',
    trigger: input.trigger,
    reasonCode: input.reasonCode,
    explainedBySourceId: source.id,
    occurredAt: now,
    changes: [
      { kind: 'record_source', source },
      { kind: 'record_proposal', proposal },
    ],
  };
  const committed = await deps.store.commit(changeSet);
  if (!committed.ok) return committed;
  return ok({ proposalId: proposal.id });
}
