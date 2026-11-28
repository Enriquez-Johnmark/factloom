import type { Command } from './read-command.ts';
import { type ImportCommandDeps, runImportCommand } from './run-import-command.ts';
import { type ProposalsCommandDeps, runProposalsCommand } from './run-proposals-command.ts';
import { type PurgeCommandDeps, runPurgeCommand } from './run-purge-command.ts';

/** A command a person runs, which is not an MCP server: purge (FL-072), proposals (FL-070) or the FHIR import (FL-092). */
export type PersonCommand = Exclude<
  Command,
  | { readonly kind: 'serve' }
  | { readonly kind: 'maintenance' }
  | { readonly kind: 'recall_hook' }
  | { readonly kind: 'demo_healthcare' }
>;

/** Runs a command a person runs and returns its exit code. The one place a command argument is routed. */
export function runPersonCommand(
  deps: PurgeCommandDeps & ProposalsCommandDeps & ImportCommandDeps,
  command: PersonCommand,
): Promise<number> {
  switch (command.kind) {
    case 'list_proposals':
    case 'approve_proposal':
    case 'reject_proposal':
      return runProposalsCommand(deps, command);
    case 'import_fhir':
      return runImportCommand(deps, command);
    case 'list_sources':
    case 'purge':
    case 'invalid':
      return runPurgeCommand(deps, command);
    default: {
      const unhandled: never = command;
      throw new Error(`Unhandled command: ${JSON.stringify(unhandled)}`);
    }
  }
}
