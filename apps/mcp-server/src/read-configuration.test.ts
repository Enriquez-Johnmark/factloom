import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readConfiguration } from './read-configuration.ts';

const HOME = '/home/someone';

describe('readConfiguration', () => {
  it('uses the default database path when none is given', () => {
    const configuration = readConfiguration({ FACTLOOM_NAMESPACE: 'repo:shop-api' }, HOME);

    expect(configuration.ok).toBe(true);
    if (!configuration.ok) return;
    expect(configuration.value.databasePath).toBe(join(HOME, '.factloom', 'factloom.db'));
    expect(configuration.value.modelCacheDirectory).toBe(join(HOME, '.factloom', 'models'));
  });

  it('uses the database path and namespace that are given', () => {
    const configuration = readConfiguration(
      { FACTLOOM_DB: '/data/memory.db', FACTLOOM_NAMESPACE: 'repo:shop-api', ANTHROPIC_API_KEY: 'a-key' },
      HOME,
    );

    expect(configuration).toEqual({
      ok: true,
      value: {
        databasePath: '/data/memory.db',
        namespace: 'repo:shop-api',
        anthropicApiKey: 'a-key',
        modelCacheDirectory: join(HOME, '.factloom', 'models'),
      },
    });
  });

  it('fails without a namespace and says why', () => {
    for (const environment of [{}, { FACTLOOM_NAMESPACE: '' }]) {
      const configuration = readConfiguration(environment, HOME);

      expect(configuration.ok).toBe(false);
      if (configuration.ok) return;
      expect(configuration.error.code).toBe('invalid_input');
      expect(configuration.error.message).toContain('FACTLOOM_NAMESPACE');
      expect(configuration.error.message).toContain('one file per user');
    }
  });

  it('accepts a missing API key', () => {
    const configuration = readConfiguration({ FACTLOOM_NAMESPACE: 'repo:shop-api' }, HOME);

    expect(configuration.ok && configuration.value.anthropicApiKey).toBeNull();
  });
});
