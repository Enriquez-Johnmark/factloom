// The metrics of the embedding spike (spikes/embedding-retrieval/README.md, "Metrics"), as pure
// functions of one ranking of statement identifiers and the identifiers labelled as answers.

/**
 * The right statements among the first k, divided by min(k, the number of right statements).
 * For a question with one right statement it is 1 when that statement is in the first k, else 0.
 */
export function recallAt(k: number, ranking: readonly string[], relevant: readonly string[]): number {
  const found = ranking.slice(0, k).filter((id) => relevant.includes(id)).length;
  return found / Math.min(k, relevant.length);
}

/** The reciprocal of the rank of the first right statement, from 1, or 0 when none is in the first ten. */
export function reciprocalRankAt10(ranking: readonly string[], relevant: readonly string[]): number {
  const index = ranking.slice(0, 10).findIndex((id) => relevant.includes(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

export type RetrievalScores = {
  readonly recallAt1: number;
  readonly recallAt5: number;
  readonly mrrAt10: number;
};

/** The three metrics for one question. */
export function scoreQuestion(ranking: readonly string[], relevant: readonly string[]): RetrievalScores {
  return {
    recallAt1: recallAt(1, ranking, relevant),
    recallAt5: recallAt(5, ranking, relevant),
    mrrAt10: reciprocalRankAt10(ranking, relevant),
  };
}

/** The mean of each metric over a set of questions. */
export function averageScores(scores: readonly RetrievalScores[]): RetrievalScores {
  const mean = (pick: (score: RetrievalScores) => number): number =>
    scores.length === 0 ? 0 : scores.reduce((sum, score) => sum + pick(score), 0) / scores.length;
  return {
    recallAt1: mean((score) => score.recallAt1),
    recallAt5: mean((score) => score.recallAt5),
    mrrAt10: mean((score) => score.mrrAt10),
  };
}
