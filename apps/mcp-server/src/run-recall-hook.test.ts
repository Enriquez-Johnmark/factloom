import { createTestDeps, recordFacts, recordVerification } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { NOTHING_MATCHES_LINE, RECALL_HOOK_LIMIT, runRecallHook } from './run-recall-hook.ts';

const NAMESPACE = 'repo:invoice-service';

/** Test dependencies with one fact recorded: the service reads its database from INVOICE_DB_URL. */
async function depsWithOneFact() {
  const deps = createTestDeps({ now: '2026-11-26T10:00:00.000Z' });
  const recorded = await recordFacts(deps, {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: { kind: 'agent_note', locator: null, version: null, content: 'A note.', observedAt: deps.now() },
    drafts: [
      {
        fact: {
          subjectEntityId: 'e-service',
          predicate: 'depends_on',
          object: { kind: 'value', value: 'INVOICE_DB_URL' },
          statement:
            'invoice-service reads its database connection string from INVOICE_DB_URL, never DATABASE_URL.',
          confidence: 1,
          validFrom: null,
          validTo: null,
        },
        newEntities: [{ id: 'e-service', type: 'repository', name: 'invoice-service' }],
      },
    ],
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  return { deps, factId: recorded.value.factIds[0] ?? '' };
}

const HookOutputSchema = z.strictObject({
  hookSpecificOutput: z.strictObject({
    hookEventName: z.literal('UserPromptSubmit'),
    additionalContext: z.string(),
  }),
});

/** Runs the hook on a standard input; `context` is the text it adds, or '' when it printed nothing. */
async function runHook(deps: ReturnType<typeof createTestDeps>, standardInput: string) {
  const printed: string[] = [];
  const failures: string[] = [];
  const exitCode = await runRecallHook(
    { ...deps, namespace: NAMESPACE, log: (message) => failures.push(message) },
    { standardInput, write: (text) => printed.push(text) },
  );
  const output = printed.join('');
  const context =
    output === '' ? '' : HookOutputSchema.parse(JSON.parse(output)).hookSpecificOutput.additionalContext;
  return { exitCode, output, context, failures };
}

const PROMPT_INPUT = JSON.stringify({
  session_id: 's-1',
  cwd: '/work/invoice-service',
  hook_event_name: 'UserPromptSubmit',
  prompt: 'Add databaseUrl to what readConfig returns, read from the environment.',
});

describe('the recall hook', () => {
  it('adds the current facts that match the prompt to the context, each with its identifier', async () => {
    const { deps, factId } = await depsWithOneFact();

    const { exitCode, context } = await runHook(deps, PROMPT_INPUT);

    expect(exitCode).toBe(0);
    expect(context).toContain(
      `- invoice-service reads its database connection string from INVOICE_DB_URL, never DATABASE_URL. (fact ${factId})`,
    );
    expect(context).toMatch(/^Factloom/);
  });

  it('says in one line that memory holds nothing for the prompt when it holds no fact, so the agent need not call recall', async () => {
    const deps = createTestDeps({ now: '2026-11-26T10:00:00.000Z' });

    const { exitCode, context } = await runHook(deps, PROMPT_INPUT);

    expect(exitCode).toBe(0);
    expect(context).toBe(NOTHING_MATCHES_LINE);
  });

  it('adds the facts that match, and not the line that nothing does', async () => {
    const { deps } = await depsWithOneFact();

    const { context } = await runHook(deps, PROMPT_INPUT);

    expect(context).not.toContain(NOTHING_MATCHES_LINE);
  });

  it('records the usage of the facts it prints, as recall does', async () => {
    const { deps, factId } = await depsWithOneFact();

    await runHook(deps, PROMPT_INPUT);

    const usage = await deps.store.getFactUsage({ namespace: NAMESPACE, factId });
    expect(usage.ok).toBe(true);
    if (!usage.ok) return;
    expect(usage.value?.recallCount).toBe(1);
  });

  it('adds no more facts than the hook limit', async () => {
    const deps = createTestDeps({ now: '2026-11-26T10:00:00.000Z' });
    const recorded = await recordFacts(deps, {
      namespace: NAMESPACE,
      trigger: 'agent',
      reasonCode: 'stated',
      source: { kind: 'agent_note', locator: null, version: null, content: 'Notes.', observedAt: deps.now() },
      drafts: Array.from({ length: RECALL_HOOK_LIMIT + 1 }, (_, index) => ({
        fact: {
          subjectEntityId: 'e-service',
          predicate: 'depends_on',
          object: { kind: 'value' as const, value: `library-${index}` },
          statement: `invoice-service depends on library-${index} for its database settings.`,
          confidence: 1,
          validFrom: null,
          validTo: null,
        },
        newEntities: index === 0 ? [{ id: 'e-service', type: 'repository', name: 'invoice-service' }] : [],
      })),
      restatedFactIds: [],
    });
    if (!recorded.ok) throw new Error(recorded.error.message);

    const { context } = await runHook(deps, PROMPT_INPUT);

    expect(context.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(RECALL_HOOK_LIMIT);
  });

  it('leaves out a fact whose latest verification found its file or symbol gone, and says nothing matches when it was the only one', async () => {
    const { deps, factId } = await depsWithOneFact();
    const verified = await recordVerification(deps, {
      namespace: NAMESPACE,
      trigger: 'maintenance',
      reasonCode: 'verification_due',
      factId,
      outcome: 'contradicted',
      method: 'deterministic',
    });
    if (!verified.ok) throw new Error(verified.error.message);

    const { exitCode, context } = await runHook(deps, PROMPT_INPUT);

    expect(exitCode).toBe(0);
    expect(context).toBe(NOTHING_MATCHES_LINE);
  });

  it('keeps a fact confirmed after an earlier verification found a problem', async () => {
    const { deps, factId } = await depsWithOneFact();
    for (const outcome of ['source_missing', 'confirmed'] as const) {
      const verified = await recordVerification(deps, {
        namespace: NAMESPACE,
        trigger: 'maintenance',
        reasonCode: 'verification_due',
        factId,
        outcome,
        method: 'deterministic',
      });
      if (!verified.ok) throw new Error(verified.error.message);
    }

    const { context } = await runHook(deps, PROMPT_INPUT);

    expect(context).toContain(`(fact ${factId})`);
  });

  it('fails without printing when standard input is not a prompt hook input', async () => {
    const { deps } = await depsWithOneFact();

    const { exitCode, output, failures } = await runHook(deps, 'not json');

    expect(exitCode).toBe(1);
    expect(output).toBe('');
    expect(failures).toHaveLength(1);
  });
});
