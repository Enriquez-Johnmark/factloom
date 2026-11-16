// A live check of the Anthropic LLM client, run by hand with `pnpm run check:llm` from
// apps/mcp-server and ANTHROPIC_API_KEY set. It makes two calls with the same instructions
// and prints both usage reports to standard error. The second should read from the cache.
// It costs a fraction of a cent; it is never part of `pnpm check`.
import { z } from 'zod';
import {
  createAnthropicLlmClient,
  createAnthropicMessageSender,
  DEFAULT_LLM_MODELS,
  type LlmCallReport,
} from './create-anthropic-llm-client.ts';

// Long enough to be cached: the minimum cacheable prefix is 512 tokens on the current models
// (docs/research/technical/llm-anthropic.md, section 5). Fixed text, so both calls share it.
const RULES = Array.from(
  { length: 40 },
  (_, index) =>
    `Rule ${index + 1}. Name a dependency exactly as the text spells it, give its version only when the text states one, and never guess a version that the text does not support.`,
);
const INSTRUCTIONS = ['Extract the one dependency the text names, with its version.', ...RULES].join('\n');
const DependencySchema = z.strictObject({ name: z.string(), version: z.string().nullable() });

const reports: LlmCallReport[] = [];
const client = createAnthropicLlmClient({
  apiKey: process.env.ANTHROPIC_API_KEY ?? null,
  models: DEFAULT_LLM_MODELS,
  logUsage: (report) => reports.push(report),
  sendMessage: createAnthropicMessageSender(),
});

for (const input of ['The shop API depends on redis 7.2.', 'The billing worker uses kafka, version 3.8.']) {
  const result = await client.generateObject({
    task: 'extraction',
    instructions: INSTRUCTIONS,
    input,
    schema: DependencySchema,
  });
  if (!result.ok) {
    process.stderr.write(`check:llm failed: ${result.error.message}\n`);
    process.exitCode = 1;
    break;
  }
}
for (const report of reports) process.stderr.write(`${JSON.stringify(report)}\n`);
