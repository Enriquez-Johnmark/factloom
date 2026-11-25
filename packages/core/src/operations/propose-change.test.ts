import { describe, expect, it } from 'vitest';
import { proposeChange } from './propose-change.ts';
import { createProposalMemory, day, NAMESPACE, note, postgres } from './proposal-test-memory.ts';

const proposing = { namespace: NAMESPACE, trigger: 'agent', reasonCode: 'judged_ended' } as const;

describe('proposeChange', () => {
  it('stores one pending proposal and leaves the stored fact live and current', async () => {
    const memory = await createProposalMemory();
    const before = await memory.facts('all');

    const proposed = await proposeChange(memory.on('2026-04-02'), {
      ...proposing,
      storedFactId: memory.storedFactId,
      supersession: { kind: 'succession', changedAt: day('2026-03-15') },
      newFact: postgres('16'),
      source: note('We upgraded to PostgreSQL 16 on 15 March.'),
    });

    expect(proposed.ok).toBe(true);
    const pending = await memory.store.listPendingProposals({ namespace: NAMESPACE });
    expect(
      pending.ok && pending.value.map((entry) => [entry.proposal.state, entry.proposal.storedFactId]),
    ).toEqual([['pending', memory.storedFactId]]);
    expect(await memory.facts('all')).toEqual(before);
    const current = await memory.facts({ validAt: day('2026-11-15'), knownAt: day('2026-11-15') });
    expect(current.map((found) => found.fact.id)).toEqual([memory.storedFactId]);
  });

  it('refuses a succession that would end the stored fact before it began', async () => {
    const memory = await createProposalMemory();

    const proposed = await proposeChange(memory.on('2026-04-02'), {
      ...proposing,
      storedFactId: memory.storedFactId,
      supersession: { kind: 'succession', changedAt: day('2025-01-01') },
      newFact: postgres('16'),
      source: note('We moved to PostgreSQL 16 in 2025.'),
    });

    expect(proposed.ok ? null : proposed.error.code).toBe('invalid_input');
    const pending = await memory.store.listPendingProposals({ namespace: NAMESPACE });
    expect(pending.ok && pending.value).toEqual([]);
  });
});
