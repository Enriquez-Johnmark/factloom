import {
  type Entity,
  type EntityMerge,
  mergeEntities,
  type Namespace,
  type OperationDeps,
  ok,
  type Result,
} from '@factloom/core';
import { normaliseNameStrictly } from './normalise-name-strictly.ts';
import type { JobCounts } from './run-maintenance.ts';

/** Entities read per page. */
const ENTITY_PAGE_SIZE = 500;

/** Two entities of one namespace and one type, the one created earlier first. */
export type EntityPair = { readonly earlier: Entity; readonly later: Entity };

/**
 * One stage of duplicate detection. It decides that a pair is the same entity, or returns
 * null to pass the pair to the next stage. FL-064 adds stages after the name stage.
 */
export type DuplicateStage = {
  readonly name: string;
  readonly decide: (pair: EntityPair) => Promise<Result<'same' | null>>;
};

/** Stage 1: the names are equal in their strict form. */
export const NAME_STAGE: DuplicateStage = {
  name: 'name',
  decide: async ({ earlier, later }) =>
    ok(normaliseNameStrictly(earlier.name) === normaliseNameStrictly(later.name) ? 'same' : null),
};

export type FindDuplicateEntitiesDeps = Pick<OperationDeps, 'store' | 'domain' | 'now' | 'newId'> & {
  readonly stages: readonly DuplicateStage[];
};

async function readAllEntities(
  deps: FindDuplicateEntitiesDeps,
  namespace: Namespace,
): Promise<Result<Entity[]>> {
  const entities: Entity[] = [];
  let after: string | null = null;
  for (;;) {
    const page = await deps.store.listEntities({ namespace, afterEntityId: after, limit: ENTITY_PAGE_SIZE });
    if (!page.ok) return page;
    entities.push(...page.value);
    const last = page.value.at(-1);
    if (last === undefined || page.value.length < ENTITY_PAGE_SIZE) return ok(entities);
    after = last.id;
  }
}

const pairKey = (first: string, second: string): string => JSON.stringify([first, second].sort());

/** Earlier first: by creation time, then by identifier, so that the order never varies. */
function byCreation(a: Entity, b: Entity): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The pairs to compare: entities of the same type that are not merged into another, and whose
 * pair was never merged and undone. An entity merged into another is read as that one.
 */
function listCandidatePairs(entities: readonly Entity[], merges: readonly EntityMerge[]): EntityPair[] {
  const mergedFrom = new Set(
    merges.filter((merge) => merge.undoneAt === null).map((merge) => merge.fromEntityId),
  );
  const undone = new Set(
    merges
      .filter((merge) => merge.undoneAt !== null)
      .map((merge) => pairKey(merge.fromEntityId, merge.intoEntityId)),
  );
  const roots = entities.filter((entity) => !mergedFrom.has(entity.id)).sort(byCreation);
  const pairs: EntityPair[] = [];
  for (const [index, earlier] of roots.entries()) {
    for (const later of roots.slice(index + 1)) {
      if (later.type !== earlier.type || undone.has(pairKey(earlier.id, later.id))) continue;
      pairs.push({ earlier, later });
    }
  }
  return pairs;
}

/** The first decision of the stages, in order, or null when none decides. */
async function decide(stages: readonly DuplicateStage[], pair: EntityPair): Promise<Result<'same' | null>> {
  for (const stage of stages) {
    const decided = await stage.decide(pair);
    if (!decided.ok || decided.value !== null) return decided;
  }
  return ok(null);
}

/**
 * The duplicate entity job: compares the entities of a namespace pair by pair, within one type,
 * through the stages in order. A pair found to be the same is merged into the entity created
 * earlier under the domain's policy `automatic`, and reported for a person under
 * `human_approval`. A merge refused with `conflict` is flagged with the facts in the way. A
 * pair whose merge was undone is never merged again. Needs no embedder and no LLM.
 */
export async function findDuplicateEntities(
  deps: FindDuplicateEntitiesDeps,
  input: { readonly namespace: Namespace },
): Promise<Result<JobCounts>> {
  const { namespace } = input;
  const entities = await readAllEntities(deps, namespace);
  if (!entities.ok) return entities;
  const merges = await deps.store.listEntityMerges({ namespace });
  if (!merges.ok) return merges;

  let examined = 0;
  let changed = 0;
  let failed = 0;
  const flaggedItems: { id: string; reason: string }[] = [];
  // An entity merged in this run is read as the one it was merged into from then on.
  const mergedNow = new Set<string>();
  for (const pair of listCandidatePairs(entities.value, merges.value)) {
    if (mergedNow.has(pair.earlier.id) || mergedNow.has(pair.later.id)) continue;
    examined += 1;
    const decided = await decide(deps.stages, pair);
    if (!decided.ok) return decided;
    if (decided.value === null) continue;
    const id = `${pair.later.id}->${pair.earlier.id}`;
    if (deps.domain.correctionPolicy === 'human_approval') {
      flaggedItems.push({ id, reason: 'same_entity' });
      continue;
    }
    const merged = await mergeEntities(deps, {
      namespace,
      trigger: 'maintenance',
      reasonCode: 'same_entity',
      fromEntityId: pair.later.id,
      intoEntityId: pair.earlier.id,
    });
    if (merged.ok) {
      changed += 1;
      mergedNow.add(pair.later.id);
    } else if (merged.error.code === 'conflict') {
      flaggedItems.push({ id, reason: `merge_conflict: ${merged.error.relatedFactIds.join(', ')}` });
    } else {
      failed += 1;
    }
  }
  return ok({ examined, changed, flagged: flaggedItems.length, failed, undecided: 0, flaggedItems });
}
