import { describe, expect, it } from 'vitest';
import type { MemoryStore } from '../memory-store.ts';
import { err } from '../result.ts';
import { approveProposedChange } from './approve-proposed-change.ts';
import { invalidateFact } from './invalidate-fact.ts';
import { proposeChange } from './propose-change.ts';
import { createProposalMemory, day, NAMESPACE, note, postgres } from './proposal-test-memory.ts';

/** shop-api's upgrade to PostgreSQL 16 on 15 March, proposed on 2 April. */
async function proposeUpgrade(memory: Awaited<ReturnType<typeof createProposalMemory>>) {
  const proposed = await proposeChange(memory.on('2026-04-02'), {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'judged_ended',
    storedFactId: memory.storedFactId,
    supersession: { kind: 'succession', changedAt: day('2026-03-15') },
    newFact: postgres('16'),
    source: note('We upgraded to PostgreSQL 16 on 15 March.'),
  });
  if (!proposed.ok) throw new Error(proposed.error.message);
  return proposed.value.proposalId;
}

describe('approveProposedChange', () => {
  it('ends the stored fact and records the successor, both recorded at the time of approval', async () => {
    const memory = await createProposalMemory();
    const proposalId = await proposeUpgrade(memory);

    const approved = await approveProposedChange(memory.on('2026-04-10'), {
      namespace: NAMESPACE,
      proposalId,
      trigger: 'person',
    });

    if (!approved.ok) throw new Error(approved.error.message);
    const live = await memory.facts('live');
    expect(
      live.map((found) => [
        found.fact.object,
        found.fact.validFrom,
        found.fact.validTo,
        found.fact.createdAt,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [{ kind: 'value', value: 'postgres 14' }, day('2025-06-01'), day('2026-03-15'), day('2026-04-10')],
        [{ kind: 'value', value: 'postgres 16' }, day('2026-03-15'), null, day('2026-04-10')],
      ]),
    );
    expect(approved.value.changedFactId).toBe(memory.storedFactId);
    // Between proposal and approval, Factloom still believed PostgreSQL 14 was current.
    const believedBetween = await memory.facts({ validAt: day('2026-04-05'), knownAt: day('2026-04-05') });
    expect(believedBetween.map((found) => [found.fact.id, found.fact.validTo])).toEqual([
      [memory.storedFactId, null],
    ]);
    expect(await memory.store.listPendingProposals({ namespace: NAMESPACE })).toEqual({
      ok: true,
      value: [],
    });
  });

  it('marks the proposal approved and changes the facts in one commit, so a failed commit does neither', async () => {
    const memory = await createProposalMemory();
    const proposalId = await proposeUpgrade(memory);
    const before = await memory.facts('all');
    // Only a commit that writes a fact fails, so a decision committed on its own would succeed.
    const failing: MemoryStore = {
      ...memory.store,
      commit: (changeSet) =>
        changeSet.changes.some((change) => change.kind === 'record_fact')
          ? Promise.resolve(err('storage_failed', 'The disk is full.'))
          : memory.store.commit(changeSet),
    };

    const approved = await approveProposedChange(memory.on('2026-04-10', failing), {
      namespace: NAMESPACE,
      proposalId,
      trigger: 'person',
    });

    expect(approved.ok ? null : approved.error.code).toBe('storage_failed');
    expect(await memory.facts('all')).toEqual(before);
    const pending = await memory.store.listPendingProposals({ namespace: NAMESPACE });
    expect(pending.ok && pending.value.map((entry) => entry.proposal.id)).toEqual([proposalId]);
  });

  it('refuses an approval whose trigger is agent with invalid_input', async () => {
    const memory = await createProposalMemory();
    const proposalId = await proposeUpgrade(memory);

    const approved = await approveProposedChange(memory.on('2026-04-10'), {
      namespace: NAMESPACE,
      proposalId,
      trigger: 'agent',
    });

    expect(approved.ok ? null : approved.error.code).toBe('invalid_input');
    const pending = await memory.store.listPendingProposals({ namespace: NAMESPACE });
    expect(pending.ok && pending.value).toHaveLength(1);
  });

  it('returns already_invalidated and leaves the proposal pending when the stored fact was invalidated since', async () => {
    const memory = await createProposalMemory();
    const proposalId = await proposeUpgrade(memory);
    const retracted = await invalidateFact(memory.on('2026-04-05'), {
      namespace: NAMESPACE,
      trigger: 'person',
      reasonCode: 'reported_wrong',
      factId: memory.storedFactId,
      source: note('We never ran PostgreSQL 14 here.'),
      replacement: null,
    });
    if (!retracted.ok) throw new Error(retracted.error.message);

    const approved = await approveProposedChange(memory.on('2026-04-10'), {
      namespace: NAMESPACE,
      proposalId,
      trigger: 'person',
    });

    expect(approved.ok ? null : approved.error.code).toBe('already_invalidated');
    const pending = await memory.store.listPendingProposals({ namespace: NAMESPACE });
    expect(pending.ok && pending.value.map((entry) => entry.proposal.id)).toEqual([proposalId]);
  });

  it('approves a correction: the stored fact is invalidated and the new fact replaces it, explained by the proposal source', async () => {
    const memory = await createProposalMemory();
    const proposed = await proposeChange(memory.on('2026-04-02'), {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'judged_wrong',
      storedFactId: memory.storedFactId,
      supersession: { kind: 'correction' },
      newFact: postgres('15'),
      source: note('It was always PostgreSQL 15, not 14.'),
    });
    if (!proposed.ok) throw new Error(proposed.error.message);

    const approved = await approveProposedChange(memory.on('2026-04-10'), {
      namespace: NAMESPACE,
      proposalId: proposed.value.proposalId,
      trigger: 'person',
    });

    if (!approved.ok) throw new Error(approved.error.message);
    const live = await memory.facts('live');
    expect(live.map((found) => found.fact.object)).toEqual([{ kind: 'value', value: 'postgres 15' }]);
    expect(live[0]?.sources.map((source) => source.content)).toEqual([
      'It was always PostgreSQL 15, not 14.',
    ]);
    const entries = await memory.store.listAuditEntries({
      namespace: NAMESPACE,
      targetKind: 'fact',
      targetId: memory.storedFactId,
    });
    expect(entries.ok && entries.value.at(-1)).toMatchObject({
      operation: 'correction',
      trigger: 'person',
      reasonCode: 'judged_wrong',
    });
  });
});
