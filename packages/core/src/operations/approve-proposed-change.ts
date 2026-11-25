import type { FactId } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import { err, ok, type Result } from '../result.ts';
import { type DecideProposalInput, readPendingProposal, requirePerson } from './decide-proposal-inputs.ts';
import { planEndFact } from './end-fact.ts';
import { planInvalidateFact } from './invalidate-fact.ts';

/**
 * Phase 2 (FL-043). Applies a pending proposal and marks it approved, in one commit. The
 * change set of `endFact` or `invalidateFact` is built now, from the stored input, so the
 * facts it writes are recorded at the time of approval, and its source is the one recorded
 * with the proposal. When the stored fact is no longer live the result is
 * `already_invalidated`, and when the change would break the single-value rule it is
 * `conflict`; the proposal then stays pending.
 */
export async function approveProposedChange(
  deps: OperationDeps,
  input: DecideProposalInput,
): Promise<Result<{ readonly changedFactId: FactId; readonly newFactId: FactId | null }>> {
  const person = requirePerson(input);
  if (!person.ok) return person;
  const proposal = await readPendingProposal(deps, input);
  if (!proposal.ok) return proposal;
  const { namespace, storedFactId, supersession, newFact, reasonCode, sourceId } = proposal.value;
  const read = await deps.store.getSource({ namespace, sourceId });
  if (!read.ok) return read;
  const recorded = read.value;
  if (recorded === null)
    return err('not_found', `The source ${sourceId} of proposal ${input.proposalId} is missing.`);
  const source = { make: () => Promise.resolve(recorded), isRecorded: true };
  const context = { namespace, trigger: input.trigger, reasonCode };

  const planned =
    supersession.kind === 'succession'
      ? await planEndFact(
          deps,
          { ...context, factId: storedFactId, validTo: supersession.changedAt, successor: newFact },
          source,
        ).then((result) =>
          result.ok ? ok({ ...result.value, newFactId: result.value.successorFactId }) : result,
        )
      : await planInvalidateFact(
          deps,
          { ...context, factId: storedFactId, replacement: newFact },
          source,
        ).then((result) =>
          result.ok ? ok({ ...result.value, newFactId: result.value.replacementFactId }) : result,
        );
  if (!planned.ok) return planned;
  const { changeSet, newFactId } = planned.value;
  const committed = await deps.store.commit({
    ...changeSet,
    changes: [
      ...changeSet.changes,
      { kind: 'decide_proposal', proposalId: input.proposalId, decision: 'approved' },
    ],
  });
  if (!committed.ok) return committed;
  return ok({ changedFactId: storedFactId, newFactId });
}
