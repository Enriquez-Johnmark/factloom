import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createScriptedLlm, err, type MemoryStore, parseDateInput } from '@kronomind/core';
import { softwareDevelopmentDomain } from '@kronomind/graph-rag';
import { describe, expect, it } from 'vitest';
import { buildAskTimeFilter, runScenario } from './run-scenario.ts';
import { loadScenarios, parseScenario, type Scenario } from './scenario.ts';
import { judgeScenarioOutcome } from './scenario-metrics.ts';

function scenarioOf(yamlText: string): Scenario {
  const parsed = parseScenario(yamlText);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function day(text: string) {
  const parsed = parseDateInput(text);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

const SHOP_API = { type: 'repository', name: 'shop-api' };

/** One extraction answer of the scripted LLM: the facts `remember` will record. */
function extraction(...facts: readonly object[]) {
  return { facts: facts.map((fact) => ({ confidence: 0.9, valid_from: null, valid_to: null, ...fact })) };
}

const PNPM_SCENARIO = `
name: "pnpm stated once"
steps:
  - at: 2026-01-10
    remember: shop-api uses pnpm as its package manager.
expect:
  - ask: { subject: { name: shop-api, type: repository }, predicate: uses_package_manager, as_of: 2026-01-20, known_at: 2026-01-20 }
    returns: [pnpm]
`;

const PNPM_FACT = {
  subject: SHOP_API,
  predicate: 'uses_package_manager',
  object: { type: 'dependency', name: 'pnpm' },
  statement: 'shop-api uses pnpm as its package manager.',
};

describe('the scenario runner', () => {
  it('an entities expectation counts the entities with a name of any type', async () => {
    const scenario = scenarioOf(`
name: "one name under two types"
steps:
  - at: 2026-01-10
    remember: shop-api follows the convention trunk-based development.
  - at: 2026-02-20
    remember: The decision trunk-based development has the status accepted.
expect:
  - entities: { name: trunk-based development }
    count: 1
`);
    const llm = createScriptedLlm([
      extraction({
        subject: SHOP_API,
        predicate: 'follows_convention',
        object: { type: 'convention', name: 'trunk-based development' },
        statement: 'shop-api follows the convention trunk-based development.',
      }),
      extraction({
        subject: { type: 'decision', name: 'trunk-based development' },
        predicate: 'has_status',
        object: { value: 'accepted' },
        statement: 'The decision trunk-based development has the status accepted.',
      }),
    ]);

    const result = await runScenario(scenario, { llm, domain: softwareDevelopmentDomain });

    expect(result.expectations).toMatchObject([{ kind: 'entities', found: 1, passed: true }]);
  });

  it('an ask reads memory through listFacts with both dates', async () => {
    const failingLane = () => Promise.resolve(err('storage_failed', 'A retrieval lane was used.'));
    const withoutLanes = (store: MemoryStore): MemoryStore => ({
      ...store,
      searchFactsByVector: failingLane,
      searchFactsByKeyword: failingLane,
    });
    const llm = createScriptedLlm([extraction(PNPM_FACT)]);

    const result = await runScenario(scenarioOf(PNPM_SCENARIO), {
      llm,
      domain: softwareDevelopmentDomain,
      wrapStore: withoutLanes,
    });

    expect(result.stepFailure).toBeNull();
    expect(result.passed).toBe(true);
  });

  it('a listed scenario that passes fails the check', async () => {
    const llm = createScriptedLlm([extraction(PNPM_FACT)]);
    const result = await runScenario(scenarioOf(PNPM_SCENARIO), { llm, domain: softwareDevelopmentDomain });

    const outcome = judgeScenarioOutcome(result, true);

    expect(result.passed).toBe(true);
    expect(outcome.acceptable).toBe(false);
  });

  it('an unlisted scenario that fails fails the check, and a listed one that fails does not', async () => {
    const llm = createScriptedLlm([
      extraction({ ...PNPM_FACT, object: { type: 'dependency', name: 'npm' } }),
    ]);
    const result = await runScenario(scenarioOf(PNPM_SCENARIO), { llm, domain: softwareDevelopmentDomain });

    expect(result.passed).toBe(false);
    expect(judgeScenarioOutcome(result, false).acceptable).toBe(false);
    expect(judgeScenarioOutcome(result, true).acceptable).toBe(true);
  });

  it('records the error code of a step whose use case fails, and fails the scenario', async () => {
    const scenario = scenarioOf(`
name: "a change to a fact that was never recorded"
steps:
  - at: 2026-01-10
    change_fact:
      subject: { name: shop-api, type: repository }
      predicate: follows_convention
      value: squash merges
      because: was_wrong
      explanation: It was never followed.
expect:
  - entities: { name: squash merges }
    count: 0
`);

    const result = await runScenario(scenario, {
      llm: createScriptedLlm([]),
      domain: softwareDevelopmentDomain,
    });

    expect(result.stepFailure).toMatchObject({ step: 1, code: 'not_found' });
    expect(result.passed).toBe(false);
  });

  it('fails with the file and the predicate when a scenario names a predicate the domain does not have', () => {
    const directory = mkdtempSync(join(tmpdir(), 'kronomind-scenarios-'));
    try {
      writeFileSync(
        join(directory, 'unknown-predicate.yaml'),
        PNPM_SCENARIO.replace('predicate: uses_package_manager', 'predicate: uses_build_tool'),
      );

      const loaded = loadScenarios(directory, softwareDevelopmentDomain);

      expect(loaded.ok).toBe(false);
      if (loaded.ok) return;
      expect(loaded.error.code).toBe('invalid_input');
      expect(loaded.error.message).toContain('unknown-predicate.yaml');
      expect(loaded.error.message).toContain('uses_build_tool');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('the time filter of an ask', () => {
  const now = day('2026-04-02T00:00:00.001Z');
  const ask = { subject: { name: 'shop-api' }, predicate: 'deploys_to' };

  it('uses now for both dates when the ask gives neither', () => {
    expect(buildAskTimeFilter(ask, now)).toEqual({ validAt: now, knownAt: now });
  });

  it('gives the as-of date the known-at date when only known_at is given', () => {
    const knownAt = day('2026-02-01');
    expect(buildAskTimeFilter({ ...ask, known_at: '2026-02-01' }, now)).toEqual({
      validAt: knownAt,
      knownAt,
    });
  });

  it('keeps now as the known-at date when only as_of is given', () => {
    expect(buildAskTimeFilter({ ...ask, as_of: '2025-07-15' }, now)).toEqual({
      validAt: day('2025-07-15'),
      knownAt: now,
    });
  });
});
