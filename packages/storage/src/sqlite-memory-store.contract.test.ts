import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryStore } from '@factloom/core';
import { afterAll, describe, expect, it } from 'vitest';
import { describeMemoryStoreContract } from './memory-store-contract.ts';
import { openSqliteMemoryStore } from './open-sqlite-memory-store.ts';
import { FIXTURE_MODEL } from './sqlite-test-store.ts';

const directories: string[] = [];

function open(path: string): MemoryStore {
  const opened = openSqliteMemoryStore({ path, ...FIXTURE_MODEL });
  if (!opened.ok) throw new Error(opened.error.message);
  return opened.value;
}

afterAll(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

const registered = describeMemoryStoreContract('the SQLite store', async () => open(':memory:'), {
  openTwoStoresOnOneFile: async () => {
    const directory = mkdtempSync(join(tmpdir(), 'factloom-contract-'));
    directories.push(directory);
    const path = join(directory, 'factloom.db');
    return [open(path), open(path)];
  },
});

describe('the contract suite against SQLite', () => {
  it('registers every case of every group, with none turned off', () => {
    expect(registered['time, reads, commit and refusals']).toBe(43);
    // The seventeen cases the in-memory store runs, and P1 for two stores on one file.
    expect(registered['single-value rule and namespaces']).toBe(18);
    expect(registered['keyword lane']).toBe(5);
    expect(registered['vector lane']).toBe(6);
  });
});
