import { err, ok, type Result } from '@factloom/core';

/** One ranked list of identifiers, best first, and how much say it has. */
export type RankedList = { readonly ids: readonly string[]; readonly weight: number };

export type FusedRank = { readonly id: string; readonly score: number };

/** The rank of each identifier in a list, from 1. A repeated identifier keeps its better rank. */
function ranksOf(ids: readonly string[]): Map<string, number> {
  const ranks = new Map<string, number>();
  ids.forEach((id, index) => {
    if (!ranks.has(id)) ranks.set(id, index + 1);
  });
  return ranks;
}

/**
 * Merges ranked lists into one by weighted reciprocal rank fusion. The score of an
 * identifier is the sum, over the lists that hold it, of `weight / (k + rank)`. Only ranks
 * are used, never a lane's own numbers, because a distance, a keyword rank and a count are
 * not comparable. Returns the identifiers with a score above zero, highest first. Equal
 * scores are ordered by the earliest list that holds either identifier, then by the better
 * rank in it, so the order is the same on every run.
 */
export function fuseRanks(input: {
  readonly lists: readonly RankedList[];
  readonly k: number;
}): Result<readonly FusedRank[]> {
  const { lists, k } = input;
  if (!(k > 0) || !Number.isFinite(k)) {
    return err('invalid_input', `The constant k must be a number above zero, and ${k} was given.`);
  }
  const negative = lists.find((list) => !(list.weight >= 0) || !Number.isFinite(list.weight));
  if (negative !== undefined) {
    return err(
      'invalid_input',
      `A weight must be a number of zero or more, and ${negative.weight} was given.`,
    );
  }

  // A list with weight zero has no say, in the scores or in the order of equal scores.
  const ranksPerList = lists
    .filter((list) => list.weight > 0)
    .map((list) => ({ ranks: ranksOf(list.ids), weight: list.weight }));
  const scores = new Map<string, number>();
  for (const { ranks, weight } of ranksPerList) {
    for (const [id, rank] of ranks) scores.set(id, (scores.get(id) ?? 0) + weight / (k + rank));
  }

  const compareByLists = (first: string, second: string): number => {
    for (const { ranks } of ranksPerList) {
      const firstRank = ranks.get(first) ?? Number.POSITIVE_INFINITY;
      const secondRank = ranks.get(second) ?? Number.POSITIVE_INFINITY;
      if (firstRank !== secondRank) return firstRank < secondRank ? -1 : 1;
    }
    return 0;
  };
  const fused = [...scores].map(([id, score]) => ({ id, score }));
  fused.sort((first, second) => second.score - first.score || compareByLists(first.id, second.id));
  return ok(fused);
}
