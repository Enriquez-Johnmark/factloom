import {
  type ConflictJudge,
  endFact,
  err,
  type FactDraft,
  type FactId,
  type FactWithSources,
  invalidateFact,
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
import { type ConflictResolution, resolveConflict } from './resolve-conflict.ts';
import type { SourceInput } from './source-input.ts';

export type RememberDeps = OperationDeps & {
  readonly llm: LlmClient;
  /** Phase 2 (FL-042). Without it, or under the policy `human_approval`, a conflict is skipped as in phase 1. */
  readonly judge?: ConflictJudge;
};

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
  | { readonly kind: 'skipped'; readonly planned: PlannedFact; readonly skipped: SkippedFact }
  | {
      readonly kind: 'supersedes';
      readonly planned: PlannedFact;
      readonly resolution: Extract<ConflictResolution, { kind: 'supersedes' }>;
    };

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

function skipAsConflicting(planned: PlannedFact, conflictingFactIds: readonly FactId[]): Sorted {
  return {
    kind: 'skipped',
    planned,
    skipped: {
      statement: planned.draft.fact.statement,
      reason: 'conflicts_with_stored_fact',
      conflictingFactIds,
    },
  };
}

/** Reads the stored facts in the way, for the judge. */
async function readConflictingFacts(
  deps: RememberDeps,
  namespace: Namespace,
  factIds: readonly FactId[],
): Promise<Result<FactWithSources[]>> {
  const facts: FactWithSources[] = [];
  for (const factId of factIds) {
    const read = await deps.store.getFact({ namespace, factId });
    if (!read.ok) return read;
    if (read.value !== null) facts.push(read.value);
  }
  return ok(facts);
}

/**
 * Sorts one fact against the live facts with its subject and predicate. A conflict goes to the
 * judge when there is one and the domain's correction policy is `automatic`; otherwise, and
 * whenever the judge leaves it uncertain, the fact is skipped as in phase 1.
 */
async function sortAgainstMemory(
  deps: RememberDeps,
  input: RememberInput,
  planned: PlannedFact,
): Promise<Result<Sorted>> {
  const comparison = await compareWithMemory(deps, { namespace: input.namespace, planned });
  if (!comparison.ok) return comparison;
  switch (comparison.value.kind) {
    case 'new':
      return ok({ kind: 'new', planned });
    case 'restates':
      return ok({ kind: 'restates', planned, factId: comparison.value.factId });
    case 'conflicts': {
      const { conflictingFactIds } = comparison.value;
      if (deps.judge === undefined || deps.domain.correctionPolicy !== 'automatic') {
        return ok(skipAsConflicting(planned, conflictingFactIds));
      }
      const conflicting = await readConflictingFacts(deps, input.namespace, conflictingFactIds);
      if (!conflicting.ok) return conflicting;
      const resolution = await resolveConflict(deps.judge, {
        planned,
        conflicting: conflicting.value,
        sourceText: input.text,
        observedAt: deps.now(),
      });
      if (resolution.kind === 'restates') return ok({ kind: 'restates', planned, factId: resolution.factId });
      if (resolution.kind === 'supersedes') return ok({ kind: 'supersedes', planned, resolution });
      return ok(skipAsConflicting(planned, conflictingFactIds));
    }
    default: {
      const unhandled: never = comparison.value;
      throw new Error(`Unhandled comparison: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** The draft an entry would record, for the check within the text: a new fact or a successor. */
function toRecordable(entry: Sorted): { readonly draft: FactDraft; readonly singleValued: boolean } | null {
  if (entry.kind === 'new') return entry.planned;
  if (entry.kind === 'supersedes')
    return { draft: entry.resolution.draft, singleValued: entry.planned.singleValued };
  return null;
}

/** Skips every pair of facts to be recorded from this text that conflict with each other. */
function skipConflictsWithinText(sorted: readonly Sorted[]): Sorted[] {
  return sorted.map((entry) => {
    const recordable = toRecordable(entry);
    if (recordable === null) return entry;
    const conflicts = sorted.some((other) => {
      const otherRecordable = toRecordable(other);
      return (
        other !== entry && otherRecordable !== null && conflictsWithEachOther(recordable, otherRecordable)
      );
    });
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

/** Leaves out the new entities an earlier commit of this call already created. */
function withoutCreatedEntities(draft: FactDraft, created: ReadonlySet<string>): FactDraft {
  return { ...draft, newEntities: draft.newEntities.filter((entity) => !created.has(entity.id)) };
}

type Supersession = Extract<Sorted, { kind: 'supersedes' }>;

/**
 * Ends or invalidates the stored fact of one supersession, in its own commit, with the new
 * fact as successor or replacement (ADR 0022). Returns the new fact's identifier, or null
 * when memory changed in between and the fact is to be skipped.
 */
async function applySupersession(
  deps: RememberDeps,
  input: RememberInput,
  entry: Supersession,
  draft: FactDraft,
): Promise<Result<FactId | null>> {
  const { resolution } = entry;
  const context = { namespace: input.namespace, trigger: input.trigger };
  const source = { ...input.source, content: input.text, observedAt: deps.now() };
  const { supersession } = resolution;
  const applied =
    supersession.kind === 'succession'
      ? await endFact(deps, {
          ...context,
          reasonCode: 'judged_ended',
          factId: resolution.storedFactId,
          validTo: supersession.changedAt,
          source,
          successor: draft,
        }).then((result) => (result.ok ? ok(result.value.successorFactId) : result))
      : await invalidateFact(deps, {
          ...context,
          reasonCode: 'judged_wrong',
          factId: resolution.storedFactId,
          source,
          replacement: draft,
        }).then((result) => (result.ok ? ok(result.value.replacementFactId) : result));
  if (applied.ok) return applied;
  if (applied.error.code === 'conflict' || applied.error.code === 'already_invalidated') return ok(null);
  return applied;
}

/**
 * Extracts facts from a text, resolves their entities, and records them in one commit. A fact
 * already live gains the text as a source and is not recorded again. A fact that would break
 * the single-value rule, with a stored fact or with another fact from the same text, is not
 * recorded and is returned in `skipped`, unless a judge decides a stored fact gives way: then
 * the stored fact is ended or invalidated, in a commit of its own, with the new fact in its
 * place (FL-042, ADR 0022). Refuses text that contains a secret before the LLM call. Makes no
 * commit when nothing is recorded, restated or superseded.
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
    const sorted = await sortAgainstMemory(deps, input, fact);
    if (!sorted.ok) return sorted;
    sortedAgainstMemory.push(sorted.value);
  }
  const sorted = skipConflictsWithinText(sortedAgainstMemory);
  const skipped = sorted.flatMap((entry) => (entry.kind === 'skipped' ? [entry.skipped] : []));
  const newFacts = sorted.flatMap((entry) => (entry.kind === 'new' ? [entry.planned.draft] : []));
  const restatedFactIds = [
    ...new Set(sorted.flatMap((entry) => (entry.kind === 'restates' ? [entry.factId] : []))),
  ];
  const supersessions = sorted.filter((entry): entry is Supersession => entry.kind === 'supersedes');
  if (newFacts.length === 0 && restatedFactIds.length === 0 && supersessions.length === 0) {
    return ok({ facts: [], skipped });
  }

  const recordedIds: FactId[] = [];
  if (newFacts.length > 0 || restatedFactIds.length > 0) {
    const recorded = await recordFacts(deps, {
      namespace: input.namespace,
      trigger: input.trigger,
      reasonCode: newFacts.length > 0 ? 'stated' : 'restated',
      source: { ...input.source, content: input.text, observedAt: deps.now() },
      drafts: newFacts,
      restatedFactIds,
    });
    if (!recorded.ok) return recorded;
    recordedIds.push(...recorded.value.factIds);
  }

  // Each succession and correction is its own commit, after the first (ADR 0022).
  const created = new Set(newFacts.flatMap((draft) => draft.newEntities.map((entity) => entity.id)));
  const supersedingIds = new Map<Supersession, FactId>();
  for (const entry of supersessions) {
    const draft = withoutCreatedEntities(entry.resolution.draft, created);
    const applied = await applySupersession(deps, input, entry, draft);
    if (!applied.ok) return applied;
    if (applied.value === null) {
      skipped.push({
        statement: entry.planned.draft.fact.statement,
        reason: 'conflicts_with_stored_fact',
        conflictingFactIds: [entry.resolution.storedFactId],
      });
      continue;
    }
    for (const entity of draft.newEntities) created.add(entity.id);
    supersedingIds.set(entry, applied.value);
  }

  const outcomes: Parameters<typeof readRememberedFacts>[1]['outcomes'][number][] = [];
  for (const entry of sorted) {
    if (entry.kind === 'restates') outcomes.push({ factId: entry.factId, outcome: 'restated' });
    if (entry.kind === 'new') {
      const factId = recordedIds.shift();
      if (factId !== undefined) outcomes.push({ factId, outcome: 'recorded' });
    }
    if (entry.kind === 'supersedes') {
      const factId = supersedingIds.get(entry);
      if (factId === undefined) continue;
      const { storedFactId, supersession } = entry.resolution;
      outcomes.push({
        factId,
        outcome: 'recorded',
        supersedes: { factId: storedFactId, kind: supersession.kind },
      });
    }
  }
  const facts = await readRememberedFacts(deps, { namespace: input.namespace, outcomes });
  if (!facts.ok) return facts;
  return ok({ facts: facts.value, skipped });
}
