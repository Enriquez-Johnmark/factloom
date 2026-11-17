import { createInMemoryStore } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { describeMemoryStoreContract } from './memory-store-contract.ts';

const registered = describeMemoryStoreContract('the in-memory store', async () => createInMemoryStore());

describe('the contract suite', () => {
  it('registers every case of every group for a store that runs them all', () => {
    // T1 to T8, R1 to R14, C1 to C10, F1 to F10 with F5 in two cases, Q1 to Q9, G1 to G6, U1 to U5, and W1 to W3.
    expect(registered['time, reads, commit and refusals']).toBe(89);
    // S1 to S6, A1 to A6, M1 to M15 and N1 to N8. P1 and P2 need a file, which the in-memory store has not.
    expect(registered['single-value rule and namespaces']).toBe(39);
    expect(registered['keyword lane']).toBe(5);
    expect(registered['vector lane']).toBe(6);
  });

  // Registered here, inside a describe that holds no store, only to count.
  const withoutGroups = describeMemoryStoreContract(
    'a store with every group left out',
    async () => createInMemoryStore(),
    {
      groups: [],
    },
  );

  it('registers no case of a group left out of the options', () => {
    expect(withoutGroups['time, reads, commit and refusals']).toBe(0);
    expect(Object.values(withoutGroups).every((count) => count === 0)).toBe(true);
  });
});
