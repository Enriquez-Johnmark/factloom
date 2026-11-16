import { describe, expect, it } from 'vitest';
import { averageScores, recallAt, reciprocalRankAt10, scoreQuestion } from './retrieval-metrics.ts';

const TEN_WRONG = ['s11', 's12', 's13', 's14', 's15', 's16', 's17', 's18', 's19', 's20'];

describe('the retrieval metrics', () => {
  it('counts a question as answered at rank 1 only when its fact is first', () => {
    expect(recallAt(1, ['s01', 's02'], ['s01'])).toBe(1);
    expect(recallAt(1, ['s02', 's01'], ['s01'])).toBe(0);
  });

  it('gives the reciprocal of the rank of the first right fact', () => {
    // The first right fact, s07, is third: 1 / 3.
    expect(reciprocalRankAt10(['s05', 's06', 's07', 's08'], ['s08', 's07'])).toBeCloseTo(1 / 3, 10);
  });

  it('gives 0 when no right fact is in the first ten', () => {
    expect(reciprocalRankAt10([...TEN_WRONG, 's01'], ['s01'])).toBe(0);
  });

  it('divides by the number of right facts when there are fewer than k', () => {
    // Two right facts, one of them in the first five: 1 / min(5, 2) = 0.5.
    expect(recallAt(5, ['s01', 's11', 's12', 's13', 's14', 's02'], ['s01', 's02'])).toBe(0.5);
  });

  it('averages each metric over the questions', () => {
    const answeredFirst = scoreQuestion(['s01'], ['s01']);
    const answeredSecond = scoreQuestion(['s02', 's01'], ['s01']);

    expect(averageScores([answeredFirst, answeredSecond])).toEqual({
      recallAt1: 0.5,
      recallAt5: 1,
      mrrAt10: 0.75,
    });
  });
});
