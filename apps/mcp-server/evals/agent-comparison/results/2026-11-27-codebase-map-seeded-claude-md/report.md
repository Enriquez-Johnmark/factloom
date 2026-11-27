# Token and tool-call comparison with and without Factloom

| | |
|---|---|
| Agent | Claude Code 2.1.332 (without); 2.1.332 (with) |
| Model | claude-sonnet-5-5 (without); claude-sonnet-5-5 (with) |
| Date | 2026-11-27 (without); 2026-11-27 (with) |
| Tasks | 10 in the set of code base map tasks of FL-082, the run without Factloom starting from a hand-written CLAUDE.md map, 10 compared; each in two sessions per configuration |

## Result

No clear difference. With Factloom, the median task's tokens, input and output together, changed by +1.8%, which is inside the 10% either way that this report counts as no clear difference; it made 1 more tool call, and 10 of 10 checks passed with Factloom and 10 of 10 without it.

10 tasks show a direction, not a law: this is not a claim of statistical significance.

Every figure is from the agent's own usage output: tokens from `modelUsage` in each session's result event, tool calls from the `tool_use` blocks of its assistant events. Input tokens include those written to and read from the prompt cache. Nothing is estimated. A task's figures are the sum of its two sessions.

## Totals

| Figure | Without Factloom | With Factloom | Difference |
|---|---|---|---|
| Input tokens | 4,044,142 | 3,866,020 | -178,122 |
| of which read from the cache | 3,672,611 | 3,516,353 | -156,258 |
| Output tokens | 69,587 | 64,479 | -5,108 |
| Tool calls | 217 | 209 | -8 |
| Checks passed | 10 of 10 | 10 of 10 | 0 |

## Medians

| Figure | Median of the per-task differences, with minus without |
|---|---|
| Input tokens | +6,325 |
| Output tokens | -112 |
| Tool calls | +1 |
| Input and output tokens, as a share of the figure without | +1.8% |

## Per task

| Task | Input without | Input with | Output without | Output with | Tool calls without | Tool calls with | Check without | Check with | Token change |
|---|---|---|---|---|---|---|---|---|---|
| late-fee-cap | 407,557 | 439,025 | 5,672 | 6,064 | 19 | 23 | pass | pass | +7.7% |
| renewal-waiting-hold | 325,828 | 339,351 | 6,278 | 5,846 | 19 | 19 | pass | pass | +3.9% |
| branch-closures | 693,514 | 480,961 | 14,614 | 9,110 | 42 | 22 | pass | pass | -30.8% |
| expired-hold-next-in-line | 443,245 | 304,021 | 8,025 | 6,035 | 22 | 16 | pass | pass | -31.3% |
| sms-notice-length | 501,799 | 422,137 | 8,791 | 7,076 | 30 | 27 | pass | pass | -15.9% |
| hold-queue-order | 342,701 | 396,564 | 4,702 | 5,720 | 15 | 17 | pass | pass | +15.8% |
| selfcheck-card-numbers | 340,288 | 432,660 | 4,696 | 6,586 | 16 | 25 | pass | pass | +27.3% |
| waived-fees | 331,238 | 401,112 | 4,611 | 4,819 | 17 | 19 | pass | pass | +20.9% |
| accent-search | 250,508 | 243,598 | 4,546 | 6,334 | 16 | 15 | pass | pass | -2.0% |
| member-loans-route | 407,464 | 406,591 | 7,652 | 6,889 | 21 | 26 | pass | pass | -0.4% |

## Tool calls by tool

| Tool | Without Factloom | With Factloom |
|---|---|---|
| `Bash` | 94 | 81 |
| `Edit` | 66 | 66 |
| `Read` | 56 | 57 |
| `ToolSearch` | 0 | 2 |
| `Write` | 1 | 1 |
| `mcp__factloom__record_fact` | 0 | 2 |

## Sessions

| Task | Configuration | Session | Input tokens | Output tokens | Tool calls | Turns | Result | Check |
|---|---|---|---|---|---|---|---|---|
| late-fee-cap | without | 1 | 216,314 | 2,962 | 10 | 11 | success |  |
| late-fee-cap | without | 2 | 191,243 | 2,710 | 9 | 10 | success | pass |
| renewal-waiting-hold | without | 1 | 126,366 | 1,560 | 7 | 8 | success |  |
| renewal-waiting-hold | without | 2 | 199,462 | 4,718 | 12 | 13 | success | pass |
| branch-closures | without | 1 | 315,552 | 7,358 | 20 | 21 | success |  |
| branch-closures | without | 2 | 377,962 | 7,256 | 22 | 23 | success | pass |
| expired-hold-next-in-line | without | 1 | 177,560 | 2,527 | 9 | 10 | success |  |
| expired-hold-next-in-line | without | 2 | 265,685 | 5,498 | 13 | 14 | success | pass |
| sms-notice-length | without | 1 | 258,722 | 4,783 | 17 | 18 | success |  |
| sms-notice-length | without | 2 | 243,077 | 4,008 | 13 | 14 | success | pass |
| hold-queue-order | without | 1 | 181,944 | 2,615 | 8 | 9 | success |  |
| hold-queue-order | without | 2 | 160,757 | 2,087 | 7 | 8 | success | pass |
| selfcheck-card-numbers | without | 1 | 151,634 | 1,648 | 8 | 9 | success |  |
| selfcheck-card-numbers | without | 2 | 188,654 | 3,048 | 8 | 9 | success | pass |
| waived-fees | without | 1 | 206,110 | 2,737 | 9 | 10 | success |  |
| waived-fees | without | 2 | 125,128 | 1,874 | 8 | 9 | success | pass |
| accent-search | without | 1 | 99,886 | 2,357 | 8 | 9 | success |  |
| accent-search | without | 2 | 150,622 | 2,189 | 8 | 9 | success | pass |
| member-loans-route | without | 1 | 204,314 | 3,456 | 11 | 12 | success |  |
| member-loans-route | without | 2 | 203,150 | 4,196 | 10 | 11 | success | pass |
| late-fee-cap | with | 1 | 226,126 | 3,160 | 12 | 13 | success |  |
| late-fee-cap | with | 2 | 212,899 | 2,904 | 11 | 12 | success | pass |
| renewal-waiting-hold | with | 1 | 150,832 | 2,139 | 8 | 9 | success |  |
| renewal-waiting-hold | with | 2 | 188,519 | 3,707 | 11 | 12 | success | pass |
| branch-closures | with | 1 | 259,089 | 5,378 | 13 | 14 | success |  |
| branch-closures | with | 2 | 221,872 | 3,732 | 9 | 10 | success | pass |
| expired-hold-next-in-line | with | 1 | 172,340 | 2,145 | 8 | 9 | success |  |
| expired-hold-next-in-line | with | 2 | 131,681 | 3,890 | 8 | 9 | success | pass |
| sms-notice-length | with | 1 | 239,963 | 3,644 | 17 | 18 | success |  |
| sms-notice-length | with | 2 | 182,174 | 3,432 | 10 | 11 | success | pass |
| hold-queue-order | with | 1 | 245,385 | 3,357 | 10 | 11 | success |  |
| hold-queue-order | with | 2 | 151,179 | 2,363 | 7 | 8 | success | pass |
| selfcheck-card-numbers | with | 1 | 186,325 | 2,926 | 12 | 13 | success |  |
| selfcheck-card-numbers | with | 2 | 246,335 | 3,660 | 13 | 14 | success | pass |
| waived-fees | with | 1 | 224,358 | 2,627 | 11 | 12 | success |  |
| waived-fees | with | 2 | 176,754 | 2,192 | 8 | 9 | success | pass |
| accent-search | with | 1 | 119,146 | 3,669 | 7 | 8 | success |  |
| accent-search | with | 2 | 124,452 | 2,665 | 8 | 9 | success | pass |
| member-loans-route | with | 1 | 184,842 | 3,099 | 9 | 10 | success |  |
| member-loans-route | with | 2 | 221,749 | 3,790 | 17 | 18 | success | pass |

## How it was run

- Without Factloom, started 2026-11-27T06:42:04.275Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__*`
- With Factloom, started 2026-11-27T08:24:06.612Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__* --settings {"autoMemoryEnabled":false,"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$FACTLOOM_COMPARISON_NODE\" \"$FACTLOOM_COMPARISON_SERVER_ENTRY\" hook recall"}]}],"SessionStart":[{"matcher":"startup","hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$FACTLOOM_COMPARISON_NODE\" \"$FACTLOOM_COMPARISON_SERVER_ENTRY\" maintenance > /dev/null"}]}]}} --mcp-config <mcp-config.json>`

## Changes to the task set

None since the task set was committed.
