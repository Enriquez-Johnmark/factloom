import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  buildClaudeArguments,
  buildKronomindHookEnvironment,
  buildKronomindRunSettings,
  KRONOMIND_RUN_SETTINGS,
  buildKronomindMcpConfig,
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
      'Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__kronomind__*',
      '--settings',
      KRONOMIND_RUN_SETTINGS,
      '--mcp-config',
      '/tmp/mcp.json',
    ]);
    expect(args).toContain('--strict-mcp-config');
    expect(args.join(' ')).toContain('--output-format stream-json --verbose');
    expect(args.join(' ')).toContain('--model sonnet');
  });

  it('differs between the configurations only by the server configuration and auto memory turned off', () => {
    const without = buildClaudeArguments({ prompt: 'x', model: null, mcpConfigPath: null });
    const withKronomind = buildClaudeArguments({ prompt: 'x', model: null, mcpConfigPath: '/tmp/mcp.json' });

    expect(withKronomind).toEqual([
      ...without,
      '--settings',
      KRONOMIND_RUN_SETTINGS,
      '--mcp-config',
      '/tmp/mcp.json',
    ]);
    expect(without).not.toContain('--model');
  });

  it('turns auto memory off and registers the recall hook in the run with Kronomind', () => {
    const settings = z
      .object({
        autoMemoryEnabled: z.literal(false),
        hooks: z.object({
          UserPromptSubmit: z.array(
            z.object({ hooks: z.array(z.object({ type: z.literal('command'), command: z.string() })) }),
          ),
        }),
      })
      .parse(JSON.parse(KRONOMIND_RUN_SETTINGS));

    expect(settings.hooks.UserPromptSubmit[0]?.hooks[0]?.command).toBe(
      'ANTHROPIC_API_KEY= "$KRONOMIND_COMPARISON_NODE" "$KRONOMIND_COMPARISON_SERVER_ENTRY" hook recall',
    );
  });

  it('gives the hook the server, database and namespace of the run through the environment', () => {
    expect(
      buildKronomindHookEnvironment({
        nodePath: '/usr/bin/node',
        serverEntry: '/f/apps/mcp-server/src/main.ts',
        databasePath: '/tmp/x/kronomind.db',
        namespace: 'eval:agent-comparison:utc-dates:run',
        repositoryDirectory: '/tmp/invoice-service-1',
      }),
    ).toEqual({
      KRONOMIND_COMPARISON_NODE: '/usr/bin/node',
      KRONOMIND_COMPARISON_SERVER_ENTRY: '/f/apps/mcp-server/src/main.ts',
      KRONOMIND_DB: '/tmp/x/kronomind.db',
      KRONOMIND_NAMESPACE: 'eval:agent-comparison:utc-dates:run',
      KRONOMIND_REPO: '/tmp/invoice-service-1',
    });
  });

  it('runs maintenance at session start, with its report kept out of the context, when the task set asks for it', () => {
    const settings = z
      .object({
        autoMemoryEnabled: z.literal(false),
        hooks: z.object({
          UserPromptSubmit: z.array(z.unknown()).length(1),
          SessionStart: z.array(
            z.object({
              matcher: z.literal('startup'),
              hooks: z.array(z.object({ type: z.literal('command'), command: z.string() })),
            }),
          ),
        }),
      })
      .parse(JSON.parse(buildKronomindRunSettings({ runsMaintenance: true })));

    expect(settings.hooks.SessionStart[0]?.hooks[0]?.command).toBe(
      'ANTHROPIC_API_KEY= "$KRONOMIND_COMPARISON_NODE" "$KRONOMIND_COMPARISON_SERVER_ENTRY" maintenance > /dev/null',
    );
  });

  it('runs no maintenance hook unless the task set asks for it', () => {
    expect(buildKronomindRunSettings({ runsMaintenance: false })).toBe(KRONOMIND_RUN_SETTINGS);
    expect(KRONOMIND_RUN_SETTINGS).not.toContain('SessionStart');
  });

  it('keeps auto memory, as shipped, in the run without Kronomind', () => {
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
  it('registers Kronomind with its own database, namespace and repository and no key of its own', () => {
    const config: unknown = JSON.parse(
      buildKronomindMcpConfig({
        nodePath: '/usr/bin/node',
        serverEntry: '/repo/apps/mcp-server/src/main.ts',
        databasePath: '/tmp/run/kronomind.db',
        namespace: 'eval:agent-comparison:refund-rounding:1',
        repositoryDirectory: '/tmp/invoice-service-1',
      }),
    );

    expect(config).toEqual({
      mcpServers: {
        kronomind: {
          type: 'stdio',
          command: '/usr/bin/node',
          args: ['/repo/apps/mcp-server/src/main.ts'],
          env: {
            KRONOMIND_NAMESPACE: 'eval:agent-comparison:refund-rounding:1',
            KRONOMIND_DB: '/tmp/run/kronomind.db',
            KRONOMIND_REPO: '/tmp/invoice-service-1',
            ANTHROPIC_API_KEY: '',
          },
        },
      },
    });
  });
});

describe('the servers a session reports', () => {
  it('accepts Kronomind connected in a run with it', () => {
    expect(
      findServerProblem(usageWithServers([{ name: 'kronomind', status: 'connected' }]), 'with'),
    ).toBeNull();
  });

  it('refuses a run with Kronomind in which it is missing or did not connect', () => {
    expect(findServerProblem(usageWithServers([]), 'with')).not.toBeNull();
    expect(
      findServerProblem(usageWithServers([{ name: 'kronomind', status: 'failed' }]), 'with'),
    ).not.toBeNull();
  });

  it('refuses a run without Kronomind in which it was loaded', () => {
    expect(findServerProblem(usageWithServers([]), 'without')).toBeNull();
    expect(
      findServerProblem(usageWithServers([{ name: 'kronomind', status: 'connected' }]), 'without'),
    ).not.toBeNull();
  });
});
