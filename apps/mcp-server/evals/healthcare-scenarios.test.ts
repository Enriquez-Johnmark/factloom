// The healthcare scenarios of FL-093, through the FHIR import and a person's decisions, on
// invented records only. No LLM is called: the import maps records by fixed rules, so the
// client given to the runner fails the test if it is called. Each scenario is one test; the
// last prints the report and checks the two rates over the whole set.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { healthcareDomain } from '@kronomind/adapters';
import type { LlmClient } from '@kronomind/core';
import { describe, expect, it } from 'vitest';
import { runScenario, type ScenarioResult } from './run-scenario.ts';
import { HEALTHCARE_SCENARIOS_DIRECTORY, loadScenarios } from './scenario.ts';
import {
  formatScenarioReport,
  measureFalseInvalidationRate,
  measureStalenessRate,
} from './scenario-metrics.ts';

const UNREACHABLE_LLM: LlmClient = {
  generateObject() {
    throw new Error('The LLM was called.');
  },
};

/** The cases of the healthcare plan, by the start of their names: seven from FL-093, one from FL-100. */
const CASES = [
  'Medication stopped',
  'Last day of a period',
  'Entered in error',
  'Sources disagree',
  'Correction rejected',
  'Condition resolved',
  'Condition refuted',
  'Result corrected',
] as const;

const scenarios = loadScenarios(HEALTHCARE_SCENARIOS_DIRECTORY, healthcareDomain);
if (!scenarios.ok) throw new Error(scenarios.error.message);

describe('the healthcare scenario files', () => {
  it('cover every case, one file each', () => {
    const names = scenarios.value.map(({ scenario }) => scenario.name);
    expect(names).toHaveLength(CASES.length);
    for (const covered of CASES)
      expect(
        names.filter((name) => name.startsWith(`${covered}:`)),
        covered,
      ).toHaveLength(1);
  });

  it('say they hold invented data, and name only invented patients', () => {
    for (const file of readdirSync(HEALTHCARE_SCENARIOS_DIRECTORY).filter((name) => name.endsWith('.yaml'))) {
      const text = readFileSync(join(HEALTHCARE_SCENARIOS_DIRECTORY, file), 'utf8');
      expect(text.startsWith('# INVENTED DATA.'), file).toBe(true);
      const patients = [...text.matchAll(/Patient\/[\w-]+/gu)].map((match) => match[0]);
      expect(patients.length, file).toBeGreaterThan(0);
      expect(
        patients.filter((patient) => !patient.startsWith('Patient/invented-')),
        file,
      ).toEqual([]);
    }
  });

  it('ask each scenario about now and about a past date', () => {
    for (const { file, scenario } of scenarios.value) {
      const asks = scenario.expect.flatMap((entry) => ('ask' in entry ? [entry.ask] : []));
      expect(
        asks.some((ask) => ask.as_of === undefined && ask.known_at === undefined),
        file,
      ).toBe(true);
      expect(
        asks.some((ask) => ask.as_of !== undefined || ask.known_at !== undefined),
        file,
      ).toBe(true);
    }
  });
});

describe('the healthcare scenarios in replay', () => {
  const runs: { file: string; result: ScenarioResult }[] = [];
  for (const { file, scenario } of scenarios.value) {
    it(`passes: ${scenario.name}`, async () => {
      const result = await runScenario(scenario, { llm: UNREACHABLE_LLM, domain: healthcareDomain });
      runs.push({ file, result });

      expect(result.passed, formatScenarioReport([{ file, result }])).toBe(true);
    });
  }

  it('prints the report, with no stale answer and no false invalidation over the whole set', () => {
    console.info(`Healthcare scenarios, invented data:\n${formatScenarioReport(runs)}`);
    const results = runs.map((run) => run.result);
    expect(runs).toHaveLength(scenarios.value.length);
    expect(measureStalenessRate(results).count).toBe(0);
    expect(measureFalseInvalidationRate(results).count).toBe(0);
  });
});
