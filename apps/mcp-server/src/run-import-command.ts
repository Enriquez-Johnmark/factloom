import { readFileSync } from 'node:fs';
import { importFhirResources } from '@kronomind/adapters';
import { err, type Namespace, type OperationDeps, ok, type Result } from '@kronomind/core';

export type ImportCommandDeps = OperationDeps & {
  readonly namespace: Namespace;
  /** Writes one line for the person running the command. */
  readonly write: (line: string) => void;
};

/** Reads a JSON file, or says why it could not. */
function readJsonFile(path: string): Result<unknown> {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return err('invalid_input', `The file ${path} could not be read.`);
  }
  try {
    return ok(JSON.parse(text));
  } catch {
    return err('invalid_input', `The file ${path} is not JSON.`);
  }
}

/**
 * Runs `import fhir <file>` (FL-092) and returns the exit code: reads a FHIR Bundle or a list
 * of resources from the file, imports it with the trigger `person`, and writes the report as
 * one JSON document. Exits with 1 when the file is refused or a resource failed. It holds no
 * rule about facts: the import is one use case.
 */
export async function runImportCommand(
  deps: ImportCommandDeps,
  command: { readonly path: string },
): Promise<number> {
  const read = readJsonFile(command.path);
  if (!read.ok) {
    deps.write(`${read.error.code}: ${read.error.message}`);
    return 1;
  }
  const imported = await importFhirResources(deps, {
    namespace: deps.namespace,
    document: read.value,
    trigger: 'person',
  });
  if (!imported.ok) {
    deps.write(`${imported.error.code}: ${imported.error.message}`);
    return 1;
  }
  deps.write(JSON.stringify(imported.value));
  return imported.value.entries.some((entry) => entry.outcome === 'failed') ? 1 : 0;
}
