import { err, ok } from '@factloom/core';
import { describe, expect, it } from 'vitest';
import { createFileSourceAnchorer } from './anchor-file-source.ts';

const REPOSITORY = '/work/shipping-service';
const HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

const anchorer = createFileSourceAnchorer(REPOSITORY, () => Promise.resolve(ok(HEAD)));

describe('anchoring a file source', () => {
  it('anchors a path from the repository root at HEAD', async () => {
    expect(await anchorer('lib/labels.js')).toEqual({ locator: 'lib/labels.js', version: HEAD });
  });

  it('makes an absolute path inside the repository relative to its root', async () => {
    expect(await anchorer('/work/shipping-service/lib/labels.js')).toEqual({
      locator: 'lib/labels.js',
      version: HEAD,
    });
  });

  it('drops a leading ./ from the path', async () => {
    expect(await anchorer('./lib/labels.js')).toEqual({ locator: 'lib/labels.js', version: HEAD });
  });

  it('anchors nothing for a path outside the repository', async () => {
    expect(await anchorer('/etc/hosts')).toBeNull();
    expect(await anchorer('../other/lib/labels.js')).toBeNull();
  });

  it('anchors nothing when the repository cannot be read', async () => {
    const unreadable = createFileSourceAnchorer(REPOSITORY, () =>
      Promise.resolve(err('invalid_input', 'not a git repository')),
    );

    expect(await unreadable('lib/labels.js')).toBeNull();
  });
});
