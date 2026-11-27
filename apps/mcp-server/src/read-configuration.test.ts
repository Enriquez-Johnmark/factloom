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
      { KRONOMIND_NAMESPACE: 'repo:shop-api' },
      { homeDirectory: HOME, workingDirectory: WORKING },
    );

    expect(configuration.ok).toBe(true);
    if (!configuration.ok) return;
    expect(configuration.value.databasePath).toBe(join(HOME, '.kronomind', 'kronomind.db'));
    expect(configuration.value.modelCacheDirectory).toBe(join(HOME, '.kronomind', 'models'));
  });

  it('archives after the days given in KRONOMIND_ARCHIVE_AFTER_DAYS, and refuses a number that is not a whole positive one', () => {
    const given = readConfiguration(
      { KRONOMIND_NAMESPACE: 'repo:shop-api', KRONOMIND_ARCHIVE_AFTER_DAYS: '90' },
      { homeDirectory: HOME, workingDirectory: WORKING },
    );
    const refused = readConfiguration(
      { KRONOMIND_NAMESPACE: 'repo:shop-api', KRONOMIND_ARCHIVE_AFTER_DAYS: 'soon' },
      { homeDirectory: HOME, workingDirectory: WORKING },
    );

    expect(given.ok && given.value.archiveAfterDays).toBe(90);
    expect(refused.ok ? null : refused.error.code).toBe('invalid_input');
  });

  it('verifies against the working directory when KRONOMIND_REPO is not set', () => {
    const configuration = readConfiguration(
      { KRONOMIND_NAMESPACE: 'repo:shop-api', KRONOMIND_REPO: '' },
      { homeDirectory: HOME, workingDirectory: WORKING },
    );

    expect(configuration.ok && configuration.value.repositoryDirectory).toBe(WORKING);
  });

  it('uses the database path and namespace that are given', () => {
    const configuration = readConfiguration(
      {
        KRONOMIND_DB: '/data/memory.db',
        KRONOMIND_NAMESPACE: 'repo:shop-api',
        ANTHROPIC_API_KEY: TEST_KEY,
        KRONOMIND_REPO: '/repos/shop-api',
      },
      { homeDirectory: HOME, workingDirectory: WORKING },
    );

    expect(configuration).toEqual({
      ok: true,
      value: {
        databasePath: '/data/memory.db',
        namespace: 'repo:shop-api',
        anthropicApiKey: TEST_KEY,
        modelCacheDirectory: join(HOME, '.kronomind', 'models'),
        repositoryDirectory: '/repos/shop-api',
        archiveAfterDays: 180,
      },
    });
  });

  it('fails without a namespace and says why', () => {
    for (const environment of [{}, { KRONOMIND_NAMESPACE: '' }]) {
      const configuration = readConfiguration(environment, {
        homeDirectory: HOME,
        workingDirectory: WORKING,
      });

      expect(configuration.ok).toBe(false);
      if (configuration.ok) return;
      expect(configuration.error.code).toBe('invalid_input');
      expect(configuration.error.message).toContain('KRONOMIND_NAMESPACE');
      expect(configuration.error.message).toContain('one file per user');
    }
  });

  it('accepts a missing API key', () => {
    const configuration = readConfiguration(
      { KRONOMIND_NAMESPACE: 'repo:shop-api' },
      { homeDirectory: HOME, workingDirectory: WORKING },
    );

    expect(configuration.ok && configuration.value.anthropicApiKey).toBeNull();
  });
});
