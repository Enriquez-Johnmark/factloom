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
  | { readonly kind: 'list_proposals' }
  | { readonly kind: 'approve_proposal'; readonly proposalId: string }
  | { readonly kind: 'reject_proposal'; readonly proposalId: string }
  | { readonly kind: 'invalid'; readonly message: string };

const USAGE =
  'Usage: factloom maintenance | factloom purge sources <fact-id> | factloom purge source <source-id> --reason erasure_requested|secret_stored | factloom proposals list | factloom proposals approve|reject <proposal-id>';

/**
 * Reads the command from the arguments after the script. No argument serves MCP over stdio;
 * `maintenance` runs the maintenance jobs once (FL-048); `purge` lists the sources behind a
 * fact or purges one source (ADR 0012, FL-072). Purge is a command a person runs, never an
 * MCP tool. `proposals` lists pending proposals, or approves or rejects one (FL-070): a person
 * decides them, so it is never an MCP tool either.
 */
export function readCommand(args: readonly string[]): Command {
  if (args.length === 0) return { kind: 'serve' };
  const [command, form, id, flag, reason] = args;
  if (command === 'maintenance' && args.length === 1) return { kind: 'maintenance' };
  if (command === 'proposals') return readProposalsCommand(form, id, args.length);
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

/** The three forms of the proposals command. */
function readProposalsCommand(form: string | undefined, id: string | undefined, count: number): Command {
  if (form === 'list' && count === 2) return { kind: 'list_proposals' };
  if ((form === 'approve' || form === 'reject') && id !== undefined && count === 3) {
    return form === 'approve'
      ? { kind: 'approve_proposal', proposalId: id }
      : { kind: 'reject_proposal', proposalId: id };
  }
  return { kind: 'invalid', message: USAGE };
}
