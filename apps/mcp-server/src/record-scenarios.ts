// Records the model's answers for the timeline scenarios of FL-039, extraction and, from
// FL-042, the conflict judge: every scenario runs with the real Anthropic client, wrapped in record mode, and each answer is written as a
// recording in the scenario's own directory, which `pnpm check` then replays. Run by hand: it
// spends tokens. It sits in src for the reason given in record-extraction.ts.
import { softwareDevelopmentDomain } from '@kronomind/graph-rag';
import { createScenarioLlm } from '../evals/create-scenario-llm.ts';
import { runScenario } from '../evals/run-scenario.ts';
import { loadScenarios, SCENARIOS_DIRECTORY } from '../evals/scenario.ts';
import { formatScenarioReport } from '../evals/scenario-metrics.ts';
import {
  createAnthropicLlmClient,
  createAnthropicMessageSender,
  DEFAULT_LLM_MODELS,
} from './create-anthropic-llm-client.ts';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (apiKey === undefined || apiKey === '') {
  process.stderr.write(
    'ANTHROPIC_API_KEY is not set. Set it to record the scenarios; nothing was recorded.\n',
  );
  process.exit(1);
}

const scenarios = loadScenarios(SCENARIOS_DIRECTORY, softwareDevelopmentDomain);
if (!scenarios.ok) {
  process.stderr.write(`${scenarios.error.message}\n`);
  process.exit(1);
}

const inner = createAnthropicLlmClient({
  apiKey,
  models: DEFAULT_LLM_MODELS,
  logUsage: (report) => process.stdout.write(`usage: ${JSON.stringify(report)}\n`),
  sendMessage: createAnthropicMessageSender(),
});

const runs = [];
for (const { file, scenario } of scenarios.value) {
  const { llm, judge } = createScenarioLlm({
    file,
    extractionModel: DEFAULT_LLM_MODELS.extraction,
    judgeModel: DEFAULT_LLM_MODELS.conflict_detection,
    recordFrom: inner,
  });
  runs.push({ file, result: await runScenario(scenario, { llm, judge, domain: softwareDevelopmentDomain }) });
}
process.stdout.write(`${formatScenarioReport(runs)}\n`);
