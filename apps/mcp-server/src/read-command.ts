/** What the entry point is asked to do, from its arguments. */
export type Command =
  | { readonly kind: 'serve' }
  | { readonly kind: 'maintenance' }
  | { readonly kind: 'list_sources'; readonly factId: string }
  | {
      readonly kind: 'purge';
      readonly sourceId: string;
      readonly reason: 'erasure_requested' | 'secret_stored';
    }
  | { readonly kind: 'invalid'; readonly message: string };

const USAGE =
  'Usage: factloom maintenance | factloom purge sources <fact-id> | factloom purge source <source-id> --reason erasure_requested|secret_stored';

/**
 * Reads the command from the arguments after the script. No argument serves MCP over stdio;
 * `maintenance` runs the maintenance jobs once (FL-048); `purge` lists the sources behind a
 * fact or purges one source (ADR 0012, FL-072). Purge is a command a person runs, never an
 * MCP tool.
 */
export function readCommand(args: readonly string[]): Command {
  if (args.length === 0) return { kind: 'serve' };
  const [command, form, id, flag, reason] = args;
  if (command === 'maintenance' && args.length === 1) return { kind: 'maintenance' };
  if (command !== 'purge') return { kind: 'invalid', message: `Unknown command "${command}". ${USAGE}` };
  if (form === 'sources' && id !== undefined && args.length === 3)
    return { kind: 'list_sources', factId: id };
  if (form === 'source' && id !== undefined) {
    if (flag !== '--reason' || reason === undefined || args.length !== 5) {
      return {
        kind: 'invalid',
        message: `A purge needs a reason: --reason erasure_requested or --reason secret_stored. ${USAGE}`,
      };
    }
    if (reason !== 'erasure_requested' && reason !== 'secret_stored') {
      return {
        kind: 'invalid',
        message: `The reason "${reason}" is not one of erasure_requested, secret_stored.`,
      };
    }
    return { kind: 'purge', sourceId: id, reason };
  }
  return { kind: 'invalid', message: USAGE };
}
