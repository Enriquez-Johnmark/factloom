import {
  err,
  type FactDraft,
  type FactId,
  type FactObject,
  type FactWithSources,
  findConflictCandidates,
  type LlmClient,
  type Namespace,
  type NewEntity,
  type OperationDeps,
  ok,
  periodsOverlap,
  type Result,
  recordFacts,
  type Trigger,
} from '@factloom/core';
import { type CheckedField, checkForSecrets } from './check-for-secrets.ts';
import { compareWithCandidates, isSameObject } from './compare-with-candidates.ts';
import { extractFacts } from './extract-facts.ts';
import { type EntityMention, resolveEntities } from './resolve-entities.ts';
import type { SourceInput } from './source-input.ts';
import type { StructuredFactInput } from './structured-fact-input.ts';

export type RememberDeps = OperationDeps & { readonly llm: LlmClient };

export type RememberInput = {
  readonly namespace: Namespace;
  readonly text: string;
  readonly source: SourceInput;
  readonly trigger: Trigger;
};

export type RememberedFact = FactWithSources & {
  /** 'restated' when the fact was already live and only gained a source. */
  readonly outcome: 'recorded' | 'restated';
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

/**
 * How many live facts with one subject and predicate are compared with a new fact. A
 * single-valued predicate has at most one live fact per valid period, so a few cover the
 * overlapping ones; a multi-valued predicate needs enough to find an equal object.
 */
const CONFLICT_CANDIDATE_LIMIT = 50;

/** An extracted fact with its entities resolved, ready to be compared and recorded. */
type PlannedFact = {
  readonly draft: FactDraft;
  readonly singleValued: boolean;
  /** True when the subject is an entity this call creates, so no stored fact can be about it. */
  readonly hasNewSubject: boolean;
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

/** Resolves the entities of every fact, in order, and builds a draft for each. */
async function planFacts(
  deps: RememberDeps,
  namespace: Namespace,
  facts: readonly StructuredFactInput[],
): Promise<Result<PlannedFact[]>> {
  const mentions: EntityMention[] = facts.flatMap((fact) =>
    fact.object.kind === 'entity' ? [fact.subject, fact.object] : [fact.subject],
  );
  const resolved = await resolveEntities(deps, { namespace, mentions });
  if (!resolved.ok) return resolved;
  const newEntities = new Map(resolved.value.newEntities.map((entity) => [entity.id, entity]));
  const entityIds = [...resolved.value.entityIds];
  const planned: PlannedFact[] = [];
  for (const fact of facts) {
    const subjectEntityId = entityIds.shift();
    const objectEntityId = fact.object.kind === 'entity' ? entityIds.shift() : undefined;
    if (subjectEntityId === undefined || (fact.object.kind === 'entity' && objectEntityId === undefined)) {
      return err('invalid_input', 'An extracted fact names an entity that was not resolved.');
    }
    const object: FactObject =
      fact.object.kind === 'value'
        ? { kind: 'value', value: fact.object.value }
        : { kind: 'entity', entityId: objectEntityId ?? '' };
    const usedNew = [subjectEntityId, objectEntityId]
      .map((id) => (id === undefined ? undefined : newEntities.get(id)))
      .filter((entity): entity is NewEntity => entity !== undefined);
    const predicate = deps.domain.predicates.find((definition) => definition.name === fact.predicate);
    planned.push({
      draft: {
        fact: {
          subjectEntityId,
          predicate: fact.predicate,
          object,
          statement: fact.statement,
          confidence: fact.confidence,
          validFrom: fact.validFrom,
          validTo: fact.validTo,
        },
        newEntities: usedNew,
      },
      singleValued: predicate?.cardinality === 'single',
      hasNewSubject: newEntities.has(subjectEntityId),
    });
  }
  return ok(planned);
}

/** Whether two drafts state the same thing: same subject, predicate and object, overlapping in time. */
function isSameFact(first: FactDraft, second: FactDraft): boolean {
  return (
    first.fact.subjectEntityId === second.fact.subjectEntityId &&
    first.fact.predicate === second.fact.predicate &&
    isSameObject(first.fact.object, second.fact.object) &&
    periodsOverlap(first.fact, second.fact)
  );
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
  if (planned.hasNewSubject) return ok({ kind: 'new', planned });
  const { fact } = planned.draft;
  const candidates = await findConflictCandidates(deps, {
    namespace,
    subjectEntityId: fact.subjectEntityId,
    predicate: fact.predicate,
    validFrom: fact.validFrom,
    validTo: fact.validTo,
    limit: CONFLICT_CANDIDATE_LIMIT,
  });
  if (!candidates.ok) return candidates;
  const comparison = compareWithCandidates({ ...fact, singleValued: planned.singleValued }, candidates.value);
  switch (comparison.kind) {
    case 'new':
      return ok({ kind: 'new', planned });
    case 'restates':
      return ok({ kind: 'restates', planned, factId: comparison.factId });
    case 'conflicts':
      return ok({
        kind: 'skipped',
        planned,
        skipped: {
          statement: fact.statement,
          reason: 'conflicts_with_stored_fact',
          conflictingFactIds: comparison.conflictingFactIds,
        },
      });
    default: {
      const unhandled: never = comparison;
      throw new Error(`Unhandled comparison: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Whether two new facts from one text break the single-value rule together. */
function conflictWithinText(first: PlannedFact, second: PlannedFact): boolean {
  const a = first.draft.fact;
  const b = second.draft.fact;
  return (
    first.singleValued &&
    a.subjectEntityId === b.subjectEntityId &&
    a.predicate === b.predicate &&
    !isSameObject(a.object, b.object) &&
    periodsOverlap(a, b)
  );
}

/** Skips every pair of new facts that conflict with each other. */
function skipConflictsWithinText(sorted: readonly Sorted[]): Sorted[] {
  const newFacts = sorted.filter((entry) => entry.kind === 'new');
  return sorted.map((entry) => {
    if (entry.kind !== 'new') return entry;
    const conflicts = newFacts.some(
      (other) => other !== entry && conflictWithinText(entry.planned, other.planned),
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

/** Reads each recorded or restated fact after the commit, once, in extraction order. */
async function readRemembered(
  deps: RememberDeps,
  namespace: Namespace,
  outcomes: readonly { readonly factId: FactId; readonly outcome: RememberedFact['outcome'] }[],
): Promise<Result<RememberedFact[]>> {
  const remembered: RememberedFact[] = [];
  for (const { factId, outcome } of outcomes) {
    if (remembered.some((fact) => fact.fact.id === factId)) continue;
    const read = await deps.store.getFact({ namespace, factId });
    if (!read.ok) return read;
    if (read.value === null)
      return err('storage_failed', `The fact ${factId} was not found after the commit.`);
    remembered.push({ ...read.value, outcome });
  }
  return ok(remembered);
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

  const planned = await planFacts(deps, input.namespace, extracted.value);
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
  const facts = await readRemembered(deps, input.namespace, outcomes);
  if (!facts.ok) return facts;
  return ok({ facts: facts.value, skipped });
}
