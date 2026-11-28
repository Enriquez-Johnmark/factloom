// The healthcare demo of FL-094, on invented records only.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runHealthcareDemo } from './run-healthcare-demo.ts';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function newDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'kronomind-demo-test-'));
  directories.push(directory);
  return directory;
}

describe('the healthcare demo', () => {
  it('says it holds invented data on its first and last lines, and answers the four questions', async () => {
    const lines: string[] = [];

    const exitCode = await runHealthcareDemo({
      directory: newDirectory(),
      write: (line) => lines.push(line),
    });

    expect(exitCode).toBe(0);
    expect([lines[0], lines.at(-1)].map((line) => line?.startsWith('INVENTED DATA.'))).toEqual([true, true]);
    const text = lines.join('\n');
    for (const question of [
      '1. What waits for a clinician on 2026-05-03',
      '2. What is true now (2026-05-04)?',
      '3. What was true on 2026-03-15, as known now?',
      '4. What did memory believe on 2026-04-01, before the error was found?',
    ]) {
      expect(text).toContain(question);
    }
    expect(text).toContain('proposed retraction: Invented Patient A is allergic to penicillin.');
    expect(text).toContain('proposed succession: Invented Patient A takes metformin.');
  });

  it('keeps its memory in the directory it is given, and nowhere else', async () => {
    const directory = newDirectory();

    await runHealthcareDemo({ directory, write: () => {} });

    expect(readdirSync(directory).filter((name) => !name.startsWith('demo.db'))).toEqual([]);
  });

  it('runs from the entry point with no namespace, and never creates the configured database', () => {
    const configured = join(newDirectory(), 'mine.db');
    const { KRONOMIND_NAMESPACE: _namespace, ...environment } = process.env;

    const run = spawnSync(process.execPath, [join(import.meta.dirname, 'main.ts'), 'demo', 'healthcare'], {
      env: { ...environment, KRONOMIND_DB: configured },
      encoding: 'utf8',
    });

    expect(run.status).toBe(0);
    expect(run.stdout.startsWith('INVENTED DATA.')).toBe(true);
    expect(existsSync(configured)).toBe(false);
  });
});
