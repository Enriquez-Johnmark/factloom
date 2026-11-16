import { describe, expect, it } from 'vitest';
import { type FusedRank, fuseRanks, type RankedList } from './fuse-ranks.ts';

function fuse(lists: readonly RankedList[], k = 60): readonly FusedRank[] {
  const fused = fuseRanks({ lists, k });
  if (!fused.ok) throw new Error(fused.error.message);
  return fused.value;
}

function fuseIds(lists: readonly RankedList[], k = 60): string[] {
  return fuse(lists, k).map((rank) => rank.id);
}

describe('fuseRanks', () => {
  it('returns one list in its own order', () => {
    expect(fuseIds([{ ids: ['a', 'b', 'c'], weight: 1 }])).toEqual(['a', 'b', 'c']);
  });

  it('ranks a fact found by two lanes above a fact found by one at the same rank', () => {
    const vector = { ids: ['only-vector', 'both'], weight: 1 };
    const keyword = { ids: ['only-keyword', 'both'], weight: 1 };

    // "both" is second in each lane, and the others are first in one lane only.
    expect(fuseIds([vector, keyword])).toEqual(['both', 'only-vector', 'only-keyword']);
  });

  it('gives a lane with a higher weight more say', () => {
    const vector = { ids: ['from-vector'], weight: 1 };
    const keyword = { ids: ['from-keyword'], weight: 2 };

    expect(fuseIds([vector, keyword])).toEqual(['from-keyword', 'from-vector']);
  });

  it('ignores a lane with weight zero', () => {
    const vector = { ids: ['a', 'b'], weight: 1 };
    const ignored = { ids: ['b', 'a'], weight: 0 };

    expect(fuse([vector, ignored])).toEqual(fuse([vector]));
    // First in argument order, it still has no say in the order of equal scores.
    expect(
      fuseIds([
        { ids: ['y', 'x'], weight: 0 },
        { ids: ['x'], weight: 1 },
        { ids: ['y'], weight: 1 },
      ]),
    ).toEqual(['x', 'y']);
  });

  it('leaves out a fact found only by a lane with weight zero', () => {
    const vector = { ids: ['a'], weight: 1 };
    const ignored = { ids: ['only-ignored', 'a'], weight: 0 };

    expect(fuseIds([vector, ignored])).toEqual(['a']);
  });

  it('breaks a tie by the earlier lane and then the better rank', () => {
    // Each fact is first in one lane, so all three scores are equal.
    const first = { ids: ['in-first'], weight: 1 };
    const second = { ids: ['in-second'], weight: 1 };
    const third = { ids: ['in-third'], weight: 1 };
    expect(fuseIds([third, first, second])).toEqual(['in-third', 'in-first', 'in-second']);

    // "x" and "y" swap places in two lanes, so their scores are equal. The first lane decides.
    expect(
      fuseIds([
        { ids: ['x', 'y'], weight: 1 },
        { ids: ['y', 'x'], weight: 1 },
      ]),
    ).toEqual(['x', 'y']);
    expect(
      fuseIds([
        { ids: ['y', 'x'], weight: 1 },
        { ids: ['x', 'y'], weight: 1 },
      ]),
    ).toEqual(['y', 'x']);
  });

  it('counts a repeated fact once at its better rank', () => {
    const fused = fuse([{ ids: ['a', 'b', 'a'], weight: 1 }]);

    expect(fused.map((rank) => rank.id)).toEqual(['a', 'b']);
    expect(fused[0]?.score).toBeCloseTo(1 / 61, 12);
  });

  it('returns an empty list for no lanes', () => {
    expect(fuse([])).toEqual([]);
    expect(
      fuse([
        { ids: [], weight: 1 },
        { ids: [], weight: 2 },
      ]),
    ).toEqual([]);
  });

  it('returns invalid_input for a negative weight', () => {
    const fused = fuseRanks({ lists: [{ ids: ['a'], weight: -1 }], k: 60 });

    expect(!fused.ok && fused.error.code).toBe('invalid_input');
  });

  it('returns invalid_input for a constant that is not above zero', () => {
    for (const k of [0, -60, Number.NaN]) {
      const fused = fuseRanks({ lists: [{ ids: ['a'], weight: 1 }], k });
      expect(!fused.ok && fused.error.code, String(k)).toBe('invalid_input');
    }
  });

  it('gives each fact the sum of weight over k plus rank, for three lanes', () => {
    // k = 60. Weights: vector 1, keyword 0.5, graph 0.25.
    //   vector:  pg16 (rank 1), node22 (rank 2), redis (rank 3)
    //   keyword: redis (rank 1), pg16 (rank 2)
    //   graph:   node22 (rank 1), kafka (rank 2)
    // pg16   = 1/61 + 0.5/62            = 0.016393442... + 0.008064516... = 0.024457959
    // node22 = 1/62 + 0.25/61           = 0.016129032... + 0.004098360... = 0.020227393
    // redis  = 1/63 + 0.5/61            = 0.015873015... + 0.008196721... = 0.024069737
    // kafka  = 0.25/62                                                    = 0.004032258
    const fused = fuse([
      { ids: ['pg16', 'node22', 'redis'], weight: 1 },
      { ids: ['redis', 'pg16'], weight: 0.5 },
      { ids: ['node22', 'kafka'], weight: 0.25 },
    ]);

    expect(fused.map((rank) => rank.id)).toEqual(['pg16', 'redis', 'node22', 'kafka']);
    const scoreOf = Object.fromEntries(fused.map((rank) => [rank.id, rank.score]));
    expect(scoreOf.pg16).toBeCloseTo(0.024457959, 6);
    expect(scoreOf.redis).toBeCloseTo(0.024069737, 6);
    expect(scoreOf.node22).toBeCloseTo(0.020227393, 6);
    expect(scoreOf.kafka).toBeCloseTo(0.004032258, 6);
  });
});
