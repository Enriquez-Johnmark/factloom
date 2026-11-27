import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('the record command for the judge cases', () => {
  it('the record command refuses to run without an API key', () => {
    const home = mkdtempSync(join(tmpdir(), 'kronomind-record-'));
    try {
      const run = spawnSync(process.execPath, [join(import.meta.dirname, 'record-judge.ts')], {
        env: { PATH: process.env.PATH ?? '', HOME: home },
        encoding: 'utf8',
      });

      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain('ANTHROPIC_API_KEY is not set');
      expect(run.stdout).toBe('');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
