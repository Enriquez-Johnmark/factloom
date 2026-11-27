// The prompt hook of FL-080: Claude Code runs `kronomind hook recall` when a prompt is submitted,
// with the prompt in a JSON document on standard input, and adds the `additionalContext` of
// `hookSpecificOutput` that the command prints on exit 0 to the agent's context
// (https://code.claude.com/docs/en/hooks.md and hooks-guide.md, read on 2026-11-26).
// The agent then has the facts that match the task without spending turns to load and call
// recall, which is where the comparison of FL-079 measured Kronomind's cost.
import {
  type Embedder,
  type MemoryStore,
  type Namespace,
  ok,
  type Result,
  type Timestamp,
  type VerificationOutcome,
} from '@kronomind/core';
import { type RecalledFact, recall } from '@kronomind/graph-rag';
import { z } from 'zod';
import type { Logger } from './create-kronomind-server.ts';

/** The most facts the hook prints: few, because they enter the context with every prompt. */
export const RECALL_HOOK_LIMIT = 5;

/** The question recall takes is at most this long, as in the recall tool. */
const QUESTION_LENGTH_LIMIT = 2000;

/** What a prompt hook receives on standard input; only the prompt is read. */
const PromptHookInputSchema = z.object({ prompt: z.string() });

/** What the hook says when memory holds no current fact that matches the prompt (FL-083). */
export const NOTHING_MATCHES_LINE =
  "Kronomind, this repository's memory, holds no current facts that match this prompt; there is no need to call recall for it.";

const HEADING =
  "Kronomind, this repository's memory, recalled these current facts for this prompt, best match first. Call recall only for what they do not cover.";

/** What the latest verification of a fact must not be for the hook to hand it over. */
const OUT_OF_DATE_OUTCOMES: readonly VerificationOutcome[] = ['contradicted', 'source_missing'];

/**
 * The facts whose latest verification did not find their file or symbol gone, at most the
 * hook limit, in order. A map fact whose function moved is contradicted until maintenance
 * repairs it (FL-071, FL-082), and handing it over would send the agent to the wrong file.
 */
async function keepCurrentlyVerified(
  deps: { readonly store: MemoryStore; readonly namespace: Namespace },
  facts: readonly RecalledFact[],
): Promise<Result<readonly RecalledFact[]>> {
  const kept: RecalledFact[] = [];
  for (const found of facts) {
    if (kept.length === RECALL_HOOK_LIMIT) break;
    const verifications = await deps.store.listVerifications({
      namespace: deps.namespace,
      factId: found.fact.id,
    });
    if (!verifications.ok) return verifications;
    const latest = verifications.value.at(-1);
    if (latest === undefined || !OUT_OF_DATE_OUTCOMES.includes(latest.outcome)) kept.push(found);
  }
  return ok(kept);
}

/** Reads the prompt from the hook's standard input, or returns null when it is not a hook input. */
function readPrompt(standardInput: string): string | null {
  try {
    const parsed = PromptHookInputSchema.safeParse(JSON.parse(standardInput));
    return parsed.success ? parsed.data.prompt : null;
  } catch {
    return null;
  }
}

/**
 * Runs the prompt hook: recalls the current facts that match the prompt, records their usage as
 * recall does, and writes them as a short list in the hook's JSON output, or one line saying
 * none match. Returns the exit code: 0, or 1 when it failed, which Claude Code treats as an error
 * that does not block the prompt.
 */
export async function runRecallHook(
  deps: {
    readonly store: MemoryStore;
    readonly embedder: Embedder;
    readonly namespace: Namespace;
    readonly now: () => Timestamp;
    readonly log: Logger;
  },
  io: { readonly standardInput: string; readonly write: (text: string) => void },
): Promise<number> {
  const prompt = readPrompt(io.standardInput);
  if (prompt === null) {
    deps.log('The recall hook needs a JSON document with a prompt on standard input.');
    return 1;
  }
  if (prompt.trim() === '') return 0;
  const recalled = await recall(deps, {
    namespace: deps.namespace,
    question: prompt.slice(0, QUESTION_LENGTH_LIMIT),
    validAt: null,
    knownAt: null,
    // Twice the limit, so that facts left out as out of date leave room for the next matches.
    limit: RECALL_HOOK_LIMIT * 2,
  });
  if (!recalled.ok) {
    deps.log(`The recall hook failed: ${recalled.error.code}: ${recalled.error.message}`);
    return 1;
  }
  const facts = await keepCurrentlyVerified(deps, recalled.value.facts);
  if (!facts.ok) {
    deps.log(`The recall hook failed: ${facts.error.code}: ${facts.error.message}`);
    return 1;
  }
  // Said, not left silent: with no line the instructions send the agent to recall itself,
  // a search and a call for nothing (FL-081, FL-083).
  if (facts.value.length === 0) {
    writeContext(io, NOTHING_MATCHES_LINE);
    return 0;
  }
  // Awaited, unlike in the recall tool: the process ends when the hook returns.
  const usage = await deps.store.recordFactUsage({
    namespace: deps.namespace,
    factIds: facts.value.map((found) => found.fact.id),
    recalledAt: deps.now(),
  });
  if (!usage.ok) deps.log(`The usage of recalled facts was not recorded: ${usage.error.code}`);
  const lines = facts.value.map((found) => `- ${found.fact.statement} (fact ${found.fact.id})`);
  writeContext(io, [HEADING, ...lines].join('\n'));
  return 0;
}

/** Writes the hook's output: a text added to the agent's context. */
function writeContext(io: { readonly write: (text: string) => void }, text: string): void {
  const output = { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } };
  io.write(`${JSON.stringify(output)}\n`);
}

/** Reads all of standard input as text, for the hook's input. */
export async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString('utf8');
}
