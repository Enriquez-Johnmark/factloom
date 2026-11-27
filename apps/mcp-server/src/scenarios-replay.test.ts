// The timeline scenarios of FL-039 through the use cases, with the conflict judge of FL-042, answered from recordings: no network
// and no API key. Each scenario is one test; the report and the four metrics are printed by
// the last. A missing recording fails the run and names the record command. It sits in src
// because the model label comes from the task map of the Anthropic client (FL-019).
import type { ConflictJudge, LlmClient } from '@kronomind/core';
import { softwareDevelopmentDomain } from '@kronomind/graph-rag';
import { describe, expect, it } from 'vitest';
import { judgeConflicts } from '@kronomind/maintenance';
import { createScenarioLlm } from '../evals/create-scenario-llm.ts';
import { runScenario, type ScenarioResult } from '../evals/run-scenario.ts';
import { loadScenarios, SCENARIOS_DIRECTORY } from '../evals/scenario.ts';
import {
  formatScenarioReport,
  judgeScenarioOutcome,
  measureFalseInvalidationRate,
  measureStalenessRate,
  SCENARIOS_FAILING_UNTIL_FL_042,
} from '../evals/scenario-metrics.ts';
import { DEFAULT_LLM_MODELS } from './create-anthropic-llm-client.ts';

const scenarios = loadScenarios(SCENARIOS_DIRECTORY, softwareDevelopmentDomain);
if (!scenarios.ok) throw new Error(scenarios.error.message);

const runs: { file: string; result: ScenarioResult }[] = [];

/**
 * The scenarios whose conflicts the rules before the LLM decide, by FL-042's acceptance: a
 * different predicate, and a multi-valued one. Their judge's LLM fails on any call whose task
 * is conflict_detection, so a call would fail the scenario.
 */
const MAKES_NO_JUDGE_CALL: readonly string[] = ['multi-valued-predicate.yaml', 'unrelated-fact.yaml'];

function createJudgeThatMustNotCallTheLlm(): ConflictJudge {
  const llm: LlmClient = {
    generateObject(request) {
      if (request.task === 'conflict_detection') throw new Error('The judge called the LLM.');
      throw new Error(`An unexpected call for the task ${request.task}.`);
    },
  };
  return (input) => judgeConflicts({ llm }, input);
}

describe('the timeline scenarios in replay', () => {
  for (const { file, scenario } of scenarios.value) {
    const listed = SCENARIOS_FAILING_UNTIL_FL_042.includes(file);
    it(`${listed ? 'runs, and fails until FL-042,' : 'passes'}: ${scenario.name}`, async () => {
      const { llm, judge } = createScenarioLlm({
        file,
        extractionModel: DEFAULT_LLM_MODELS.extraction,
        judgeModel: DEFAULT_LLM_MODELS.conflict_detection,
      });
      const usedJudge = MAKES_NO_JUDGE_CALL.includes(file) ? createJudgeThatMustNotCallTheLlm() : judge;

      const result = await runScenario(scenario, {
        llm,
        judge: usedJudge,
        domain: softwareDevelopmentDomain,
      });
      runs.push({ file, result });

      const outcome = judgeScenarioOutcome(result, listed);
      expect(outcome.acceptable, `${outcome.message}\n${formatScenarioReport([{ file, result }])}`).toBe(
        true,
      );
    });
  }

  it('prints the report, with no stale answer and no false invalidation over the whole set', () => {
    console.info(
      `Timeline scenarios in replay, model ${DEFAULT_LLM_MODELS.extraction}:\n${formatScenarioReport(runs)}`,
    );
    const results = runs.map((run) => run.result);
    expect(runs).toHaveLength(scenarios.value.length);
    expect(measureStalenessRate(results).count).toBe(0);
    expect(measureFalseInvalidationRate(results).count).toBe(0);
  });
});
