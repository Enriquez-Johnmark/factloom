import {
  type Domain,
  type EntityId,
  endFact,
  err,
  type FactDraft,
  type FactId,
  type FactObject,
  type FactWithSources,
  invalidateFact,
  type Namespace,
  type NewSource,
  type OperationDeps,
  ok,
  proposeChange,
  type Result,
  type Timestamp,
  type Trigger,
} from '@kronomind/core';
import { type CheckedField, checkForSecrets } from './check-for-secrets.ts';
import { type EntityMention, resolveEntities } from './resolve-entities.ts';
import type { StructuredFactInput } from './structured-fact-input.ts';

export type ChangeFactInput = {
  readonly namespace: Namespace;
  readonly factId: FactId;
  readonly because: 'was_wrong' | 'no_longer_true';
  /** With 'no_longer_true': when it stopped. Null means now. */
  readonly endedAt: Timestamp | null;
  /** The reporter's explanation. Stored as the content of a source. */
  readonly explanation: string;
  readonly replacement: StructuredFactInput | null;
  readonly trigger: Trigger;
};

/**
 * Says what is wrong with the input, or returns null when it can be applied. The entity types
 * are checked here, before resolution, because resolution may reuse an existing entity of
 * another type, which the fact operation could not then see. An unknown predicate and a
 * confidence outside 0 to 1 are refused by the fact operation itself, with the same code.
 */
function findInputProblem(domain: Domain, input: ChangeFactInput): string | null {
  if (input.explanation.trim() === '') return 'The explanation is empty. Say why the fact is changing.';
  if (input.because === 'was_wrong' && input.endedAt !== null) {
    return 'An end was given for a fact that was wrong. Give an end only when the fact is no longer true.';
  }
  const replacement = input.replacement;
  if (replacement === null) return null;
  const entityTypes = [
    replacement.subject.type,
    ...(replacement.object.kind === 'entity' ? [replacement.object.type] : []),
  ];
  const unknownType = entityTypes.find((type) => !domain.entityTypes.includes(type));
  if (unknownType !== undefined) {
    return `The entity type "${unknownType}" is not in the ${domain.name} domain. Use one of: ${domain.entityTypes.join(', ')}.`;
  }
  return null;
}

/** The text of the input that would be stored: the explanation and every name and value of the replacement. */
function listCheckedFields(input: ChangeFactInput): CheckedField[] {
  const fields: CheckedField[] = [{ name: 'explanation', value: input.explanation }];
  const replacement = input.replacement;
  if (replacement === null) return fields;
  fields.push(
    { name: 'replacement.statement', value: replacement.statement },
    { name: 'replacement.subject.name', value: replacement.subject.name },
    replacement.object.kind === 'entity'
      ? { name: 'replacement.object.name', value: replacement.object.name }
      : { name: 'replacement.object.value', value: replacement.object.value },
  );
  return fields;
}

/** Resolves the replacement's entities by name and builds the draft the fact operation records. */
async function draftReplacement(
  deps: Pick<OperationDeps, 'store' | 'newId'>,
  input: { readonly namespace: Namespace; readonly replacement: StructuredFactInput },
): Promise<Result<FactDraft>> {
  const { replacement } = input;
  const mentions: EntityMention[] = [replacement.subject];
  if (replacement.object.kind === 'entity') mentions.push(replacement.object);
  const resolved = await resolveEntities(deps, { namespace: input.namespace, mentions });
  if (!resolved.ok) return resolved;
  const [subjectEntityId, objectEntityId] = resolved.value.entityIds;
  if (subjectEntityId === undefined) return err('invalid_input', 'The replacement has no subject.');
  const object = objectOf(replacement, objectEntityId);
  if (object === null)
    return err('invalid_input', 'The replacement names an object entity that was not resolved.');
  return ok({
    fact: {
      subjectEntityId,
      predicate: replacement.predicate,
      object,
      statement: replacement.statement,
      confidence: replacement.confidence,
      validFrom: replacement.validFrom,
      validTo: replacement.validTo,
    },
    newEntities: resolved.value.newEntities,
  });
}

/** The stored object of a replacement: its resolved entity, or its literal value. */
function objectOf(replacement: StructuredFactInput, objectEntityId: EntityId | undefined): FactObject | null {
  if (replacement.object.kind === 'value') return { kind: 'value', value: replacement.object.value };
  return objectEntityId === undefined ? null : { kind: 'entity', entityId: objectEntityId };
}

/**
 * What a report did. Under the correction policy `automatic` the stored fact is changed at
 * once. Under `human_approval` it is untouched and a proposal waits for a person (FL-090).
 */
export type ChangeFactResult =
  | {
      readonly kind: 'changed';
      readonly invalidatedFactId: FactId;
      readonly replacement: FactWithSources | null;
    }
  | { readonly kind: 'proposed'; readonly storedFactId: FactId; readonly proposalId: string };

/**
 * Stores the report as a proposal and changes no fact. A proposal holds the fact that takes
 * the stored one's place, so a report with no replacement is refused until a proposal can
 * hold a retraction or an end with nothing after it (FL-095).
 */
async function proposeReportedChange(
  deps: OperationDeps,
  input: ChangeFactInput & { readonly source: NewSource; readonly draft: FactDraft | null },
): Promise<Result<ChangeFactResult>> {
  const { namespace, factId, trigger, source, draft } = input;
  if (draft === null) {
    return err(
      'invalid_input',
      `The ${deps.domain.name} domain holds every change for a person's approval, and a change with nothing to take the fact's place cannot be held yet. Give the replacement.`,
    );
  }
  const proposed = await proposeChange(deps, {
    namespace,
    trigger,
    reasonCode: input.because === 'was_wrong' ? 'reported_wrong' : 'reported_ended',
    storedFactId: factId,
    supersession:
      input.because === 'was_wrong'
        ? { kind: 'correction' }
        : { kind: 'succession', changedAt: input.endedAt ?? deps.now() },
    newFact: draft,
    source,
  });
  if (!proposed.ok) return proposed;
  return ok({ kind: 'proposed', storedFactId: factId, proposalId: proposed.value.proposalId });
}

/** Calls the one fact operation the report needs, and returns the identifier of the replacement, if any. */
async function applyChange(
  deps: OperationDeps,
  input: ChangeFactInput & { readonly source: NewSource; readonly draft: FactDraft | null },
): Promise<Result<FactId | null>> {
  const { namespace, factId, trigger, source, draft } = input;
  if (input.because === 'was_wrong') {
    const invalidated = await invalidateFact(deps, {
      namespace,
      trigger,
      reasonCode: 'reported_wrong',
      factId,
      source,
      replacement: draft,
    });
    return invalidated.ok ? ok(invalidated.value.replacementFactId) : invalidated;
  }
  const ended = await endFact(deps, {
    namespace,
    trigger,
    reasonCode: 'reported_ended',
    factId,
    validTo: input.endedAt ?? deps.now(),
    source,
    successor: draft,
  });
  return ended.ok ? ok(ended.value.successorFactId) : ended;
}

/**
 * Applies a report that a fact was wrong or is no longer true, in one commit. A wrong fact is
 * corrected when a replacement is given and retracted when not. A fact that is no longer true
 * ends at `endedAt`, or now, and a replacement succeeds it from then. The explanation is kept
 * as the content of a source, never in the audit log. Refuses text that contains a secret.
 * Under the correction policy `human_approval` nothing changes: the report is stored as a
 * proposal for a person to approve.
 */
export async function changeFact(
  deps: OperationDeps,
  input: ChangeFactInput,
): Promise<Result<ChangeFactResult>> {
  const problem = findInputProblem(deps.domain, input);
  if (problem !== null) return err('invalid_input', problem);
  const secrets = checkForSecrets(listCheckedFields(input));
  if (!secrets.ok) return secrets;

  let draft: FactDraft | null = null;
  if (input.replacement !== null) {
    const drafted = await draftReplacement(deps, {
      namespace: input.namespace,
      replacement: input.replacement,
    });
    if (!drafted.ok) return drafted;
    draft = drafted.value;
  }
  const source: NewSource = {
    kind: 'agent_note',
    locator: null,
    version: null,
    content: input.explanation,
    observedAt: deps.now(),
  };

  if (deps.domain.correctionPolicy === 'human_approval') {
    return proposeReportedChange(deps, { ...input, source, draft });
  }
  const applied = await applyChange(deps, { ...input, source, draft });
  if (!applied.ok) return applied;
  if (applied.value === null)
    return ok({ kind: 'changed', invalidatedFactId: input.factId, replacement: null });
  const replacement = await deps.store.getFact({ namespace: input.namespace, factId: applied.value });
  if (!replacement.ok) return replacement;
  return ok({ kind: 'changed', invalidatedFactId: input.factId, replacement: replacement.value });
}
