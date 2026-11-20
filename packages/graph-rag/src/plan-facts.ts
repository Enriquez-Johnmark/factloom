import {
  err,
  type FactDraft,
  type FactObject,
  type Namespace,
  type NewEntity,
  type OperationDeps,
  ok,
  type Result,
} from '@factloom/core';
import { type EntityMention, resolveEntities } from './resolve-entities.ts';
import type { StructuredFactInput } from './structured-fact-input.ts';

/** A fact given by name, with its entities resolved, ready to be compared and recorded. */
export type PlannedFact = {
  /** Carries only the new entities this fact uses, so that a fact left out creates none. */
  readonly draft: FactDraft;
  readonly singleValued: boolean;
  /** True when the subject is an entity this call creates, so no stored fact can be about it. */
  readonly hasNewSubject: boolean;
  /** The object entity's name as given, for the conflict judge's prompt. Null for a value. */
  readonly objectEntityName: string | null;
};

/**
 * Resolves the entities of every fact, in order, and builds a draft for each. An entity met
 * twice is planned once and given to each draft that uses it.
 */
export async function planFacts(
  deps: Pick<OperationDeps, 'store' | 'newId' | 'domain'>,
  input: { readonly namespace: Namespace; readonly facts: readonly StructuredFactInput[] },
): Promise<Result<PlannedFact[]>> {
  const mentions: EntityMention[] = input.facts.flatMap((fact) =>
    fact.object.kind === 'entity' ? [fact.subject, fact.object] : [fact.subject],
  );
  const resolved = await resolveEntities(deps, { namespace: input.namespace, mentions });
  if (!resolved.ok) return resolved;
  const newEntities = new Map(resolved.value.newEntities.map((entity) => [entity.id, entity]));
  const entityIds = [...resolved.value.entityIds];
  const planned: PlannedFact[] = [];
  for (const fact of input.facts) {
    const subjectEntityId = entityIds.shift();
    const objectEntityId = fact.object.kind === 'entity' ? entityIds.shift() : undefined;
    if (subjectEntityId === undefined || (fact.object.kind === 'entity' && objectEntityId === undefined)) {
      return err('invalid_input', 'A fact names an entity that was not resolved.');
    }
    const object: FactObject =
      fact.object.kind === 'value'
        ? { kind: 'value', value: fact.object.value }
        : { kind: 'entity', entityId: objectEntityId ?? '' };
    const usedNewEntities = [subjectEntityId, objectEntityId]
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
        newEntities: usedNewEntities,
      },
      singleValued: predicate?.cardinality === 'single',
      hasNewSubject: newEntities.has(subjectEntityId),
      objectEntityName: fact.object.kind === 'entity' ? fact.object.name : null,
    });
  }
  return ok(planned);
}
