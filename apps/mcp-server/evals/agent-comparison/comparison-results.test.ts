import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Configuration } from './compare-runs.ts';
import type { TaskSetName } from './task-sets.ts';
import {
  appendRunLogEntry,
  type Baseline,
  findRunLogPath,
  hideHomeDirectory,
  readRunLog,
  type SessionEntry,
  writeCheckedFile,
  writeReport,
} from './comparison-results.ts';

const directories: string[] = [];
function createResultsDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'factloom-comparison-results-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function sessionEntry(taskId: string, session: 1 | 2, inputTokens: number): SessionEntry {
  return {
    kind: 'session',
    taskId,
    session,
    rawFile: `raw/${taskId}-${session}.jsonl`,
    exitCode: 0,
    hasTimedOut: false,
    usage: {
      agentVersion: '2.1.332',
      model: 'claude-test-model',
      modelsUsed: ['claude-test-model'],
      mcpServers: [],
      uncachedInputTokens: inputTokens,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      outputTokens: 10,
      toolCalls: { Read: 1 },
      resultSubtype: 'success',
      isError: false,
      turns: 2,
      resultEvents: 1,
    },
    problem: null,
  };
}

function logRun(
  directory: string,
  configuration: Configuration,
  inputTokens: number,
  taskSet: TaskSetName = 'memory',
  baseline: Baseline = 'as-shipped',
): void {
  appendRunLogEntry(directory, configuration, {
    kind: 'run',
    configuration,
    taskSet,
    baseline,
    startedAt: '2026-11-30T10:00:00.000Z',
    agentVersion: '2.1.332 (Claude Code)',
    agentArguments: ['-p', '<prompt>'],
    nodeVersion: 'v22.23.4',
    platform: 'darwin arm64',
  });
  appendRunLogEntry(directory, configuration, sessionEntry('refund-rounding', 1, inputTokens));
  appendRunLogEntry(directory, configuration, sessionEntry('refund-rounding', 2, inputTokens));
  appendRunLogEntry(directory, configuration, {
    kind: 'check',
    taskId: 'refund-rounding',
    passed: true,
    outputFile: null,
  });
}

describe('the results directory', () => {
  it('reads back a run log as it was appended', () => {
    const directory = createResultsDirectory();
    logRun(directory, 'without', 500);
    appendRunLogEntry(directory, 'without', { kind: 'finished', finishedAt: '2026-11-30T11:00:00.000Z' });

    const log = readRunLog(directory, 'without');

    expect(log?.run.platform).toBe('darwin arm64');
    expect(log?.sessions.map((entry) => entry.session)).toEqual([1, 2]);
    expect(log?.checks).toHaveLength(1);
    expect(log?.finishedAt).toBe('2026-11-30T11:00:00.000Z');
  });

  it('builds the report from the run logs of both configurations', () => {
    const directory = createResultsDirectory();
    logRun(directory, 'without', 500);
    logRun(directory, 'with', 250);

    const report = readFileSync(writeReport(directory), 'utf8');

    expect(report).toContain('| refund-rounding | 1,000 | 500 |');
    expect(report).toContain('| Tasks | 10 in the set of memory tasks of FL-074, 1 compared;');
  });

  it('reads a run log that names no task set, written before FL-081, as one of the memory tasks', () => {
    const directory = createResultsDirectory();
    const runLine = {
      kind: 'run',
      configuration: 'without',
      startedAt: '2026-11-26T09:27:00.528Z',
      agentVersion: '2.1.332 (Claude Code)',
      agentArguments: ['-p', '<prompt>'],
      nodeVersion: 'v26.13.1',
      platform: 'darwin arm64',
    };
    writeFileSync(findRunLogPath(directory, 'without'), `${JSON.stringify(runLine)}\n`);

    expect(readRunLog(directory, 'without')?.run.taskSet).toBe('memory');
  });

  it('refuses to build one report from run logs of two task sets', () => {
    const directory = createResultsDirectory();
    logRun(directory, 'without', 500, 'memory');
    logRun(directory, 'with', 250, 'change-history');

    expect(() => writeReport(directory)).toThrow(/different task sets/);
  });

  it('says in the report when the run without Factloom started from a CLAUDE.md map', () => {
    const directory = createResultsDirectory();
    logRun(directory, 'without', 500, 'memory', 'claude-md');
    logRun(directory, 'with', 250);

    const report = readFileSync(writeReport(directory), 'utf8');

    expect(report).toContain('the run without Factloom starting from a hand-written CLAUDE.md map');
  });

  it('records the task set a run log names', () => {
    const directory = createResultsDirectory();
    logRun(directory, 'with', 500, 'memory');

    expect(readRunLog(directory, 'with')?.run.taskSet).toBe('memory');
  });

  it('withholds a file that holds a credential and says why without repeating it', () => {
    const directory = createResultsDirectory();
    const credential = ['https://', 'deploy', ':', 'hunter2horse', '@', 'git.example.com/shop.git'].join('');
    const path = join(directory, 'raw', 'leaky.jsonl');

    const withheld = writeCheckedFile(path, `{"type":"user","text":"clone ${credential}"}\n`);

    expect(withheld).not.toBeNull();
    expect(withheld).not.toContain('hunter2horse');
    expect(existsSync(path)).toBe(false);
  });
});

describe('the output kept in the results', () => {
  it('shows the home directory as ~, so that a user name in a path is not published', () => {
    const output = '{"cwd":"/Users/ana/work","file":"/Users/ana/.claude/projects/x/memory/MEMORY.md"}';

    expect(hideHomeDirectory(output, '/Users/ana')).toBe(
      '{"cwd":"~/work","file":"~/.claude/projects/x/memory/MEMORY.md"}',
    );
  });

  it('leaves a path that only starts like the home directory unchanged', () => {
    expect(hideHomeDirectory('/Users/anabel/notes', '/Users/ana')).toBe('/Users/anabel/notes');
  });
});
