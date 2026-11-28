// Every patient and medication below is invented. No record of a real person is used.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { healthcareDomain } from '@kronomind/adapters';
import { createTestDeps } from '@kronomind/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runImportCommand } from './run-import-command.ts';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function writeTemporary(name: string, text: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'kronomind-import-'));
  directories.push(directory);
  const path = join(directory, name);
  writeFileSync(path, text);
  return path;
}

function runOn(path: string) {
  const lines: string[] = [];
  const deps = {
    ...createTestDeps({ now: '2026-03-01', domain: healthcareDomain }),
    namespace: 'patients:invented',
    write: (line: string) => lines.push(line),
  };
  return { lines, exitCode: runImportCommand(deps, { path }) };
}

const ReportSchema = z.object({ entries: z.array(z.object({ resource: z.string(), outcome: z.string() })) });

describe('the import fhir command', () => {
  it('imports the resources of a file and writes the report as one JSON document', async () => {
    const path = writeTemporary(
      'bundle.json',
      JSON.stringify({
        resourceType: 'Bundle',
        entry: [
          {
            resource: {
              resourceType: 'MedicationStatement',
              id: 'invented-ms-1',
              status: 'active',
              medicationCodeableConcept: { text: 'metformin' },
              subject: { reference: 'Patient/invented-a', display: 'Invented Patient A' },
              effectiveDateTime: '2026-01-10',
            },
          },
        ],
      }),
    );

    const run = runOn(path);

    expect(await run.exitCode).toBe(0);
    expect(run.lines).toHaveLength(1);
    expect(ReportSchema.parse(JSON.parse(run.lines[0] ?? '')).entries).toEqual([
      expect.objectContaining({ resource: 'MedicationStatement/invented-ms-1', outcome: 'recorded' }),
    ]);
  });

  it('refuses a file that is not JSON and exits with 1', async () => {
    const run = runOn(writeTemporary('notes.txt', 'not json'));

    expect(await run.exitCode).toBe(1);
    expect(run.lines[0]?.startsWith('invalid_input:')).toBe(true);
  });
});
