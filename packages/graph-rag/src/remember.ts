import {
  err,
  type FactId,
  type LlmClient,
  type Namespace,
  type OperationDeps,
  ok,
  type Result,
  recordFacts,
  type Trigger,
} from '@factloom/core';
import { type CheckedField, checkForSecrets } from './check-for-secrets.ts';
import { conflictsWithEachOther, isSameFact } from './compare-with-candidates.ts';
import { compareWithMemory } from './compare-with-memory.ts';
import { extractFacts } from './extract-facts.ts';
import { type PlannedFact, planFacts } from './plan-facts.ts';
import { type RememberedFact, readRememberedFacts } from './read-remembered-facts.ts';
import type { SourceInput } from './source-input.ts';

export type RememberDeps = OperationDeps & { readonly llm: LlmClient };

export type RememberInput = {
  readonly namespace: Namespace;
  readonly text: string;
  readonly source: SourceInput;
  readonly trigger: Trigger;
};

/** An extracted fact that was not recorded. */
export type SkippedFact = {
  readonly statement: string;
  readonly reason: 'conflicts_with_stored_fact' | 'conflicts_within_text';
  readonly conflictingFactIds: readonly FactId[];
};

export type RememberResult = {
  readonly facts: readonly RememberedFact[];
  readonly skipped: readonly SkippedFact[];
};

/** What happened to each planned fact, in extraction order. */
type Sorted =
  | { readonly kind: 'new'; readonly planned: PlannedFact }
  | { readonly kind: 'restates'; readonly planned: PlannedFact; readonly factId: FactId }
  | { readonly kind: 'skipped'; readonly planned: PlannedFact; readonly skipped: SkippedFact };

function listCheckedFields(input: RememberInput): CheckedField[] {
  const fields: CheckedField[] = [{ name: 'text', value: input.text }];
  if (input.source.locator !== null) fields.push({ name: 'source.locator', value: input.source.locator });
  if (input.source.version !== null) fields.push({ name: 'source.version', value: input.source.version });
  return fields;
}

/** Keeps the first of the facts that the text states more than once. */
function dropRepeats(planned: readonly PlannedFact[]): PlannedFact[] {
  const kept: PlannedFact[] = [];
  for (const fact of planned) {
    if (!kept.some((earlier) => isSameFact(earlier.draft, fact.draft))) kept.push(fact);
  }
  return kept;
}

/** Sorts one fact against the live facts with its subject and predicate. */
async function sortAgainstMemory(
  deps: RememberDeps,
  namespace: Namespace,
  planned: PlannedFact,
): Promise<Result<Sorted>> {
  const comparison = await compareWithMemory(deps, { namespace, planned });
  if (!comparison.ok) return comparison;
  switch (comparison.value.kind) {
    case 'new':
      return ok({ kind: 'new', planned });
    case 'restates':
      return ok({ kind: 'restates', planned, factId: comparison.value.factId });
    case 'conflicts':
      return ok({
        kind: 'skipped',
        planned,
        skipped: {
          statement: planned.draft.fact.statement,
          reason: 'conflicts_with_stored_fact',
          conflictingFactIds: comparison.value.conflictingFactIds,
        },
      });
    default: {
      const unhandled: never = comparison.value;
      throw new Error(`Unhandled comparison: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Skips every pair of new facts that conflict with each other. */
function skipConflictsWithinText(sorted: readonly Sorted[]): Sorted[] {
  const newFacts = sorted.filter((entry) => entry.kind === 'new');
  return sorted.map((entry) => {
    if (entry.kind !== 'new') return entry;
    const conflicts = newFacts.some(
      (other) => other !== entry && conflictsWithEachOther(entry.planned, other.planned),
    );
    if (!conflicts) return entry;
    return {
      kind: 'skipped',
      planned: entry.planned,
      skipped: {
        statement: entry.planned.draft.fact.statement,
        reason: 'conflicts_within_text',
        conflictingFactIds: [],
      },
    };
  });
}

/**
 * Extracts facts from a text, resolves their entities, and records them in one commit. A fact
 * already live gains the text as a source and is not recorded again. A fact that would break
 * the single-value rule, with a stored fact or with another fact from the same text, is not
 * recorded and is returned in `skipped`. Refuses text that contains a secret before the LLM
 * call. Makes no commit when nothing is recorded or restated.
 */
export async function remember(deps: RememberDeps, input: RememberInput): Promise<Result<RememberResult>> {
  if (input.text.trim() === '') return err('invalid_input', 'The text is empty. Give the text to remember.');
  if (input.source.kind.trim() === '') return err('invalid_input', 'The source kind is empty.');
  const secrets = checkForSecrets(listCheckedFields(input));
  if (!secrets.ok) return secrets;

  const extracted = await extractFacts(deps, input.text);
  if (!extracted.ok) return extracted;
  if (extracted.value.length === 0) return ok({ facts: [], skipped: [] });

  const planned = await planFacts(deps, { namespace: input.namespace, facts: extracted.value });
  if (!planned.ok) return planned;
  const sortedAgainstMemory: Sorted[] = [];
  for (const fact of dropRepeats(planned.value)) {
    const sorted = await sortAgainstMemory(deps, input.namespace, fact);
    if (!sorted.ok) return sorted;
    sortedAgainstMemory.push(sorted.value);
  }
  const sorted = skipConflictsWithinText(sortedAgainstMemory);
  const skipped = sorted.flatMap((entry) => (entry.kind === 'skipped' ? [entry.skipped] : []));
  const newFacts = sorted.flatMap((entry) => (entry.kind === 'new' ? [entry.planned.draft] : []));
  const restatedFactIds = [
    ...new Set(sorted.flatMap((entry) => (entry.kind === 'restates' ? [entry.factId] : []))),
  ];
  if (newFacts.length === 0 && restatedFactIds.length === 0) return ok({ facts: [], skipped });

  const recorded = await recordFacts(deps, {
    namespace: input.namespace,
    trigger: input.trigger,
    reasonCode: newFacts.length > 0 ? 'stated' : 'restated',
    source: { ...input.source, content: input.text, observedAt: deps.now() },
    drafts: newFacts,
    restatedFactIds,
  });
  if (!recorded.ok) return recorded;

  const recordedIds = [...recorded.value.factIds];
  const outcomes: { readonly factId: FactId; readonly outcome: RememberedFact['outcome'] }[] = [];
  for (const entry of sorted) {
    if (entry.kind === 'restates') outcomes.push({ factId: entry.factId, outcome: 'restated' });
    if (entry.kind !== 'new') continue;
    const factId = recordedIds.shift();
    if (factId !== undefined) outcomes.push({ factId, outcome: 'recorded' });
  }
  const facts = await readRememberedFacts(deps, { namespace: input.namespace, outcomes });
  if (!facts.ok) return facts;
  return ok({ facts: facts.value, skipped });
}
