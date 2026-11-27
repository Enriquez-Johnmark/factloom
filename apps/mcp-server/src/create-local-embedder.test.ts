// The local embedder's tests that need no model. They run under `pnpm check`, with an empty
// cache directory and downloading turned off, so they need no network. The tests that load
// the model are in create-local-embedder.eval.test.ts and run under `pnpm eval`.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalEmbedder } from './create-local-embedder.ts';

const directories: string[] = [];

function createEmptyCacheDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'kronomind-models-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('createLocalEmbedder', () => {
  it('reports its model and dimensions before the model is loaded', () => {
    const cacheDirectory = createEmptyCacheDirectory();

    const embedder = createLocalEmbedder({ cacheDirectory, allowDownload: false });

    expect(embedder.dimensions).toBe(384);
    expect(embedder.model).toBe('Xenova/bge-small-en-v1.5@ea104dacec62c0de699686887e3f920caeb4f3e3:q8:cls');
    expect(readdirSync(cacheDirectory)).toEqual([]);
  });

  it('returns embedding_failed when the model files are missing and cannot be fetched', async () => {
    const embedder = createLocalEmbedder({
      cacheDirectory: createEmptyCacheDirectory(),
      allowDownload: false,
    });

    const embedded = await embedder.embed(['The shop API uses vitest.'], 'statement');

    expect(embedded.ok).toBe(false);
    if (embedded.ok) return;
    expect(embedded.error.code).toBe('embedding_failed');
    expect(embedded.error.message).toContain('huggingface.co');
  });
});
