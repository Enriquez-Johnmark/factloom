// The timeline scenarios of FL-039 through the use cases, answered from recordings: no network
// and no API key. Each scenario is one test; the report and the four metrics are printed by
// the last. A missing recording fails the run and names the record command. It sits in src
// because the model label comes from the task map of the Anthropic client (FL-019).
import { softwareDevelopmentDomain } from '@factloom/graph-rag';
import { describe, expect, it } from 'vitest';
import { createRecordingLlmClient } from '../evals/create-recording-llm-client.ts';
import {
  findScenarioRecordingsDirectory,
  runScenario,
  SCENARIO_RECORD_COMMAND,
  type ScenarioResult,
} from '../evals/run-scenario.ts';
import { loadScenarios, SCENARIOS_DIRECTORY } from '../evals/scenario.ts';
import {
  formatScenarioReport,
  judgeScenarioOutcome,
  measureFalseInvalidationRate,
  SCENARIOS_FAILING_UNTIL_FL_042,
} from '../evals/scenario-metrics.ts';
import { DEFAULT_LLM_MODELS } from './create-anthropic-llm-client.ts';

const scenarios = loadScenarios(SCENARIOS_DIRECTORY, softwareDevelopmentDomain);
if (!scenarios.ok) throw new Error(scenarios.error.message);

const runs: { file: string; result: ScenarioResult }[] = [];

describe('the timeline scenarios in replay', () => {
  for (const { file, scenario } of scenarios.value) {
    const listed = SCENARIOS_FAILING_UNTIL_FL_042.includes(file);
    it(`${listed ? 'runs, and fails until FL-042,' : 'passes'}: ${scenario.name}`, async () => {
      const llm = createRecordingLlmClient({
        directory: findScenarioRecordingsDirectory(file),
        modelLabel: DEFAULT_LLM_MODELS.extraction,
        recordCommand: SCENARIO_RECORD_COMMAND,
      });

      const result = await runScenario(scenario, { llm, domain: softwareDevelopmentDomain });
      runs.push({ file, result });

      const outcome = judgeScenarioOutcome(result, listed);
      expect(outcome.acceptable, `${outcome.message}\n${formatScenarioReport([{ file, result }])}`).toBe(
        true,
      );
    });
  }

  it('prints the report, with no false invalidation among the scenarios that pass', () => {
    console.info(
      `Timeline scenarios in replay, model ${DEFAULT_LLM_MODELS.extraction}:\n${formatScenarioReport(runs)}`,
    );
    const passing = runs.filter((run) => !SCENARIOS_FAILING_UNTIL_FL_042.includes(run.file));
    expect(runs).toHaveLength(scenarios.value.length);
    expect(measureFalseInvalidationRate(passing.map((run) => run.result)).count).toBe(0);
  });
});
