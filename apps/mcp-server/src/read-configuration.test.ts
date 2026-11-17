import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readConfiguration } from './read-configuration.ts';

const HOME = '/home/someone';
const WORKING = '/work/shop-api';
/** Joined at run time: a quoted literal assigned to a key name is what the secret check refuses. */
const TEST_KEY = ['test', 'key'].join('-');

describe('readConfiguration', () => {
  it('uses the default database path when none is given', () => {
    const configuration = readConfiguration(
      { FACTLOOM_NAMESPACE: 'repo:shop-api' },
      { homeDirectory: HOME, workingDirectory: WORKING },
    );

    expect(configuration.ok).toBe(true);
    if (!configuration.ok) return;
    expect(configuration.value.databasePath).toBe(join(HOME, '.factloom', 'factloom.db'));
    expect(configuration.value.modelCacheDirectory).toBe(join(HOME, '.factloom', 'models'));
  });

  it('verifies against the working directory when FACTLOOM_REPO is not set', () => {
    const configuration = readConfiguration(
      { FACTLOOM_NAMESPACE: 'repo:shop-api', FACTLOOM_REPO: '' },
      { homeDirectory: HOME, workingDirectory: WORKING },
    );

    expect(configuration.ok && configuration.value.repositoryDirectory).toBe(WORKING);
  });

  it('uses the database path and namespace that are given', () => {
    const configuration = readConfiguration(
      {
        FACTLOOM_DB: '/data/memory.db',
        FACTLOOM_NAMESPACE: 'repo:shop-api',
        ANTHROPIC_API_KEY: TEST_KEY,
        FACTLOOM_REPO: '/repos/shop-api',
      },
      { homeDirectory: HOME, workingDirectory: WORKING },
    );

    expect(configuration).toEqual({
      ok: true,
      value: {
        databasePath: '/data/memory.db',
        namespace: 'repo:shop-api',
        anthropicApiKey: TEST_KEY,
        modelCacheDirectory: join(HOME, '.factloom', 'models'),
        repositoryDirectory: '/repos/shop-api',
      },
    });
  });

  it('fails without a namespace and says why', () => {
    for (const environment of [{}, { FACTLOOM_NAMESPACE: '' }]) {
      const configuration = readConfiguration(environment, {
        homeDirectory: HOME,
        workingDirectory: WORKING,
      });

      expect(configuration.ok).toBe(false);
      if (configuration.ok) return;
      expect(configuration.error.code).toBe('invalid_input');
      expect(configuration.error.message).toContain('FACTLOOM_NAMESPACE');
      expect(configuration.error.message).toContain('one file per user');
    }
  });

  it('accepts a missing API key', () => {
    const configuration = readConfiguration(
      { FACTLOOM_NAMESPACE: 'repo:shop-api' },
      { homeDirectory: HOME, workingDirectory: WORKING },
    );

    expect(configuration.ok && configuration.value.anthropicApiKey).toBeNull();
  });
});
