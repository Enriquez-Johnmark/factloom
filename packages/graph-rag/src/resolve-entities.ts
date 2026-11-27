import {
  type EntityId,
  type Namespace,
  type NewEntity,
  normaliseEntityName,
  type OperationDeps,
  ok,
  type Result,
} from '@kronomind/core';

/** An entity named in new information, before it is known whether Factloom holds it. */
export type EntityMention = { readonly type: string; readonly name: string };

export type ResolvedEntities = {
  /** The entity of each mention, in the order of the mentions. */
  readonly entityIds: readonly EntityId[];
  /** The entities to create, each once, in the order they were first mentioned. */
  readonly newEntities: readonly NewEntity[];
};

type Candidate = { readonly id: EntityId; readonly type: string };

/**
 * Chooses among the entities that share a name. The only one is used whatever its type, so
 * that one thing extracted under two types does not become two entities. Among several, the
 * one of the mentioned type is used. Returns null when a new entity is needed.
 */
function chooseEntity(candidates: readonly Candidate[], type: string): EntityId | null {
  const [only] = candidates;
  if (candidates.length === 1 && only !== undefined) return only.id;
  return candidates.find((candidate) => candidate.type === type)?.id ?? null;
}

/**
 * Entity resolution by exact name: decides for each mention whether it is an entity the
 * namespace already holds, and plans a new entity when it is not. Two names are the same
 * when their normalised forms are equal. It reads and writes nothing else: the caller
 * creates the planned entities in its commit.
 */
export async function resolveEntities(
  deps: Pick<OperationDeps, 'store' | 'newId'>,
  input: { readonly namespace: Namespace; readonly mentions: readonly EntityMention[] },
): Promise<Result<ResolvedEntities>> {
  const entityIds: EntityId[] = [];
  const newEntities: NewEntity[] = [];
  // The entities planned in this call, by normalised name: they count as existing for later mentions.
  const planned = new Map<string, Candidate[]>();

  for (const mention of input.mentions) {
    const found = await deps.store.findEntities({
      namespace: input.namespace,
      name: mention.name,
      type: null,
    });
    if (!found.ok) return found;
    const nameKey = normaliseEntityName(mention.name);
    const plannedWithName = planned.get(nameKey) ?? [];
    const existing = chooseEntity([...found.value, ...plannedWithName], mention.type);
    if (existing !== null) {
      entityIds.push(existing);
      continue;
    }
    const entity: NewEntity = { id: deps.newId(), type: mention.type, name: mention.name };
    newEntities.push(entity);
    planned.set(nameKey, [...plannedWithName, entity]);
    entityIds.push(entity.id);
  }
  return ok({ entityIds, newEntities });
}
