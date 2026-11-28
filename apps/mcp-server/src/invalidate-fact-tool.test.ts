import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TEST_NAMESPACE } from './testing/connect-in-process.ts';
import { softwareDevelopmentDomain } from '@kronomind/graph-rag';
import { createToolSession } from './testing/tool-session.ts';

const RecordedSchema = z.object({ fact: z.object({ fact_id: z.string() }) });
const InvalidatedSchema = z.object({
  invalidated_fact_id: z.string(),
  replacement_fact_id: z.string().nullable(),
  proposal_id: z.null(),
});
const ProposedSchema = z.object({
  invalidated_fact_id: z.null(),
  replacement_fact_id: z.null(),
  proposal_id: z.string(),
});
const RecallSchema = z.object({
  facts: z.array(
    z.object({
      fact_id: z.string(),
      invalidated_at: z.string().nullable(),
      superseded_by_fact_id: z.string().nullable(),
    }),
  ),
});

const SHOP = { type: 'repository', name: 'shop-api' };

function deploysTo(target: string, extra: Record<string, unknown> = {}) {
  return {
    subject: SHOP,
    predicate: 'deploys_to',
    object: { value: target },
    statement: `shop-api is deployed to ${target}.`,
    ...extra,
  };
}

let session = createToolSession();
afterEach(async () => {
  await session.close();
  session = createToolSession();
});

/** Records shop-api's deployment target on 2026-03-10 and returns the fact's identifier. */
async function recordFlyIo(extra: Record<string, unknown> = {}): Promise<string> {
  return RecordedSchema.parse(await session.succeed('2026-03-10', 'record_fact', deploysTo('Fly.io', extra)))
    .fact.fact_id;
}

async function invalidate(now: string, args: Record<string, unknown>) {
  return InvalidatedSchema.parse(await session.succeed(now, 'invalidate_fact', args));
}

async function readFact(factId: string) {
  const read = await session.store.getFact({ namespace: TEST_NAMESPACE, factId });
  if (!read.ok || read.value === null) throw new Error(`No fact ${factId}.`);
  return read.value.fact;
}

describe('the invalidate_fact tool', () => {
  it("corrects a fact and returns the replacement's identifier", async () => {
    const wrong = await recordFlyIo();

    const result = await invalidate('2026-03-12', {
      fact_id: wrong,
      because: 'was_wrong',
      reason: 'It was always Render.',
      replacement: deploysTo('Render'),
    });

    expect(result.invalidated_fact_id).toBe(wrong);
    expect(result.replacement_fact_id).not.toBeNull();
    expect((await readFact(result.replacement_fact_id ?? '')).object).toEqual({
      kind: 'value',
      value: 'Render',
    });
  });

  it('retracts a fact and returns no replacement', async () => {
    const wrong = await recordFlyIo();

    const result = await invalidate('2026-03-12', {
      fact_id: wrong,
      because: 'was_wrong',
      reason: 'Never true.',
    });

    expect(result).toEqual({ invalidated_fact_id: wrong, replacement_fact_id: null, proposal_id: null });
    expect((await readFact(wrong)).invalidatedAt).not.toBeNull();
  });

  it('ends a fact at the given date and records the replacement from that date', async () => {
    const flyIo = await recordFlyIo({ valid_from: '2025-01-01' });

    const result = await invalidate('2026-03-12', {
      fact_id: flyIo,
      because: 'no_longer_true',
      reason: 'We moved to Render on 1 March.',
      ended_at: '2026-03-01',
      replacement: deploysTo('Render'),
    });

    const ended = await readFact((await readFact(flyIo)).supersededByFactId ?? '');
    expect([ended.validFrom, ended.validTo]).toEqual([
      '2025-01-01T00:00:00.000Z',
      '2026-03-01T00:00:00.000Z',
    ]);
    expect((await readFact(result.replacement_fact_id ?? '')).validFrom).toBe('2026-03-01T00:00:00.000Z');
  });

  it('ends a fact now when no date is given', async () => {
    const flyIo = await recordFlyIo();

    await invalidate('2026-03-12', {
      fact_id: flyIo,
      because: 'no_longer_true',
      reason: 'Not deployed any more.',
    });

    const ended = await readFact((await readFact(flyIo)).supersededByFactId ?? '');
    expect(ended.validTo).toBe('2026-03-12T00:00:00.000Z');
  });

  it('returns already_invalidated with the superseding fact for a fact that was revised', async () => {
    const wrong = await recordFlyIo();
    const { replacement_fact_id } = await invalidate('2026-03-12', {
      fact_id: wrong,
      because: 'was_wrong',
      reason: 'It was always Render.',
      replacement: deploysTo('Render'),
    });

    const text = await session.fail('2026-03-13', 'invalidate_fact', {
      fact_id: wrong,
      because: 'was_wrong',
      reason: 'Again.',
    });

    expect(text).toMatch(/^already_invalidated: /);
    expect(text).toContain(`Related facts: ${replacement_fact_id}.`);
  });

  it('returns not_found for an unknown fact', async () => {
    const text = await session.fail('2026-03-12', 'invalidate_fact', {
      fact_id: 'no-such-fact',
      because: 'was_wrong',
      reason: 'Gone.',
    });

    expect(text).toMatch(/^not_found: /);
  });

  it('returns invalid_input for a malformed end date', async () => {
    const flyIo = await recordFlyIo();

    const text = await session.fail('2026-03-12', 'invalidate_fact', {
      fact_id: flyIo,
      because: 'no_longer_true',
      reason: 'Moved.',
      ended_at: 'last week',
    });

    expect(text).toMatch(/^invalid_input: ended_at: /);
  });

  it('returns invalid_input naming the field for a malformed replacement date', async () => {
    const flyIo = await recordFlyIo();

    const text = await session.fail('2026-03-12', 'invalidate_fact', {
      fact_id: flyIo,
      because: 'was_wrong',
      reason: 'It was Render.',
      replacement: deploysTo('Render', { valid_from: 'soon' }),
    });

    expect(text).toMatch(/^invalid_input: replacement\.valid_from: /);
  });

  it('after a correction, recall returns the replacement now and the wrong fact as known before', async () => {
    const wrong = await recordFlyIo();
    const { replacement_fact_id } = await invalidate('2026-03-12', {
      fact_id: wrong,
      because: 'was_wrong',
      reason: 'It was always Render.',
      replacement: deploysTo('Render'),
    });

    // As-of date: now (2026-03-13). Known-at date: now.
    const now = RecallSchema.parse(
      await session.succeed('2026-03-13', 'recall', { question: 'Where is shop-api deployed?' }),
    );
    // As-of date: 2026-03-11, which the known-at date gives. Known-at date: 2026-03-11, before the correction.
    const before = RecallSchema.parse(
      await session.succeed('2026-03-13', 'recall', {
        question: 'Where is shop-api deployed?',
        known_at: '2026-03-11',
      }),
    );

    expect(now.facts.map((fact) => fact.fact_id)).toEqual([replacement_fact_id]);
    expect(
      before.facts.map((fact) => [fact.fact_id, fact.invalidated_at, fact.superseded_by_fact_id]),
    ).toEqual([[wrong, '2026-03-12T00:00:00.000Z', replacement_fact_id]]);
  });
});

describe('the invalidate_fact tool in a domain that holds changes for approval', () => {
  it('stores a retraction as a proposal when no replacement is given', async () => {
    await session.close();
    session = createToolSession({
      domain: { ...softwareDevelopmentDomain, correctionPolicy: 'human_approval' },
    });
    const wrong = await recordFlyIo();

    const result = ProposedSchema.parse(
      await session.succeed('2026-03-12', 'invalidate_fact', {
        fact_id: wrong,
        because: 'was_wrong',
        reason: 'Never deployed there.',
      }),
    );

    expect((await readFact(wrong)).invalidatedAt).toBeNull();
    const pending = await session.store.listPendingProposals({ namespace: TEST_NAMESPACE });
    if (!pending.ok) throw new Error(pending.error.message);
    expect(pending.value.map((entry) => [entry.proposal.id, entry.proposal.supersession.kind])).toEqual([
      [result.proposal_id, 'retraction'],
    ]);
  });

  it('stores a proposal, returns its identifier, and leaves the fact current', async () => {
    await session.close();
    session = createToolSession({
      domain: { ...softwareDevelopmentDomain, correctionPolicy: 'human_approval' },
    });
    const wrong = await recordFlyIo();

    const result = ProposedSchema.parse(
      await session.succeed('2026-03-12', 'invalidate_fact', {
        fact_id: wrong,
        because: 'was_wrong',
        reason: 'The deploy config names Render.',
        replacement: deploysTo('Render'),
      }),
    );

    expect((await readFact(wrong)).invalidatedAt).toBeNull();
    const pending = await session.store.listPendingProposals({ namespace: TEST_NAMESPACE });
    if (!pending.ok) throw new Error(pending.error.message);
    expect(pending.value.map((entry) => entry.proposal.id)).toEqual([result.proposal_id]);
  });
});
