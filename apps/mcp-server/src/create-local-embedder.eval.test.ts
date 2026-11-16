// The local embedder with the real model. These run under `pnpm eval`, not `pnpm check`. The
// model is kept in .cache/models at the repository root, which git ignores and the eval job
// keeps between runs. The first run on a machine downloads it from huggingface.co.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLocalEmbedder } from './create-local-embedder.ts';

const appDirectory = join(import.meta.dirname, '..');
const cacheDirectory = join(appDirectory, '..', '..', '.cache', 'models');
const embedder = createLocalEmbedder({ cacheDirectory, allowDownload: true });

/** The first load can include the download. */
const LOAD_TIMEOUT = 300_000;

async function embed(
  texts: readonly string[],
  purpose: 'statement' | 'question',
): Promise<readonly Float32Array[]> {
  const embedded = await embedder.embed(texts, purpose);
  if (!embedded.ok) throw new Error(embedded.error.message);
  return embedded.value;
}

/** The dot product, which is the cosine similarity of two unit vectors. */
function similarity(first: Float32Array, second: Float32Array): number {
  return first.reduce((sum, value, index) => sum + value * (second[index] ?? 0), 0);
}

describe('createLocalEmbedder with the real model', () => {
  it(
    'returns one unit vector of 384 values for each text, in order',
    async () => {
      const texts = ['The shop API uses vitest.', 'The billing worker reads events from kafka.'];

      const together = await embed(texts, 'statement');
      const alone = [
        ...(await embed([texts[0] ?? ''], 'statement')),
        ...(await embed([texts[1] ?? ''], 'statement')),
      ];

      expect(together).toHaveLength(2);
      for (const vector of together) {
        expect(vector).toHaveLength(384);
        expect(Math.sqrt(similarity(vector, vector))).toBeCloseTo(1, 5);
      }
      // With the quantised model a text's vector shifts slightly with the other texts of its
      // batch (similarity about 0.997), so the order is shown by each vector being nearest to
      // its own text embedded alone.
      const [first, second] = together;
      const [firstAlone, secondAlone] = alone;
      if (!first || !second || !firstAlone || !secondAlone) throw new Error('Two vectors were expected.');
      expect(similarity(first, firstAlone)).toBeGreaterThan(0.99);
      expect(similarity(second, secondAlone)).toBeGreaterThan(0.99);
      expect(similarity(first, firstAlone)).toBeGreaterThan(similarity(first, secondAlone));
      expect(similarity(second, secondAlone)).toBeGreaterThan(similarity(second, firstAlone));
    },
    LOAD_TIMEOUT,
  );

  it('returns an empty list for an empty list', async () => {
    expect(await embed([], 'statement')).toEqual([]);
  });

  it(
    'embeds a question differently from the same text as a statement',
    async () => {
      const text = 'Which test runner does the shop API use?';

      const [asStatement] = await embed([text], 'statement');
      const [asQuestion] = await embed([text], 'question');

      expect(similarity(asStatement ?? new Float32Array(), asQuestion ?? new Float32Array())).toBeLessThan(
        0.9999,
      );
    },
    LOAD_TIMEOUT,
  );

  it(
    'returns the same vector for the same text on two calls',
    async () => {
      const [first] = await embed(['The shop API uses vitest.'], 'statement');
      const [second] = await embed(['The shop API uses vitest.'], 'statement');

      expect(second).toEqual(first);
    },
    LOAD_TIMEOUT,
  );

  it(
    'scores a statement nearer to its paraphrase than to an unrelated statement',
    async () => {
      const [statement, paraphrase, unrelated] = await embed(
        [
          'The shop API uses vitest for its unit tests.',
          'Unit tests of the shop API run on vitest.',
          'The billing worker reads its events from kafka.',
        ],
        'statement',
      );
      if (statement === undefined || paraphrase === undefined || unrelated === undefined) {
        throw new Error('Three vectors were expected.');
      }

      expect(similarity(statement, paraphrase)).toBeGreaterThan(similarity(statement, unrelated));
    },
    LOAD_TIMEOUT,
  );

  it(
    'writes nothing to standard output',
    () => {
      // A child process, so that only the embedder's output is on its standard output.
      const script = [
        `import { createLocalEmbedder } from ${JSON.stringify(join(import.meta.dirname, 'create-local-embedder.ts'))};`,
        `const embedder = createLocalEmbedder({ cacheDirectory: ${JSON.stringify(cacheDirectory)}, allowDownload: true });`,
        `const embedded = await embedder.embed(['The shop API uses vitest.'], 'statement');`,
        `if (!embedded.ok) { process.stderr.write(embedded.error.message); process.exit(1); }`,
      ].join('\n');

      const standardOutput = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
        cwd: appDirectory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      });

      expect(standardOutput).toBe('');
    },
    LOAD_TIMEOUT,
  );
});
