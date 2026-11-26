import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  buildClaudeArguments,
  buildFactloomHookEnvironment,
  FACTLOOM_RUN_SETTINGS,
  buildFactloomMcpConfig,
  describeClaudeArguments,
  findServerProblem,
} from './play-claude-session.ts';
import type { SessionUsage } from './read-claude-stream.ts';

function usageWithServers(mcpServers: SessionUsage['mcpServers']): SessionUsage {
  return {
    agentVersion: '2.1.332',
    model: 'claude-test-model',
    modelsUsed: [],
    mcpServers,
    uncachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
    toolCalls: {},
    resultSubtype: 'success',
    isError: false,
    turns: 1,
    resultEvents: 1,
  };
}

describe('the arguments of a session', () => {
  it('puts the prompt right after -p and the options that take several values last', () => {
    const args = buildClaudeArguments({
      prompt: 'Add a route.',
      model: 'sonnet',
      mcpConfigPath: '/tmp/mcp.json',
    });

    expect(args.slice(0, 2)).toEqual(['-p', 'Add a route.']);
    expect(args.slice(-6)).toEqual([
      '--allowedTools',
      'Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__*',
      '--settings',
      FACTLOOM_RUN_SETTINGS,
      '--mcp-config',
      '/tmp/mcp.json',
    ]);
    expect(args).toContain('--strict-mcp-config');
    expect(args.join(' ')).toContain('--output-format stream-json --verbose');
    expect(args.join(' ')).toContain('--model sonnet');
  });

  it('differs between the configurations only by the server configuration and auto memory turned off', () => {
    const without = buildClaudeArguments({ prompt: 'x', model: null, mcpConfigPath: null });
    const withFactloom = buildClaudeArguments({ prompt: 'x', model: null, mcpConfigPath: '/tmp/mcp.json' });

    expect(withFactloom).toEqual([
      ...without,
      '--settings',
      FACTLOOM_RUN_SETTINGS,
      '--mcp-config',
      '/tmp/mcp.json',
    ]);
    expect(without).not.toContain('--model');
  });

  it('turns auto memory off and registers the recall hook in the run with Factloom', () => {
    const settings = z
      .object({
        autoMemoryEnabled: z.literal(false),
        hooks: z.object({
          UserPromptSubmit: z.array(
            z.object({ hooks: z.array(z.object({ type: z.literal('command'), command: z.string() })) }),
          ),
        }),
      })
      .parse(JSON.parse(FACTLOOM_RUN_SETTINGS));

    expect(settings.hooks.UserPromptSubmit[0]?.hooks[0]?.command).toBe(
      'ANTHROPIC_API_KEY= "$FACTLOOM_COMPARISON_NODE" "$FACTLOOM_COMPARISON_SERVER_ENTRY" hook recall',
    );
  });

  it('gives the hook the server, database and namespace of the run through the environment', () => {
    expect(
      buildFactloomHookEnvironment({
        nodePath: '/usr/bin/node',
        serverEntry: '/f/apps/mcp-server/src/main.ts',
        databasePath: '/tmp/x/factloom.db',
        namespace: 'eval:agent-comparison:utc-dates:run',
      }),
    ).toEqual({
      FACTLOOM_COMPARISON_NODE: '/usr/bin/node',
      FACTLOOM_COMPARISON_SERVER_ENTRY: '/f/apps/mcp-server/src/main.ts',
      FACTLOOM_DB: '/tmp/x/factloom.db',
      FACTLOOM_NAMESPACE: 'eval:agent-comparison:utc-dates:run',
    });
  });

  it('keeps auto memory, as shipped, in the run without Factloom', () => {
    const without = buildClaudeArguments({ prompt: 'x', model: null, mcpConfigPath: null });

    expect(without).not.toContain('--settings');
  });

  it('records the arguments without the prompt or the temporary path', () => {
    const args = buildClaudeArguments({
      prompt: 'A decision from finance.',
      model: null,
      mcpConfigPath: '/tmp/a.json',
    });

    const described = describeClaudeArguments(args);

    expect(described).toContain('<prompt>');
    expect(described).toContain('<mcp-config.json>');
    expect(described.join(' ')).not.toContain('A decision from finance.');
    expect(described.join(' ')).not.toContain('/tmp/a.json');
  });
});

describe('the server configuration', () => {
  it('registers Factloom with its own database and namespace and no key of its own', () => {
    const config: unknown = JSON.parse(
      buildFactloomMcpConfig({
        nodePath: '/usr/bin/node',
        serverEntry: '/repo/apps/mcp-server/src/main.ts',
        databasePath: '/tmp/run/factloom.db',
        namespace: 'eval:agent-comparison:refund-rounding:1',
      }),
    );

    expect(config).toEqual({
      mcpServers: {
        factloom: {
          type: 'stdio',
          command: '/usr/bin/node',
          args: ['/repo/apps/mcp-server/src/main.ts'],
          env: {
            FACTLOOM_NAMESPACE: 'eval:agent-comparison:refund-rounding:1',
            FACTLOOM_DB: '/tmp/run/factloom.db',
            ANTHROPIC_API_KEY: '',
          },
        },
      },
    });
  });
});

describe('the servers a session reports', () => {
  it('accepts Factloom connected in a run with it', () => {
    expect(
      findServerProblem(usageWithServers([{ name: 'factloom', status: 'connected' }]), 'with'),
    ).toBeNull();
  });

  it('refuses a run with Factloom in which it is missing or did not connect', () => {
    expect(findServerProblem(usageWithServers([]), 'with')).not.toBeNull();
    expect(
      findServerProblem(usageWithServers([{ name: 'factloom', status: 'failed' }]), 'with'),
    ).not.toBeNull();
  });

  it('refuses a run without Factloom in which it was loaded', () => {
    expect(findServerProblem(usageWithServers([]), 'without')).toBeNull();
    expect(
      findServerProblem(usageWithServers([{ name: 'factloom', status: 'connected' }]), 'without'),
    ).not.toBeNull();
  });
});
