# Token and tool-call comparison with and without Factloom

| | |
|---|---|
| Agent | Claude Code 2.1.332 (without); 2.1.332 (with) |
| Model | claude-sonnet-5-5 (without); claude-sonnet-5-5 (with) |
| Date | 2026-11-27 (without); 2026-11-27 (with) |
| Tasks | 10 in the set of code base map tasks of FL-082, 10 compared; each in two sessions per configuration |

## Result

No clear difference. With Factloom, the median task's tokens, input and output together, changed by +5.5%, which is inside the 10% either way that this report counts as no clear difference; it made as many tool calls, and 10 of 10 checks passed with Factloom and 10 of 10 without it.

10 tasks show a direction, not a law: this is not a claim of statistical significance.

Every figure is from the agent's own usage output: tokens from `modelUsage` in each session's result event, tool calls from the `tool_use` blocks of its assistant events. Input tokens include those written to and read from the prompt cache. Nothing is estimated. A task's figures are the sum of its two sessions.

## Totals

| Figure | Without Factloom | With Factloom | Difference |
|---|---|---|---|
| Input tokens | 4,182,772 | 4,465,108 | +282,336 |
| of which read from the cache | 3,806,932 | 4,096,825 | +289,893 |
| Output tokens | 71,567 | 70,086 | -1,481 |
| Tool calls | 215 | 222 | +7 |
| Checks passed | 10 of 10 | 10 of 10 | 0 |

## Medians

| Figure | Median of the per-task differences, with minus without |
|---|---|
| Input tokens | +21,174.5 |
| Output tokens | -413.5 |
| Tool calls | 0 |
| Input and output tokens, as a share of the figure without | +5.5% |

## Per task

| Task | Input without | Input with | Output without | Output with | Tool calls without | Tool calls with | Check without | Check with | Token change |
|---|---|---|---|---|---|---|---|---|---|
| late-fee-cap | 470,832 | 539,787 | 6,446 | 7,455 | 22 | 29 | pass | pass | +14.7% |
| renewal-waiting-hold | 340,077 | 364,950 | 6,423 | 5,592 | 18 | 18 | pass | pass | +6.9% |
| branch-closures | 575,395 | 801,472 | 11,602 | 13,701 | 29 | 38 | pass | pass | +38.9% |
| expired-hold-next-in-line | 491,135 | 386,793 | 8,599 | 7,177 | 26 | 19 | pass | pass | -21.2% |
| sms-notice-length | 474,709 | 425,537 | 7,441 | 7,330 | 23 | 20 | pass | pass | -10.2% |
| hold-queue-order | 393,665 | 411,141 | 6,447 | 5,075 | 19 | 17 | pass | pass | +4.0% |
| selfcheck-card-numbers | 272,240 | 358,984 | 4,541 | 5,042 | 16 | 16 | pass | pass | +31.5% |
| waived-fees | 410,949 | 412,690 | 5,184 | 5,535 | 19 | 19 | pass | pass | +0.5% |
| accent-search | 351,640 | 291,003 | 6,149 | 5,160 | 21 | 16 | pass | pass | -17.2% |
| member-loans-route | 402,130 | 472,751 | 8,735 | 8,019 | 22 | 30 | pass | pass | +17.0% |

## Tool calls by tool

| Tool | Without Factloom | With Factloom |
|---|---|---|
| `Bash` | 102 | 103 |
| `Edit` | 67 | 70 |
| `Read` | 44 | 43 |
| `ToolSearch` | 0 | 2 |
| `Write` | 1 | 1 |
| `bash` | 1 | 1 |
| `mcp__factloom__record_fact` | 0 | 2 |

## Sessions

| Task | Configuration | Session | Input tokens | Output tokens | Tool calls | Turns | Result | Check |
|---|---|---|---|---|---|---|---|---|
| late-fee-cap | without | 1 | 292,922 | 3,456 | 12 | 13 | success |  |
| late-fee-cap | without | 2 | 177,910 | 2,990 | 10 | 11 | success | pass |
| renewal-waiting-hold | without | 1 | 179,891 | 2,375 | 9 | 10 | success |  |
| renewal-waiting-hold | without | 2 | 160,186 | 4,048 | 9 | 10 | success | pass |
| branch-closures | without | 1 | 273,190 | 5,774 | 14 | 15 | success |  |
| branch-closures | without | 2 | 302,205 | 5,828 | 15 | 16 | success | pass |
| expired-hold-next-in-line | without | 1 | 182,817 | 3,644 | 11 | 12 | success |  |
| expired-hold-next-in-line | without | 2 | 308,318 | 4,955 | 15 | 16 | success | pass |
| sms-notice-length | without | 1 | 269,306 | 3,520 | 13 | 14 | success |  |
| sms-notice-length | without | 2 | 205,403 | 3,921 | 10 | 11 | success | pass |
| hold-queue-order | without | 1 | 217,705 | 3,441 | 10 | 11 | success |  |
| hold-queue-order | without | 2 | 175,960 | 3,006 | 9 | 10 | success | pass |
| selfcheck-card-numbers | without | 1 | 124,723 | 1,916 | 9 | 10 | success |  |
| selfcheck-card-numbers | without | 2 | 147,517 | 2,625 | 7 | 8 | success | pass |
| waived-fees | without | 1 | 202,461 | 2,588 | 10 | 11 | success |  |
| waived-fees | without | 2 | 208,488 | 2,596 | 9 | 10 | success | pass |
| accent-search | without | 1 | 180,017 | 4,030 | 13 | 14 | success |  |
| accent-search | without | 2 | 171,623 | 2,119 | 8 | 9 | success | pass |
| member-loans-route | without | 1 | 197,241 | 3,924 | 11 | 12 | success |  |
| member-loans-route | without | 2 | 204,889 | 4,811 | 11 | 12 | success | pass |
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

- Without Factloom, started 2026-11-27T06:12:33.624Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__*`
- With Factloom, started 2026-11-27T06:24:00.605Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__* --settings {"autoMemoryEnabled":false,"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$FACTLOOM_COMPARISON_NODE\" \"$FACTLOOM_COMPARISON_SERVER_ENTRY\" hook recall"}]}],"SessionStart":[{"matcher":"startup","hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$FACTLOOM_COMPARISON_NODE\" \"$FACTLOOM_COMPARISON_SERVER_ENTRY\" maintenance > /dev/null"}]}]}} --mcp-config <mcp-config.json>`

## Changes to the task set

None since the task set was committed.
