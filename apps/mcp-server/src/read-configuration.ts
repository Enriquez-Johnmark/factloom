import { join } from 'node:path';
import { type Domain, err, type Namespace, NamespaceSchema, ok, type Result } from '@kronomind/core';
import { z } from 'zod';
import { KNOWN_DOMAINS } from './known-domains.ts';

/** What the server needs to know from its environment. */
export type ServerConfiguration = {
  readonly databasePath: string;
  readonly namespace: Namespace;
  /** The domain the tools and commands run under. */
  readonly domain: Domain;
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
  KRONOMIND_DB: optionalText,
  KRONOMIND_NAMESPACE: optionalText,
  KRONOMIND_DOMAIN: optionalText,
  ANTHROPIC_API_KEY: optionalText,
  KRONOMIND_REPO: optionalText,
  KRONOMIND_ARCHIVE_AFTER_DAYS: z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : Number(value)),
    z.number().int().positive().optional(),
  ),
});

/**
 * Reads the server's configuration from the given environment variables. `KRONOMIND_DB`
 * defaults to `~/.kronomind/kronomind.db`; `KRONOMIND_NAMESPACE` is required; `ANTHROPIC_API_KEY`
 * is optional; `KRONOMIND_REPO` defaults to the working directory; `KRONOMIND_ARCHIVE_AFTER_DAYS`
 * defaults to 180; `KRONOMIND_DOMAIN` names one of the known domains and defaults to software
 * development. Pure: the caller passes the
 * environment and the two directories.
 */
export function readConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
  directories: { readonly homeDirectory: string; readonly workingDirectory: string },
): Result<ServerConfiguration> {
  const parsed = EnvironmentSchema.safeParse(environment);
  if (!parsed.success) return err('invalid_input', z.prettifyError(parsed.error));
  const {
    KRONOMIND_DB,
    KRONOMIND_NAMESPACE,
    KRONOMIND_DOMAIN,
    ANTHROPIC_API_KEY,
    KRONOMIND_REPO,
    KRONOMIND_ARCHIVE_AFTER_DAYS,
  } = parsed.data;

  if (KRONOMIND_NAMESPACE === undefined) {
    return err(
      'invalid_input',
      'KRONOMIND_NAMESPACE is not set. Set it to a name for this repository, such as repo:shop-api. ' +
        'There is no default: the default database is one file per user, so a shared namespace would mix the memory of every repository.',
    );
  }
  const namespace = NamespaceSchema.safeParse(KRONOMIND_NAMESPACE);
  if (!namespace.success) {
    return err(
      'invalid_input',
      `KRONOMIND_NAMESPACE is not a valid namespace. ${z.prettifyError(namespace.error)}`,
    );
  }

  const domain =
    KRONOMIND_DOMAIN === undefined
      ? KNOWN_DOMAINS[0]
      : KNOWN_DOMAINS.find((known) => known.name === KRONOMIND_DOMAIN);
  if (domain === undefined) {
    const names = KNOWN_DOMAINS.map((known) => known.name).join(', ');
    return err(
      'invalid_input',
      `KRONOMIND_DOMAIN "${KRONOMIND_DOMAIN}" is not a known domain. Use one of: ${names}.`,
    );
  }

  const kronomindDirectory = join(directories.homeDirectory, '.kronomind');
  return ok({
    databasePath: KRONOMIND_DB ?? join(kronomindDirectory, 'kronomind.db'),
    namespace: namespace.data,
    domain,
    anthropicApiKey: ANTHROPIC_API_KEY ?? null,
    modelCacheDirectory: join(kronomindDirectory, 'models'),
    repositoryDirectory: KRONOMIND_REPO ?? directories.workingDirectory,
    archiveAfterDays: KRONOMIND_ARCHIVE_AFTER_DAYS ?? DEFAULT_ARCHIVE_AFTER_DAYS,
  });
}
