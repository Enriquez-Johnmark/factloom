import {
  type Domain,
  err,
  type FactDraft,
  type FactId,
  type Namespace,
  normaliseEntityName,
  type OperationDeps,
  ok,
  periodsOverlap,
  type Result,
  recordFacts,
  type Trigger,
} from '@kronomind/core';
import { type CheckedField, checkForSecrets } from './check-for-secrets.ts';
import { conflictsWithEachOther } from './compare-with-candidates.ts';
import { compareWithMemory } from './compare-with-memory.ts';
import { planFacts } from './plan-facts.ts';
import { type RememberedFact, readRememberedFacts } from './read-remembered-facts.ts';
import type { SourceInput } from './source-input.ts';
import type { StructuredFactInput } from './structured-fact-input.ts';

export type RecordStructuredFactsInput = {
  readonly namespace: Namespace;
  readonly facts: readonly StructuredFactInput[];
  readonly source: SourceInput;
  /** The text of the source, kept so that its facts can be traced and purged, such as a FHIR resource (FL-092). */
  readonly content?: string;
  readonly trigger: Trigger;
};

/** The object of a fact as given, so that two given facts can be compared before resolution. */
function objectKey(fact: StructuredFactInput): string {
  return fact.object.kind === 'value'
    ? `value:${fact.object.value}`
    : `entity:${normaliseEntityName(fact.object.name)}`;
}

/** Whether two given facts are the same: same subject name, predicate and object, overlapping in time. */
function isSameGivenFact(first: StructuredFactInput, second: StructuredFactInput): boolean {
  return (
    normaliseEntityName(first.subject.name) === normaliseEntityName(second.subject.name) &&
    first.predicate === second.predicate &&
    objectKey(first) === objectKey(second) &&
    periodsOverlap(first, second)
  );
}

/** Says what is wrong with one fact, or returns null. */
function findFactProblem(domain: Domain, fact: StructuredFactInput, position: string): string | null {
  const types = [fact.subject.type, ...(fact.object.kind === 'entity' ? [fact.object.type] : [])];
  const unknownType = types.find((type) => !domain.entityTypes.includes(type));
  if (unknownType !== undefined) {
    return `${position}: the entity type "${unknownType}" is not in the ${domain.name} domain. Use one of: ${domain.entityTypes.join(', ')}.`;
  }
  if (!domain.predicates.some((predicate) => predicate.name === fact.predicate)) {
    const names = domain.predicates.map((predicate) => predicate.name).join(', ');
    return `${position}: the predicate "${fact.predicate}" is not in the ${domain.name} domain. Use one of: ${names}.`;
  }
  if (!(fact.confidence >= 0 && fact.confidence <= 1)) {
    return `${position}: the confidence must be from 0 to 1, and ${fact.confidence} was given.`;
  }
  if (fact.validFrom !== null && fact.validTo !== null && fact.validTo <= fact.validFrom) {
    return `${position}: the valid period must end after it starts: ${fact.validFrom} to ${fact.validTo} was given.`;
  }
  return null;
}

/**
 * Says what is wrong with the input, or returns null. Entity types are checked here, before
 * resolution, because resolution may reuse an existing entity of another type.
 */
function findInputProblem(domain: Domain, facts: readonly StructuredFactInput[]): string | null {
  if (facts.length === 0) return 'There are no facts. Give at least one.';
  for (const [index, fact] of facts.entries()) {
    const problem = findFactProblem(domain, fact, `Fact ${index + 1}`);
    if (problem !== null) return problem;
    const repeated = facts.findIndex(
      (other, otherIndex) => otherIndex < index && isSameGivenFact(other, fact),
    );
    if (repeated !== -1) return `Fact ${index + 1} is the same as fact ${repeated + 1}. Give each fact once.`;
  }
  return null;
}

/** The text of the input that would be stored: every statement, name and value, and the source. */
function listCheckedFields(input: RecordStructuredFactsInput): CheckedField[] {
  const fields: CheckedField[] = [];
  for (const [index, fact] of input.facts.entries()) {
    const at = `facts[${index}]`;
    fields.push(
      { name: `${at}.statement`, value: fact.statement },
      { name: `${at}.subject.name`, value: fact.subject.name },
      fact.object.kind === 'entity'
        ? { name: `${at}.object.name`, value: fact.object.name }
        : { name: `${at}.object.value`, value: fact.object.value },
    );
  }
  if (input.source.locator !== null) fields.push({ name: 'source.locator', value: input.source.locator });
  if (input.source.version !== null) fields.push({ name: 'source.version', value: input.source.version });
  if (input.content !== undefined) fields.push({ name: 'content', value: input.content });
  return fields;
}

/**
 * Records facts that a caller already gives by subject, predicate and object, in one commit,
 * with no LLM call. A fact already live gains the source and is not recorded again. A fact
 * that would break the single-value rule, with a stored fact or with another given fact,
 * fails the whole call with `conflict`, and nothing is written. Refuses text that contains a
 * secret.
 */
export async function recordStructuredFacts(
  deps: OperationDeps,
  input: RecordStructuredFactsInput,
): Promise<Result<{ readonly facts: readonly RememberedFact[] }>> {
  const problem = findInputProblem(deps.domain, input.facts);
  if (problem !== null) return err('invalid_input', problem);
  if (input.source.kind.trim() === '') return err('invalid_input', 'The source kind is empty.');
  const secrets = checkForSecrets(listCheckedFields(input));
  if (!secrets.ok) return secrets;

  const planned = await planFacts(deps, { namespace: input.namespace, facts: input.facts });
  if (!planned.ok) return planned;
  for (const [index, fact] of planned.value.entries()) {
    if (
      planned.value.some((other, otherIndex) => otherIndex !== index && conflictsWithEachOther(fact, other))
    ) {
      return err('conflict', `Fact ${index + 1} conflicts with another fact in this call. Give one value.`);
    }
  }

  const outcomes: { readonly factId: FactId | null; readonly outcome: RememberedFact['outcome'] }[] = [];
  const drafts: FactDraft[] = [];
  for (const [index, fact] of planned.value.entries()) {
    const comparison = await compareWithMemory(deps, { namespace: input.namespace, planned: fact });
    if (!comparison.ok) return comparison;
    if (comparison.value.kind === 'conflicts') {
      return err(
        'conflict',
        `Fact ${index + 1} conflicts with a stored fact: the predicate "${fact.draft.fact.predicate}" holds one value at a time.`,
        { relatedFactIds: comparison.value.conflictingFactIds },
      );
    }
    if (comparison.value.kind === 'restates') {
      outcomes.push({ factId: comparison.value.factId, outcome: 'restated' });
    } else {
      outcomes.push({ factId: null, outcome: 'recorded' });
      drafts.push(fact.draft);
    }
  }
  const restatedFactIds = [
    ...new Set(outcomes.flatMap((entry) => (entry.factId === null ? [] : [entry.factId]))),
  ];

  const recorded = await recordFacts(deps, {
    namespace: input.namespace,
    trigger: input.trigger,
    reasonCode: drafts.length > 0 ? 'stated' : 'restated',
    source: { ...input.source, content: input.content ?? null, observedAt: deps.now() },
    drafts,
    restatedFactIds,
  });
  if (!recorded.ok) return recorded;

  const recordedIds = [...recorded.value.factIds];
  const resolvedOutcomes = outcomes.flatMap(({ factId, outcome }) => {
    const id = factId ?? recordedIds.shift();
    return id === undefined ? [] : [{ factId: id, outcome }];
  });
  const facts = await readRememberedFacts(deps, { namespace: input.namespace, outcomes: resolvedOutcomes });
  if (!facts.ok) return facts;
  return ok({ facts: facts.value });
}
