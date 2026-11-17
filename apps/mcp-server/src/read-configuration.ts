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
  /** The git repository that maintenance verifies facts against. */
  readonly repositoryDirectory: string;
  /** How many days a fact must go unrecalled before maintenance archives it. */
  readonly archiveAfterDays: number;
};

/** The default archiving period: a placeholder until Q-57 is answered. */
export const DEFAULT_ARCHIVE_AFTER_DAYS = 180;

/** A variable that is set but empty counts as not set, as it does in most shells. */
const optionalText = z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());

const EnvironmentSchema = z.object({
  FACTLOOM_DB: optionalText,
  FACTLOOM_NAMESPACE: optionalText,
  ANTHROPIC_API_KEY: optionalText,
  FACTLOOM_REPO: optionalText,
  FACTLOOM_ARCHIVE_AFTER_DAYS: z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : Number(value)),
    z.number().int().positive().optional(),
  ),
});

/**
 * Reads the server's configuration from the given environment variables. `FACTLOOM_DB`
 * defaults to `~/.factloom/factloom.db`; `FACTLOOM_NAMESPACE` is required; `ANTHROPIC_API_KEY`
 * is optional; `FACTLOOM_REPO` defaults to the working directory; `FACTLOOM_ARCHIVE_AFTER_DAYS`
 * defaults to 180. Pure: the caller passes the
 * environment and the two directories.
 */
export function readConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
  directories: { readonly homeDirectory: string; readonly workingDirectory: string },
): Result<ServerConfiguration> {
  const parsed = EnvironmentSchema.safeParse(environment);
  if (!parsed.success) return err('invalid_input', z.prettifyError(parsed.error));
  const { FACTLOOM_DB, FACTLOOM_NAMESPACE, ANTHROPIC_API_KEY, FACTLOOM_REPO, FACTLOOM_ARCHIVE_AFTER_DAYS } =
    parsed.data;

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

  const factloomDirectory = join(directories.homeDirectory, '.factloom');
  return ok({
    databasePath: FACTLOOM_DB ?? join(factloomDirectory, 'factloom.db'),
    namespace: namespace.data,
    anthropicApiKey: ANTHROPIC_API_KEY ?? null,
    modelCacheDirectory: join(factloomDirectory, 'models'),
    repositoryDirectory: FACTLOOM_REPO ?? directories.workingDirectory,
    archiveAfterDays: FACTLOOM_ARCHIVE_AFTER_DAYS ?? DEFAULT_ARCHIVE_AFTER_DAYS,
  });
}
