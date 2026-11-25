import type { OperationDeps } from '../operation-deps.ts';
import { ok, type Result } from '../result.ts';
import { type DecideProposalInput, readPendingProposal, requirePerson } from './decide-proposal-inputs.ts';

/** Phase 2 (FL-043). Marks a pending proposal rejected, in one commit, and changes no fact. */
export async function rejectProposedChange(
  deps: Pick<OperationDeps, 'store' | 'now' | 'newId'>,
  input: DecideProposalInput,
): Promise<Result<{ readonly proposalId: string }>> {
  const person = requirePerson(input);
  if (!person.ok) return person;
  const proposal = await readPendingProposal(deps, input);
  if (!proposal.ok) return proposal;
  const committed = await deps.store.commit({
    namespace: input.namespace,
    operationId: deps.newId(),
    operation: 'proposal',
    trigger: input.trigger,
    reasonCode: 'requested',
    explainedBySourceId: null,
    occurredAt: deps.now(),
    changes: [{ kind: 'decide_proposal', proposalId: input.proposalId, decision: 'rejected' }],
  });
  if (!committed.ok) return committed;
  return ok({ proposalId: input.proposalId });
}
