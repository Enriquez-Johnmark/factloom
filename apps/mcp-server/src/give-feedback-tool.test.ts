import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createToolSession } from './testing/tool-session.ts';

const RecordedSchema = z.object({ fact: z.object({ fact_id: z.string() }) });
const FeedbackSchema = z.object({ feedback_id: z.string(), follow_up: z.string() });
const NAMESPACE = 'repo:shop-api';

let session = createToolSession();
afterEach(async () => {
  await session.close();
  session = createToolSession();
});

/** Records "shop-api is deployed to Fly.io" on 2026-03-10 and returns its identifier. */
async function recordFlyIo(): Promise<string> {
  return RecordedSchema.parse(
    await session.succeed('2026-03-10', 'record_fact', {
      subject: { type: 'repository', name: 'shop-api' },
      predicate: 'deploys_to',
      object: { value: 'Fly.io' },
      statement: 'shop-api is deployed to Fly.io.',
    }),
  ).fact.fact_id;
}

async function feedbackEntries(feedbackId: string) {
  const listed = await session.store.listAuditEntries({
    namespace: NAMESPACE,
    targetKind: 'feedback',
    targetId: feedbackId,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return listed.value;
}

describe('the give_feedback tool', () => {
  it('records feedback and returns its identifier', async () => {
    const factId = await recordFlyIo();

    const given = FeedbackSchema.parse(
      await session.succeed('2026-03-12', 'give_feedback', { fact_id: factId, signal: 'wrong' }),
    );

    expect(given.feedback_id).not.toBe('');
    expect(given.follow_up).toBe('none');
    expect(await feedbackEntries(given.feedback_id)).toMatchObject([
      { action: 'feedback.recorded', trigger: 'agent', detail: { factId } },
    ]);
  });

  it('stores the comment as the content of a source', async () => {
    const factId = await recordFlyIo();

    const given = FeedbackSchema.parse(
      await session.succeed('2026-03-12', 'give_feedback', {
        fact_id: factId,
        signal: 'outdated',
        comment: 'We moved to Render in March.',
      }),
    );

    const [entry] = await feedbackEntries(given.feedback_id);
    const source = await session.store.getSource({
      namespace: NAMESPACE,
      sourceId: entry?.sourceId ?? 'none',
    });
    expect(source.ok && source.value).toMatchObject({
      kind: 'agent_note',
      content: 'We moved to Render in March.',
    });
  });

  it('returns not_found for an unknown fact', async () => {
    const text = await session.fail('2026-03-12', 'give_feedback', {
      fact_id: 'no-such-fact',
      signal: 'wrong',
    });

    expect(text).toMatch(/^not_found: /);
  });

  it('returns invalid_input for an unknown signal', async () => {
    const factId = await recordFlyIo();

    const text = await session.fail('2026-03-12', 'give_feedback', { fact_id: factId, signal: 'maybe' });

    // A field that fails the tool's own schema is refused by the SDK, with its message (MCP-TOOLS.md, "Errors").
    expect(text).toMatch(/Invalid arguments for tool give_feedback: signal/);
  });

  it('refuses a comment that contains a secret', async () => {
    const factId = await recordFlyIo();
    const token = ['gh', 'p_', 'aB3dE5gH7jK9mN1pQ2rS4tU6vW8xY0zaB3dE5'].join('');

    const text = await session.fail('2026-03-12', 'give_feedback', {
      fact_id: factId,
      signal: 'wrong',
      comment: `Check with ${token}.`,
    });

    expect(text).toMatch(/^invalid_input: /);
    expect(text).not.toContain(token);
  });
});
