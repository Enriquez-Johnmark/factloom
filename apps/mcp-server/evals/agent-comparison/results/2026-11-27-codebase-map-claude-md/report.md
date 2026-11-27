# Token and tool-call comparison with and without Factloom

| | |
|---|---|
| Agent | Claude Code 2.1.332 (without); 2.1.332 (with) |
| Model | claude-sonnet-5-5 (without); claude-sonnet-5-5 (with) |
| Date | 2026-11-27 (without); 2026-11-27 (with) |
| Tasks | 10 in the set of code base map tasks of FL-082, the run without Factloom starting from a hand-written CLAUDE.md map, 10 compared; each in two sessions per configuration |

## Result

A cost. With Factloom, the median task used 15.5% more tokens, input and output together, and as many tool calls; 10 of 10 checks passed with Factloom and 10 of 10 without it.

10 tasks show a direction, not a law: this is not a claim of statistical significance.

Every figure is from the agent's own usage output: tokens from `modelUsage` in each session's result event, tool calls from the `tool_use` blocks of its assistant events. Input tokens include those written to and read from the prompt cache. Nothing is estimated. A task's figures are the sum of its two sessions.

## Totals

| Figure | Without Factloom | With Factloom | Difference |
|---|---|---|---|
| Input tokens | 4,044,142 | 4,465,108 | +420,966 |
| of which read from the cache | 3,672,611 | 4,096,825 | +424,214 |
| Output tokens | 69,587 | 70,086 | +499 |
| Tool calls | 217 | 222 | +5 |
| Checks passed | 10 of 10 | 10 of 10 | 0 |

## Medians

| Figure | Median of the per-task differences, with minus without |
|---|---|
| Input tokens | +52,891 |
| Output tokens | +356.5 |
| Tool calls | 0 |
| Input and output tokens, as a share of the figure without | +15.5% |

## Per task

| Task | Input without | Input with | Output without | Output with | Tool calls without | Tool calls with | Check without | Check with | Token change |
|---|---|---|---|---|---|---|---|---|---|
| late-fee-cap | 407,557 | 539,787 | 5,672 | 7,455 | 19 | 29 | pass | pass | +32.4% |
| renewal-waiting-hold | 325,828 | 364,950 | 6,278 | 5,592 | 19 | 18 | pass | pass | +11.6% |
| branch-closures | 693,514 | 801,472 | 14,614 | 13,701 | 42 | 38 | pass | pass | +15.1% |
| expired-hold-next-in-line | 443,245 | 386,793 | 8,025 | 7,177 | 22 | 19 | pass | pass | -12.7% |
| sms-notice-length | 501,799 | 425,537 | 8,791 | 7,330 | 30 | 20 | pass | pass | -15.2% |
| hold-queue-order | 342,701 | 411,141 | 4,702 | 5,075 | 15 | 17 | pass | pass | +19.8% |
| selfcheck-card-numbers | 340,288 | 358,984 | 4,696 | 5,042 | 16 | 16 | pass | pass | +5.5% |
| waived-fees | 331,238 | 412,690 | 4,611 | 5,535 | 17 | 19 | pass | pass | +24.5% |
| accent-search | 250,508 | 291,003 | 4,546 | 5,160 | 16 | 16 | pass | pass | +16.1% |
| member-loans-route | 407,464 | 472,751 | 7,652 | 8,019 | 21 | 30 | pass | pass | +15.8% |

## Tool calls by tool

| Tool | Without Factloom | With Factloom |
|---|---|---|
| `Bash` | 94 | 103 |
| `Edit` | 66 | 70 |
| `Read` | 56 | 43 |
| `ToolSearch` | 0 | 2 |
| `Write` | 1 | 1 |
| `bash` | 0 | 1 |
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
| late-fee-cap | with | 1 | 306,696 | 4,604 | 15 | 16 | success |  |
| late-fee-cap | with | 2 | 233,091 | 2,851 | 14 | 15 | success | pass |
| renewal-waiting-hold | with | 1 | 151,342 | 2,188 | 8 | 9 | success |  |
| renewal-waiting-hold | with | 2 | 213,608 | 3,404 | 10 | 11 | success | pass |
| branch-closures | with | 1 | 403,964 | 7,195 | 18 | 19 | success |  |
| branch-closures | with | 2 | 397,508 | 6,506 | 20 | 21 | success | pass |
| expired-hold-next-in-line | with | 1 | 200,340 | 2,620 | 9 | 10 | success |  |
| expired-hold-next-in-line | with | 2 | 186,453 | 4,557 | 10 | 11 | success | pass |
| sms-notice-length | with | 1 | 245,963 | 3,813 | 11 | 12 | success |  |
| sms-notice-length | with | 2 | 179,574 | 3,517 | 9 | 10 | success | pass |
| hold-queue-order | with | 1 | 209,738 | 2,786 | 8 | 9 | success |  |
| hold-queue-order | with | 2 | 201,403 | 2,289 | 9 | 10 | success | pass |
| selfcheck-card-numbers | with | 1 | 188,641 | 2,582 | 8 | 9 | success |  |
| selfcheck-card-numbers | with | 2 | 170,343 | 2,460 | 8 | 9 | success | pass |
| waived-fees | with | 1 | 173,763 | 2,563 | 9 | 10 | success |  |
| waived-fees | with | 2 | 238,927 | 2,972 | 10 | 11 | success | pass |
| accent-search | with | 1 | 146,418 | 2,799 | 10 | 11 | success |  |
| accent-search | with | 2 | 144,585 | 2,361 | 6 | 7 | success | pass |
| member-loans-route | with | 1 | 253,809 | 4,252 | 13 | 14 | success |  |
| member-loans-route | with | 2 | 218,942 | 3,767 | 17 | 18 | success | pass |

## How it was run

- Without Factloom, started 2026-11-27T06:42:04.275Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__*`
- With Factloom, started 2026-11-27T06:24:00.605Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__* --settings {"autoMemoryEnabled":false,"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$FACTLOOM_COMPARISON_NODE\" \"$FACTLOOM_COMPARISON_SERVER_ENTRY\" hook recall"}]}],"SessionStart":[{"matcher":"startup","hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$FACTLOOM_COMPARISON_NODE\" \"$FACTLOOM_COMPARISON_SERVER_ENTRY\" maintenance > /dev/null"}]}]}} --mcp-config <mcp-config.json>`

## Changes to the task set

None since the task set was committed.
