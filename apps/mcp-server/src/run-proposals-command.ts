import {
  approveProposedChange,
  type Namespace,
  type OperationDeps,
  type ProposedChange,
  rejectProposedChange,
} from '@factloom/core';
import type { Command } from './read-command.ts';

export type ProposalsCommandDeps = OperationDeps & {
  readonly namespace: Namespace;
  /** Writes one line for the person running the command. */
  readonly write: (line: string) => void;
};

type ProposalsCommand = Extract<
  Command,
  { readonly kind: 'list_proposals' | 'approve_proposal' | 'reject_proposal' }
>;

/** One line per pending proposal: identifier, kind, proposal time, stored fact, and the two statements. */
function describeProposal(proposal: ProposedChange, storedStatement: string): string {
  return [
    proposal.id,
    proposal.supersession.kind,
    proposal.proposedAt,
    proposal.storedFactId,
    storedStatement,
    proposal.newFact.fact.statement,
  ].join('\t');
}

/**
 * Runs the proposals command of FL-070 and returns the exit code: lists the pending
 * proposals, oldest first, or approves or rejects one with the trigger `person`. Only the list
 * prints statements, because a person must see what they approve; no form prints a source's
 * content. It holds no rule about facts: each form is one read or one operation.
 */
export async function runProposalsCommand(
  deps: ProposalsCommandDeps,
  command: ProposalsCommand,
): Promise<number> {
  const decision = { namespace: deps.namespace, trigger: 'person', proposalId: '' } as const;
  if (command.kind === 'list_proposals') {
    const pending = await deps.store.listPendingProposals({ namespace: deps.namespace });
    if (!pending.ok) {
      deps.write(`${pending.error.code}: ${pending.error.message}`);
      return 1;
    }
    for (const { proposal, storedFact } of pending.value)
      deps.write(describeProposal(proposal, storedFact.fact.statement));
    if (pending.value.length === 0) deps.write('No pending proposals.');
    return 0;
  }
  if (command.kind === 'approve_proposal') {
    const approved = await approveProposedChange(deps, { ...decision, proposalId: command.proposalId });
    if (!approved.ok) {
      deps.write(`${approved.error.code}: ${approved.error.message}`);
      return 1;
    }
    deps.write(`Approved ${command.proposalId}.`);
    deps.write(`Changed fact: ${approved.value.changedFactId}`);
    deps.write(`New fact: ${approved.value.newFactId ?? 'none'}`);
    return 0;
  }
  const rejected = await rejectProposedChange(deps, { ...decision, proposalId: command.proposalId });
  if (!rejected.ok) {
    deps.write(`${rejected.error.code}: ${rejected.error.message}`);
    return 1;
  }
  deps.write(`Rejected ${command.proposalId}.`);
  return 0;
}
