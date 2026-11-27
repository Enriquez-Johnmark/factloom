import {
  type Entity,
  type EntityMerge,
  mergeEntities,
  type Namespace,
  type OperationDeps,
  ok,
  type Result,
} from '@kronomind/core';
import { normaliseNameStrictly } from './normalise-name-strictly.ts';
import type { JobCounts } from './run-maintenance.ts';

/** Entities read per page. */
const ENTITY_PAGE_SIZE = 500;

/** Two entities of one namespace, the one created earlier first. */
export type EntityPair = { readonly earlier: Entity; readonly later: Entity };

/**
 * What a stage found for a pair: `same`, to merge or report; `candidate`, a likely pair the
 * stage could not decide, to report; `failed`, a check that could not be made; `deferred`, a
 * pair left for the next run; or null, to pass the pair to the next stage.
 */
export type StageDecision = 'same' | 'candidate' | 'failed' | 'deferred' | null;

/**
 * One stage of duplicate detection. A stage marked `crossType` is also offered pairs of two
 * types whose names are equal in their strict form; the others see pairs of one type only.
 */
export type DuplicateStage = {
  readonly name: string;
  readonly crossType: boolean;
  readonly decide: (pair: EntityPair) => Promise<Result<StageDecision>>;
};

/** Stage 1: the names are equal in their strict form. Pairs of one type only. */
export const NAME_STAGE: DuplicateStage = {
  name: 'name',
  crossType: false,
  decide: async ({ earlier, later }) =>
    ok(normaliseNameStrictly(earlier.name) === normaliseNameStrictly(later.name) ? 'same' : null),
};

export type FindDuplicateEntitiesDeps = Pick<OperationDeps, 'store' | 'domain' | 'now' | 'newId'> & {
  readonly stages: readonly DuplicateStage[];
  /**
   * Entity types whose names are exact identifiers, such as the symbols of code (FL-084): two
   * of them with different names are never the same, so they are not compared. None by default.
   */
  readonly exactEntityTypes?: readonly string[];
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
 * The pairs to compare: entities not merged into another, whose pair was never merged and
 * undone, of the same type, or of two types with names equal in their strict form when a stage
 * takes such pairs. An entity merged into another is read as that one.
 */
function listCandidatePairs(
  entities: readonly Entity[],
  merges: readonly EntityMerge[],
  withCrossType: boolean,
): EntityPair[] {
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
      if (undone.has(pairKey(earlier.id, later.id))) continue;
      const isSameType = later.type === earlier.type;
      const isCrossTypeNameMatch =
        withCrossType && normaliseNameStrictly(earlier.name) === normaliseNameStrictly(later.name);
      if (isSameType || isCrossTypeNameMatch) pairs.push({ earlier, later });
    }
  }
  return pairs;
}

/** The first decision of the stages that take the pair, in order, or null when none decides. */
async function decide(stages: readonly DuplicateStage[], pair: EntityPair): Promise<Result<StageDecision>> {
  const isCrossType = pair.earlier.type !== pair.later.type;
  for (const stage of stages) {
    if (isCrossType && !stage.crossType) continue;
    const decided = await stage.decide(pair);
    if (!decided.ok || decided.value !== null) return decided;
  }
  return ok(null);
}

/**
 * The duplicate entity job: compares the entities of a namespace pair by pair, within one type
 * or across types for a stage that takes such pairs, through the stages in order. A likely pair a
 * stage cannot decide is reported, not merged. A pair found to be the same is merged into the entity created
 * earlier under the domain's policy `automatic`, and reported for a person under
 * `human_approval`. A merge refused with `conflict` is flagged with the facts in the way. A
 * pair whose merge was undone is never merged again. The name stage needs no embedder and no
 * LLM; the similarity stage of FL-064 brings its own.
 */
export async function findDuplicateEntities(
  deps: FindDuplicateEntitiesDeps,
  input: { readonly namespace: Namespace },
): Promise<Result<JobCounts>> {
  const { namespace } = input;
  const read = await readAllEntities(deps, namespace);
  if (!read.ok) return read;
  const exactTypes = deps.exactEntityTypes ?? [];
  const entities = ok(read.value.filter((entity) => !exactTypes.includes(entity.type)));
  const merges = await deps.store.listEntityMerges({ namespace });
  if (!merges.ok) return merges;

  let examined = 0;
  let changed = 0;
  let failed = 0;
  let undecided = 0;
  const flaggedItems: { id: string; reason: string }[] = [];
  // An entity merged in this run is read as the one it was merged into from then on.
  const mergedNow = new Set<string>();
  const withCrossType = deps.stages.some((stage) => stage.crossType);
  for (const pair of listCandidatePairs(entities.value, merges.value, withCrossType)) {
    if (mergedNow.has(pair.earlier.id) || mergedNow.has(pair.later.id)) continue;
    examined += 1;
    const decided = await decide(deps.stages, pair);
    if (!decided.ok) return decided;
    if (decided.value === null) continue;
    const id = `${pair.later.id}->${pair.earlier.id}`;
    if (decided.value === 'failed') {
      failed += 1;
      continue;
    }
    if (decided.value === 'deferred') {
      undecided += 1;
      continue;
    }
    if (decided.value === 'candidate') {
      flaggedItems.push({ id, reason: 'similar_name' });
      continue;
    }
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
  return ok({ examined, changed, flagged: flaggedItems.length, failed, undecided, flaggedItems });
}
