import { createInMemoryStore } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { describeMemoryStoreContract } from './memory-store-contract.ts';

const registered = describeMemoryStoreContract('the in-memory store', async () => createInMemoryStore());

describe('the contract suite', () => {
  it('registers every case of the first group for a store that runs it', () => {
    // T1 to T8, R1 to R14, C1 to C8, and F1 to F10 with F5 in two cases.
    expect(registered['time, reads, commit and refusals']).toBe(41);
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
