import type { Trigger } from '../audit.ts';
import type { Namespace } from '../fact.ts';
import type { OperationDeps } from '../operation-deps.ts';
import type { ProposedChange } from '../proposed-change.ts';
import { err, ok, type Result } from '../result.ts';

/** Which proposal to decide, and who decides. Only a person may (FL-043, technical requirement 4). */
export type DecideProposalInput = {
  readonly namespace: Namespace;
  readonly proposalId: string;
  readonly trigger: Trigger;
};

/** Refuses a decision by anyone but a person: an agent must not approve its own proposal. */
export function requirePerson(input: DecideProposalInput): Result<null> {
  if (input.trigger === 'person') return ok(null);
  return err('invalid_input', `A proposal is decided by a person. The trigger was ${input.trigger}.`);
}

/**
 * Reads a pending proposal. When it is not pending, tells a decided one, which has audit
 * entries, from one that was never recorded in the namespace, which has none.
 */
export async function readPendingProposal(
  deps: Pick<OperationDeps, 'store'>,
  input: DecideProposalInput,
): Promise<Result<ProposedChange>> {
  const pending = await deps.store.listPendingProposals({ namespace: input.namespace });
  if (!pending.ok) return pending;
  const found = pending.value.find((entry) => entry.proposal.id === input.proposalId);
  if (found !== undefined) return ok(found.proposal);
  const entries = await deps.store.listAuditEntries({
    namespace: input.namespace,
    targetKind: 'proposal',
    targetId: input.proposalId,
  });
  if (!entries.ok) return entries;
  return entries.value.length > 0
    ? err('already_exists', `The proposal ${input.proposalId} was already decided.`)
    : err('not_found', `No proposal ${input.proposalId} in this namespace.`);
}
