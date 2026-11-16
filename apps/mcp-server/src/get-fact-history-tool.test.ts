import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createToolSession } from './testing/tool-session.ts';

const RecordedSchema = z.object({ fact: z.object({ fact_id: z.string() }) });
const InvalidatedSchema = z.object({
  invalidated_fact_id: z.string(),
  replacement_fact_id: z.string().nullable(),
});
const ChangeSchema = z.object({
  operation: z.string(),
  action: z.string(),
  trigger: z.string(),
  reason_code: z.string(),
  explanation: z.string().nullable(),
  occurred_at: z.string(),
});
const HistorySchema = z.object({
  entries: z.array(
    z.object({
      fact_id: z.string(),
      statement: z.string(),
      valid_from: z.string().nullable(),
      valid_to: z.string().nullable(),
      invalidated_at: z.string().nullable(),
      changes: z.array(ChangeSchema),
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

/** Fly.io from 2025-01-01, recorded on 2026-03-10; on 2026-03-12, ended on 2026-03-01 and succeeded by Render. */
async function recordSuccession() {
  const flyIo = RecordedSchema.parse(
    await session.succeed('2026-03-10', 'record_fact', deploysTo('Fly.io', { valid_from: '2025-01-01' })),
  ).fact.fact_id;
  const changed = InvalidatedSchema.parse(
    await session.succeed('2026-03-12', 'invalidate_fact', {
      fact_id: flyIo,
      because: 'no_longer_true',
      reason: 'We moved to Render on 1 March.',
      ended_at: '2026-03-01',
      replacement: deploysTo('Render'),
    }),
  );
  return { flyIo, render: changed.replacement_fact_id ?? '' };
}

async function history(factId: string) {
  return HistorySchema.parse(await session.succeed('2026-03-13', 'get_fact_history', { fact_id: factId }));
}

describe('the get_fact_history tool', () => {
  it('returns both facts of a succession with the changes of each', async () => {
    const { flyIo, render } = await recordSuccession();

    const { entries } = await history(render);

    const live = entries.filter((entry) => entry.invalidated_at === null);
    expect(live.map((entry) => [entry.statement, entry.valid_from, entry.valid_to])).toEqual([
      ['shop-api is deployed to Fly.io.', '2025-01-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'],
      ['shop-api is deployed to Render.', '2026-03-01T00:00:00.000Z', null],
    ]);
    expect(entries.map((entry) => entry.fact_id)).toContain(flyIo);
    for (const entry of entries) expect(entry.changes.length, entry.fact_id).toBeGreaterThan(0);
  });

  it('returns each change with its operation, reason code and explanation', async () => {
    const { render } = await recordSuccession();

    const { entries } = await history(render);

    const renderEntry = entries.find((entry) => entry.fact_id === render);
    expect(
      renderEntry?.changes.map(({ action, trigger, reason_code, explanation, occurred_at }) => [
        action,
        trigger,
        reason_code,
        explanation,
        occurred_at,
      ]),
    ).toEqual([
      [
        'fact.recorded',
        'agent',
        'reported_ended',
        'We moved to Render on 1 March.',
        '2026-03-12T00:00:00.000Z',
      ],
    ]);
    expect(renderEntry?.changes[0]?.operation).toBeTruthy();
  });

  it('returns the reason given to invalidate_fact as the explanation of the change', async () => {
    const { flyIo } = await recordSuccession();

    const { entries } = await history(flyIo);

    const original = entries.find((entry) => entry.fact_id === flyIo);
    const invalidation = original?.changes.find((change) => change.action === 'fact.invalidated');
    expect(invalidation?.explanation).toBe('We moved to Render on 1 March.');
  });

  it('returns a null explanation for a change that names no source', async () => {
    const { flyIo } = await recordSuccession();

    const { entries } = await history(flyIo);

    // record_fact keeps no content on its source, so the recording of the first fact explains nothing.
    const original = entries.find((entry) => entry.fact_id === flyIo);
    const recording = original?.changes.find((change) => change.action === 'fact.recorded');
    expect(recording).toBeDefined();
    expect(recording?.explanation).toBeNull();
  });

  it('returns not_found for an unknown fact', async () => {
    const text = await session.fail('2026-03-13', 'get_fact_history', { fact_id: 'no-such-fact' });

    expect(text).toMatch(/^not_found: /);
  });
});
