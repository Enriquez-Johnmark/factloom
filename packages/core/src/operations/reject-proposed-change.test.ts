import { describe, expect, it } from 'vitest';
import { proposeChange } from './propose-change.ts';
import { createProposalMemory, NAMESPACE, note, postgres } from './proposal-test-memory.ts';
import { rejectProposedChange } from './reject-proposed-change.ts';

describe('rejectProposedChange', () => {
  it('changes no fact, and the rejected proposal is no longer returned as pending', async () => {
    const memory = await createProposalMemory();
    const proposed = await proposeChange(memory.on('2026-04-02'), {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'judged_wrong',
      storedFactId: memory.storedFactId,
      supersession: { kind: 'correction' },
      newFact: postgres('15'),
      source: note('It was always PostgreSQL 15.'),
    });
    if (!proposed.ok) throw new Error(proposed.error.message);
    const before = await memory.facts('all');

    const rejected = await rejectProposedChange(memory.on('2026-04-03'), {
      namespace: NAMESPACE,
      proposalId: proposed.value.proposalId,
      trigger: 'person',
    });

    expect(rejected.ok).toBe(true);
    expect(await memory.facts('all')).toEqual(before);
    expect(await memory.store.listPendingProposals({ namespace: NAMESPACE })).toEqual({
      ok: true,
      value: [],
    });
  });

  it('returns already_exists for a proposal that was already rejected, and not_found for one never made', async () => {
    const memory = await createProposalMemory();
    const proposed = await proposeChange(memory.on('2026-04-02'), {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'judged_wrong',
      storedFactId: memory.storedFactId,
      supersession: { kind: 'correction' },
      newFact: postgres('15'),
      source: note('It was always PostgreSQL 15.'),
    });
    if (!proposed.ok) throw new Error(proposed.error.message);
    const decide = (proposalId: string) =>
      rejectProposedChange(memory.on('2026-04-03'), { namespace: NAMESPACE, proposalId, trigger: 'person' });
    await decide(proposed.value.proposalId);

    const again = await decide(proposed.value.proposalId);
    const missing = await decide('p-never');

    expect(again.ok ? null : again.error.code).toBe('already_exists');
    expect(missing.ok ? null : missing.error.code).toBe('not_found');
  });
});
