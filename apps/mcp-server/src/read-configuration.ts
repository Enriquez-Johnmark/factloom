import { join } from 'node:path';
import { err, type Namespace, NamespaceSchema, ok, type Result } from '@factloom/core';
import { z } from 'zod';

/** What the server needs to know from its environment. */
export type ServerConfiguration = {
  readonly databasePath: string;
  readonly namespace: Namespace;
  /** Null when no key is set: the server still starts, and only extraction fails. */
  readonly anthropicApiKey: string | null;
  /** Where the local embedding model is kept: `models` beside the default database. */
  readonly modelCacheDirectory: string;
};

/** A variable that is set but empty counts as not set, as it does in most shells. */
const optionalText = z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());

const EnvironmentSchema = z.object({
  FACTLOOM_DB: optionalText,
  FACTLOOM_NAMESPACE: optionalText,
  ANTHROPIC_API_KEY: optionalText,
});

/**
 * Reads the server's configuration from the given environment variables. `FACTLOOM_DB`
 * defaults to `~/.factloom/factloom.db`; `FACTLOOM_NAMESPACE` is required; `ANTHROPIC_API_KEY`
 * is optional. Pure: the caller passes the environment and the home directory.
 */
export function readConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
  homeDirectory: string,
): Result<ServerConfiguration> {
  const parsed = EnvironmentSchema.safeParse(environment);
  if (!parsed.success) return err('invalid_input', z.prettifyError(parsed.error));
  const { FACTLOOM_DB, FACTLOOM_NAMESPACE, ANTHROPIC_API_KEY } = parsed.data;

  if (FACTLOOM_NAMESPACE === undefined) {
    return err(
      'invalid_input',
      'FACTLOOM_NAMESPACE is not set. Set it to a name for this repository, such as repo:shop-api. ' +
        'There is no default: the default database is one file per user, so a shared namespace would mix the memory of every repository.',
    );
  }
  const namespace = NamespaceSchema.safeParse(FACTLOOM_NAMESPACE);
  if (!namespace.success) {
    return err(
      'invalid_input',
      `FACTLOOM_NAMESPACE is not a valid namespace. ${z.prettifyError(namespace.error)}`,
    );
  }

  const factloomDirectory = join(homeDirectory, '.factloom');
  return ok({
    databasePath: FACTLOOM_DB ?? join(factloomDirectory, 'factloom.db'),
    namespace: namespace.data,
    anthropicApiKey: ANTHROPIC_API_KEY ?? null,
    modelCacheDirectory: join(factloomDirectory, 'models'),
  });
}
